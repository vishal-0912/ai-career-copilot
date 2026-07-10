const express = require('express');
const crypto = require('crypto');
const { fetchPageText } = require('../lib/scrape');
const { extractJobFromText } = require('../lib/claude');
const { embedText } = require('../lib/embeddings');
const { supabase } = require('../lib/supabase');
const { dedupKey, sourceKey } = require('../lib/jobs');

const router = express.Router();

// Splits on commas AND newlines so both "paste one after another" and
// "comma-separated" work, trims whitespace, drops empties, and dedupes.
function splitUrls(raw) {
  return [...new Set(
    raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
  )];
}

// POST /api/import/jobs  { userId, urls: "one or more URLs, comma- or newline-separated" }
// Processes URLs one at a time (deliberately sequential — keeps this gentle on both the
// target sites and the Claude/embedding rate limits) and returns a per-URL result so the
// frontend can show which ones succeeded and which didn't.
router.post('/jobs', async (req, res) => {
  const { userId, urls } = req.body;

  if (!userId || !urls) {
    return res.status(400).json({ error: 'userId and urls are required' });
  }

  const urlList = splitUrls(urls);
  if (urlList.length === 0) {
    return res.status(400).json({ error: 'No valid URLs found in input' });
  }

  // Same two-layer dedup as lib/jobs.js#upsertJobsWithEmbeddings, so importing a URL for a
  // job that's already in the shared pool (fetched earlier via Adzuna/JSearch, or imported
  // before) links to that existing row instead of creating a duplicate card in the feed.
  const { data: existingJobs, error: existingJobsError } = await supabase
    .from('jobs')
    .select('id, source, external_id, title, company');
  if (existingJobsError) {
    console.error('Could not load existing jobs for import dedup:', existingJobsError.message);
  }
  const sourceKeyToId = new Map((existingJobs || []).map((j) => [sourceKey(j.source, j.external_id), j.id]));
  const dedupKeyToId = new Map((existingJobs || []).map((j) => [dedupKey(j.title, j.company), j.id]));

  const results = [];

  for (const url of urlList) {
    let queueId = null;

    try {
      const { data: queueRow, error: queueError } = await supabase
        .from('import_queue')
        .insert({ user_id: userId, raw_url: url, status: 'pending' })
        .select()
        .single();
      if (queueError) throw queueError;
      queueId = queueRow.id;

      const pageText = await fetchPageText(url);
      const parsed = await extractJobFromText(pageText);

      if (parsed.error) throw new Error(parsed.error);
      if (!parsed.title) throw new Error('Could not identify a job title on this page');

      // Imported jobs don't have a natural external_id like Adzuna does, so we
      // derive a stable one from the URL itself — re-importing the same URL
      // updates the existing row instead of creating a duplicate.
      const externalId = crypto.createHash('sha256').update(url).digest('hex').slice(0, 40);
      const srcKey = sourceKey('import', externalId);
      const dKey = dedupKey(parsed.title, parsed.company);

      let job;
      if (!sourceKeyToId.has(srcKey) && dedupKeyToId.has(dKey)) {
        // Same posting already exists under a different source (or a different URL) —
        // link to that existing job instead of embedding + inserting a duplicate.
        const { data: existingJob, error: fetchError } = await supabase
          .from('jobs')
          .select()
          .eq('id', dedupKeyToId.get(dKey))
          .single();
        if (fetchError) throw fetchError;
        job = existingJob;
      } else {
        const embeddingInput = [parsed.title, parsed.company, parsed.jd_text]
          .filter(Boolean)
          .join('\n')
          .slice(0, 8000);
        const embedding = await embedText(embeddingInput);

        const { data: upsertedJob, error: jobError } = await supabase
          .from('jobs')
          .upsert(
            {
              source: 'import',
              external_id: externalId,
              title: parsed.title,
              company: parsed.company,
              location: parsed.location,
              salary_min: parsed.salary_min,
              salary_max: parsed.salary_max,
              jd_text: parsed.jd_text,
              jd_url: url,
              raw_json: parsed,
              embedding,
            },
            { onConflict: 'source,external_id' }
          )
          .select()
          .single();
        if (jobError) throw jobError;
        job = upsertedJob;

        // Track within this batch too, so multiple URLs in the same paste that turn out
        // to be the same posting also dedupe against each other, not just against the DB.
        sourceKeyToId.set(srcKey, job.id);
        dedupKeyToId.set(dKey, job.id);
      }

      // Link the job to the importing user so it shows up in THEIR feed — jobs is a
      // shared pool (re-importing the same URL from another user updates the same row
      // via the upsert above), but visibility is per-user via user_jobs.
      const { error: linkError } = await supabase
        .from('user_jobs')
        .upsert({ user_id: userId, job_id: job.id }, { onConflict: 'user_id,job_id', ignoreDuplicates: true });
      if (linkError) console.error('Could not link imported job to user:', linkError.message);

      await supabase.from('import_queue').update({ status: 'parsed' }).eq('id', queueId);
      results.push({ url, status: 'parsed', job });
    } catch (err) {
      console.error('Import failed for', url, ':', err.message);
      if (queueId) {
        await supabase
          .from('import_queue')
          .update({ status: 'failed', error_message: String(err.message).slice(0, 500) })
          .eq('id', queueId);
      }
      results.push({ url, status: 'failed', error: err.message });
    }
  }

  res.json({ results });
});

module.exports = router;
