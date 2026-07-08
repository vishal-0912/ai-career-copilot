const ADZUNA_BASE = 'https://api.adzuna.com/v1/api';

// Searches Adzuna's job listings and normalizes results into the `jobs` schema shape.
// Docs: https://developer.adzuna.com/docs/search
async function searchAdzunaJobs({ what, where, country, page = 1, resultsPerPage = 10 }) {
  const resolvedCountry = country || process.env.ADZUNA_COUNTRY || 'in';
  const url = new URL(`${ADZUNA_BASE}/jobs/${resolvedCountry}/search/${page}`);
  url.searchParams.set('app_id', process.env.ADZUNA_APP_ID);
  url.searchParams.set('app_key', process.env.ADZUNA_APP_KEY);
  url.searchParams.set('what', what);
  if (where) url.searchParams.set('where', where);
  url.searchParams.set('results_per_page', String(resultsPerPage));
  url.searchParams.set('content-type', 'application/json');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Adzuna request failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return (data.results || []).map(normalizeAdzunaJob);
}

function normalizeAdzunaJob(raw) {
  return {
    source: 'adzuna',
    external_id: String(raw.id),
    title: raw.title,
    company: raw.company?.display_name ?? null,
    location: raw.location?.display_name ?? null,
    salary_min: raw.salary_min ?? null,
    salary_max: raw.salary_max ?? null,
    jd_text: raw.description ?? '',
    jd_url: raw.redirect_url,
    posted_at: raw.created ?? null,
    raw_json: raw,
  };
}

module.exports = { searchAdzunaJobs };
