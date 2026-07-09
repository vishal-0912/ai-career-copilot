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
// jobs itself stays a shared pool (so two users searching the same role don't pay for
// duplicate embeddings), but every job matched by THIS search — new or already-existing —
// gets linked to this user via user_jobs, which is what match_jobs_for_user() reads from.
// Without that link a job never appears in this user's feed, even though it lives in the
// shared pool.
router.post('/refresh', async (req, res) => {
  const { userId, what, where } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!what) {
    return res.status(400).json({ error: 'what (role/keywords) is required' });
  }

  // Snapshot of jobs already in this user's feed BEFORE this refresh. upsertJobsWithEmbeddings's
  // saved/alreadyStored/duplicatesSkipped counts describe the SHARED jobs pool (e.g. "already
  // had" means another user's earlier search already saved this listing) — which is technically
  // true but misleading to show a user directly, since a job can be brand new to THEIR feed even
  // though it was "already stored" in the pool. We report against this snapshot instead.
  const { data: existingLinks, error: existingLinksError } = await supabase
    .from('user_jobs')
    .select('job_id')
    .eq('user_id', userId);
  if (existingLinksError) console.error('Could not load existing user_jobs:', existingLinksError.message);
  const linkedJobIds = new Set((existingLinks || []).map((r) => r.job_id));

  // Mutates linkedJobIds as it goes, so if the same job is matched by both sources in this
  // same refresh (e.g. an Adzuna listing that JSearch's loose dedup also matches), it's only
  // counted as "new to your feed" once, under whichever source reported it first.
  function tallyForUser(matchedJobIds) {
    let newToYourFeed = 0;
    let alreadyInYourFeed = 0;
    for (const id of matchedJobIds) {
      if (linkedJobIds.has(id)) {
        alreadyInYourFeed++;
      } else {
        newToYourFeed++;
        linkedJobIds.add(id);
      }
    }
    return { newToYourFeed, alreadyInYourFeed };
  }

  const sources = {};
  const allMatchedJobIds = new Set();

  // Adzuna
  try {
    const rawJobs = await searchAdzunaJobs({ what, where });
    const result = await upsertJobsWithEmbeddings(rawJobs);
    result.matchedJobIds.forEach((id) => allMatchedJobIds.add(id));
    const { newToYourFeed, alreadyInYourFeed } = tallyForUser(result.matchedJobIds);
    sources.adzuna = {
      fetched: rawJobs.length,
      newToYourFeed,
      alreadyInYourFeed,
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
      result.matchedJobIds.forEach((id) => allMatchedJobIds.add(id));
      const { newToYourFeed, alreadyInYourFeed } = tallyForUser(result.matchedJobIds);
      sources.jsearch = {
        fetched: rawJobs.length,
        newToYourFeed,
        alreadyInYourFeed,
        failed: result.failed,
      };
    } catch (err) {
      console.error('JSearch refresh failed:', err.message);
      sources.jsearch = { error: err.message };
    }
  } else {
    sources.jsearch = { skipped: 'RAPIDAPI_JSEARCH_KEY not configured' };
  }

  if (allMatchedJobIds.size > 0) {
    const rows = [...allMatchedJobIds].map((jobId) => ({ user_id: userId, job_id: jobId }));
    const { error: linkError } = await supabase
      .from('user_jobs')
      .upsert(rows, { onConflict: 'user_id,job_id', ignoreDuplicates: true });
    if (linkError) console.error('Could not link matched jobs to user:', linkError.message);
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
