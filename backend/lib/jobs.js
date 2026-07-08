const { supabase } = require('./supabase');
const { embedText } = require('./embeddings');

function sourceKey(source, externalId) {
  return `${source}:${externalId}`;
}

// Normalizes title+company into a loose dedup key (lowercase, punctuation stripped,
// whitespace collapsed) so "Software Engineer" at "Acme Inc." from Adzuna matches the
// same posting pulled in via JSearch, even though their external_ids differ.
function dedupKey(title, company) {
  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(title)}|${norm(company)}`;
}

// Embeds and upserts a batch of normalized job objects (see lib/adzuna.js / lib/jsearch.js /
// lib/claude.js#extractJobFromText for the shape). Two layers of dedup happen before anything
// gets embedded (embedding calls are the expensive/rate-limited part, so skipping early matters):
//   1. Exact match on (source, external_id) — the same listing re-fetched from the same source.
//   2. Loose match on normalized title+company — the same posting showing up via a different
//      source (e.g. a LinkedIn job appearing in both Adzuna and JSearch results).
// Returns a breakdown rather than just a count, so the caller can show the user what actually
// happened instead of a single opaque number.
async function upsertJobsWithEmbeddings(jobs) {
  const { data: existing, error: fetchError } = await supabase
    .from('jobs')
    .select('source, external_id, title, company');
  if (fetchError) {
    console.error('Could not load existing jobs for dedup check:', fetchError.message);
  }

  const seenSourceKeys = new Set((existing || []).map((j) => sourceKey(j.source, j.external_id)));
  const seenDedupKeys = new Set((existing || []).map((j) => dedupKey(j.title, j.company)));

  const result = { saved: [], alreadyStored: 0, duplicatesSkipped: 0, failed: 0 };

  for (const job of jobs) {
    const srcKey = sourceKey(job.source, job.external_id);
    const dKey = dedupKey(job.title, job.company);

    if (seenSourceKeys.has(srcKey)) {
      result.alreadyStored++;
      continue; // already have this exact listing from this exact source — nothing to do
    }

    if (seenDedupKeys.has(dKey)) {
      result.duplicatesSkipped++;
      console.log(
        `Skipping likely duplicate — "${job.title}" at "${job.company}" already exists from another source (new: ${job.source}/${job.external_id})`
      );
      continue;
    }

    try {
      const embeddingInput = [job.title, job.company, job.jd_text]
        .filter(Boolean)
        .join('\n')
        .slice(0, 8000); // keep embedding requests small and cheap
      const embedding = await embedText(embeddingInput);

      const { data, error } = await supabase
        .from('jobs')
        .upsert({ ...job, embedding }, { onConflict: 'source,external_id' })
        .select()
        .single();

      if (error) throw error;
      result.saved.push(data);

      // Track within this batch too, so duplicates across sources within the SAME
      // refresh call (not just across separate calls) are also caught.
      seenSourceKeys.add(srcKey);
      seenDedupKeys.add(dKey);
    } catch (err) {
      console.error(`Failed to save job (${job.source}/${job.external_id}):`, err.message);
      result.failed++;
    }
  }

  return result;
}

module.exports = { upsertJobsWithEmbeddings };
