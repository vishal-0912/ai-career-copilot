const express = require('express');
const { searchAdzunaJobs } = require('../lib/adzuna');
const { searchJSearchJobs } = require('../lib/jsearch');
const { upsertJobsWithEmbeddings } = require('../lib/jobs');
const { supabase } = require('../lib/supabase');

const router = express.Router();

// POST /api/jobs/refresh  { userId, what, where }
// Pulls fresh listings from every configured source (Adzuna always; JSearch too if
// RAPIDAPI_JSEARCH_KEY is set) for the given role/location, and stores + embeds them.
// Sources are queried independently so one failing (rate limit, bad key, etc.) doesn't
// block the other — each reports its own breakdown (new / already had / duplicate /
// failed) in the response, from upsertJobsWithEmbeddings()'s dedup logic.
// userId isn't used for the search itself — kept in the payload for future
// per-user logging/rate-limiting.
router.post('/refresh', async (req, res) => {
  const { what, where } = req.body;

  if (!what) {
    return res.status(400).json({ error: 'what (role/keywords) is required' });
  }

  const sources = {};

  // Adzuna
  try {
    const rawJobs = await searchAdzunaJobs({ what, where });
    const result = await upsertJobsWithEmbeddings(rawJobs);
    sources.adzuna = {
      fetched: rawJobs.length,
      saved: result.saved.length,
      alreadyStored: result.alreadyStored,
      duplicatesSkipped: result.duplicatesSkipped,
      failed: result.failed,
    };
  } catch (err) {
    console.error('Adzuna refresh failed:', err.message);
    sources.adzuna = { error: err.message };
  }

  // JSearch — optional, only runs if a key is configured
  if (process.env.RAPIDAPI_JSEARCH_KEY) {
    try {
      const rawJobs = await searchJSearchJobs({ what, where });
      const result = await upsertJobsWithEmbeddings(rawJobs);
      sources.jsearch = {
        fetched: rawJobs.length,
        saved: result.saved.length,
        alreadyStored: result.alreadyStored,
        duplicatesSkipped: result.duplicatesSkipped,
        failed: result.failed,
      };
    } catch (err) {
      console.error('JSearch refresh failed:', err.message);
      sources.jsearch = { error: err.message };
    }
  } else {
    sources.jsearch = { skipped: 'RAPIDAPI_JSEARCH_KEY not configured' };
  }

  res.json({ sources });
});

// GET /api/jobs/feed?userId=...
// Returns jobs ranked by match % for this user, via the match_jobs_for_user() SQL function.
// Ranks across every source (Adzuna, JSearch, imported) together — the feed doesn't care
// where a job came from, only how well it matches.
router.get('/feed', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const { data, error } = await supabase.rpc('match_jobs_for_user', { p_user_id: userId });
    if (error) throw error;
    res.json({ jobs: data ?? [] });
  } catch (err) {
    console.error('jobs/feed failed:', err);
    res.status(500).json({ error: err.message ?? 'Failed to load feed' });
  }
});

module.exports = router;
