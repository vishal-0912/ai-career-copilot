// JSearch (via RapidAPI) — second job source, aggregates LinkedIn/Indeed/Glassdoor/
// ZipRecruiter listings. Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
//
// Endpoint and response shape both confirmed against a real request/response
// (2026-07-08): GET /search-v2?query=...&num_pages=1&country=...&date_posted=all
// returns { status, request_id, parameters, data: { jobs: [...], cursor } } — note
// the results are nested under data.jobs, not data itself. Field names on each job
// (job_title, employer_name, job_min_salary, job_city/state/country, etc.) match
// what's used below.
const JSEARCH_HOST = 'jsearch.p.rapidapi.com';

async function searchJSearchJobs({ what, where, numPages = 1, country, datePosted = 'all' }) {
  const query = where ? `${what} in ${where}` : what;
  const url = new URL(`https://${JSEARCH_HOST}/search-v2`);
  url.searchParams.set('query', query);
  url.searchParams.set('num_pages', String(numPages));
  url.searchParams.set('country', country || process.env.JSEARCH_COUNTRY || 'us');
  url.searchParams.set('date_posted', datePosted);

  const res = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': JSEARCH_HOST,
      'x-rapidapi-key': process.env.RAPIDAPI_JSEARCH_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`JSearch request failed (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  return (body.data?.jobs || []).map(normalizeJSearchJob);
}

function normalizeJSearchJob(raw) {
  const locationParts = [raw.job_city, raw.job_state, raw.job_country].filter(Boolean);
  const location = raw.job_is_remote
    ? 'Remote'
    : locationParts.length
      ? locationParts.join(', ')
      : null;

  return {
    source: 'jsearch',
    external_id: String(raw.job_id),
    title: raw.job_title,
    company: raw.employer_name ?? null,
    location,
    salary_min: raw.job_min_salary ?? null,
    salary_max: raw.job_max_salary ?? null,
    jd_text: raw.job_description ?? '',
    jd_url: raw.job_apply_link ?? raw.job_google_link ?? null,
    posted_at: raw.job_posted_at_datetime_utc ?? null,
    raw_json: raw,
  };
}

module.exports = { searchJSearchJobs };
