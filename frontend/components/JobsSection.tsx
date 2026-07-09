'use client';

import { useEffect, useState } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!;

type FeedJob = {
  id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  jd_text: string | null;
  jd_url: string | null;
  posted_at: string | null;
  match_percentage: number | null;
};

type ImportResult = { url: string; status: 'parsed' | 'failed'; error?: string };

function formatSourceResult(result: any) {
  // newToYourFeed / alreadyInYourFeed describe THIS user's feed, not the shared jobs
  // pool — a job can be "new to you" even if some other user's earlier search already
  // saved that same listing into the shared pool.
  const parts = [`${result.newToYourFeed} new to your feed`];
  if (result.alreadyInYourFeed) parts.push(`${result.alreadyInYourFeed} already in your feed`);
  if (result.failed) parts.push(`${result.failed} failed`);
  return `${result.fetched} fetched — ${parts.join(', ')}`;
}

const KNOWN_SITE_LABELS: Record<string, string> = {
  'linkedin.com': 'LinkedIn',
  'naukri.com': 'Naukri',
  'indeed.com': 'Indeed',
  'glassdoor.com': 'Glassdoor',
  'monster.com': 'Monster',
  'ziprecruiter.com': 'ZipRecruiter',
  'shine.com': 'Shine',
  'foundit.in': 'Foundit',
};

// Turns a job's source + jd_url into a human label for the card, e.g.
// "Fetched from Adzuna", "Fetched from JSearch", "Imported from LinkedIn".
function getSourceLabel(job: FeedJob): string {
  if (job.source === 'adzuna') return 'Fetched from Adzuna';
  if (job.source === 'jsearch') return 'Fetched from JSearch';

  if (job.source === 'import') {
    if (!job.jd_url) return 'Imported';
    try {
      const hostname = new URL(job.jd_url).hostname.replace(/^www\./, '');
      const knownKey = Object.keys(KNOWN_SITE_LABELS).find(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (knownKey) return `Imported from ${KNOWN_SITE_LABELS[knownKey]}`;

      // Fallback: turn "capgemini.com" into "Capgemini"
      const mainPart = hostname.split('.').slice(-2, -1)[0] || hostname;
      const label = mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
      return `Imported from ${label}`;
    } catch {
      return 'Imported';
    }
  }

  return job.source.charAt(0).toUpperCase() + job.source.slice(1);
}

export default function JobsSection({
  userId,
  defaultTitle,
  refreshSignal = 0,
}: {
  userId: string;
  defaultTitle: string;
  // Bump this (e.g. after a new resume upload) to reload the feed — every job's
  // match % is recomputed server-side against whichever profile is newest, this
  // just tells the component to go fetch those fresh numbers.
  refreshSignal?: number;
}) {
  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [what, setWhat] = useState(defaultTitle);
  const [where, setWhere] = useState('');
  const [searching, setSearching] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<Record<string, any> | null>(null);

  const [importRaw, setImportRaw] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);

  type DocType = 'resume' | 'cover_letter';
  type DocState = {
    status: 'idle' | 'loading' | 'error';
    error?: string;
    atsScore?: number;
    fileUrl?: string; // cached client-side once generated, so repeat clicks in this
                       // session skip the network entirely rather than re-hitting Claude
  };
  const [docState, setDocState] = useState<Record<string, DocState>>({});

  function docKey(jobId: string, type: DocType) {
    return `${jobId}:${type}`;
  }

  async function loadFeed() {
    setLoading(true);
    setFeedError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/feed?userId=${userId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch (err: any) {
      setFeedError(err.message ?? 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
    // Reruns on mount AND whenever refreshSignal changes (e.g. a new resume was
    // uploaded) — intentionally not narrowed to just refreshSignal so the initial
    // load keeps working the same way it always did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  async function handleSearch() {
    if (!what.trim()) return;
    setSearching(true);
    setFeedError(null);
    setSourceStatus(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, what, where }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSourceStatus(data.sources ?? null);
      await loadFeed();
    } catch (err: any) {
      setFeedError(err.message ?? 'Failed to fetch new jobs');
    } finally {
      setSearching(false);
    }
  }

  async function handleImport() {
    if (!importRaw.trim()) return;
    setImporting(true);
    setImportResults(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/import/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, urls: importRaw }),
      });
      const data = await res.json();
      setImportResults(data.results ?? []);
      setImportRaw('');
      await loadFeed();
    } catch {
      setImportResults([{ url: 'request', status: 'failed', error: 'Import request failed' }]);
    } finally {
      setImporting(false);
    }
  }

  async function handleGenerateDocument(jobId: string, type: DocType, forceRegenerate = false) {
    const key = docKey(jobId, type);

    // Already generated this session and not an explicit regenerate — just reopen it,
    // no network call, no Claude cost. (A fresh page load still hits the backend once,
    // which itself checks generated_documents before regenerating — see routes/documents.js.)
    if (!forceRegenerate && docState[key]?.fileUrl) {
      window.open(docState[key].fileUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setDocState((prev) => ({ ...prev, [key]: { status: 'loading' } }));

    try {
      const endpoint = type === 'resume' ? 'resume' : 'cover-letter';
      const res = await fetch(`${BACKEND_URL}/api/documents/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, jobId, regenerate: forceRegenerate }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setDocState((prev) => ({
        ...prev,
        [key]: { status: 'idle', atsScore: data.atsScore, fileUrl: data.fileUrl },
      }));

      // Signed Supabase Storage URL — opening it triggers a direct download/view.
      window.open(data.fileUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setDocState((prev) => ({
        ...prev,
        [key]: { status: 'error', error: err.message ?? 'Generation failed' },
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">Find matching jobs</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1">
            <label className="block text-xs text-gray-500">Role</label>
            <input
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              className="w-full rounded-md border px-2 py-1 text-sm"
              placeholder="e.g. Frontend Engineer"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="block text-xs text-gray-500">Location (optional)</label>
            <input
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              className="w-full rounded-md border px-2 py-1 text-sm"
              placeholder="e.g. Bangalore"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !what.trim()}
            className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {sourceStatus && (
          <ul className="text-sm text-gray-500">
            {Object.entries(sourceStatus).map(([source, result]: [string, any]) => (
              <li key={source}>
                <span className="font-medium capitalize">{source}</span>:{' '}
                {result.error
                  ? `failed — ${result.error}`
                  : result.skipped
                    ? result.skipped
                    : formatSourceResult(result)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 rounded-xl border p-4">
        <h2 className="font-medium">Import a job by URL</h2>
        <p className="text-sm text-gray-500">
          Paste a LinkedIn, Naukri, or company careers page URL — add several at once,
          comma-separated or one per line.
        </p>
        <textarea
          value={importRaw}
          onChange={(e) => setImportRaw(e.target.value)}
          rows={3}
          className="w-full rounded-md border p-2 text-sm"
          placeholder={'https://company.com/careers/123\nhttps://linkedin.com/jobs/view/456'}
        />
        <button
          onClick={handleImport}
          disabled={importing || !importRaw.trim()}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {importing ? 'Importing…' : 'Import job(s)'}
        </button>
        {importResults && (
          <ul className="mt-2 space-y-1 text-sm">
            {importResults.map((r, i) => (
              <li key={i} className={r.status === 'parsed' ? 'text-green-700' : 'text-red-600'}>
                {r.status === 'parsed' ? '✓' : '✗'} {r.url} {r.error ? `— ${r.error}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Your feed</h2>
        {feedError && <p className="text-sm text-red-600">{feedError}</p>}
        {loading && <p className="text-sm text-gray-500">Loading your feed…</p>}
        {!loading && jobs.length === 0 && (
          <p className="text-sm text-gray-500">
            No jobs yet — search above, or import a job URL to add one directly.
          </p>
        )}

        {jobs.map((job) => (
          <div key={job.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium">{job.title}</h3>
                <p className="text-sm text-gray-500">
                  {job.company ?? 'Unknown company'} · {job.location ?? 'Location not specified'}
                </p>
                {(job.salary_min || job.salary_max) && (
                  <p className="text-sm text-gray-500">
                    {job.salary_min ?? '?'} – {job.salary_max ?? '?'}
                  </p>
                )}
              </div>
              {job.match_percentage != null && (
                <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                  {job.match_percentage}% match
                </span>
              )}
            </div>

            <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
              {getSourceLabel(job)}
            </p>

            <button
              onClick={() => setExpanded(expanded === job.id ? null : job.id)}
              className="mt-2 text-sm text-blue-600 underline"
            >
              {expanded === job.id ? 'Hide description' : 'View full description'}
            </button>
            {expanded === job.id && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{job.jd_text}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {job.jd_url && (
                <a
                  href={job.jd_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-md bg-black px-4 py-2 text-sm text-white"
                >
                  Apply
                </a>
              )}

              <button
                onClick={() => handleGenerateDocument(job.id, 'resume')}
                disabled={docState[docKey(job.id, 'resume')]?.status === 'loading'}
                className="inline-block rounded-md border px-4 py-2 text-sm disabled:opacity-50"
              >
                {docState[docKey(job.id, 'resume')]?.status === 'loading'
                  ? 'Tailoring resume…'
                  : 'Download Resume'}
              </button>

              {docState[docKey(job.id, 'resume')]?.fileUrl && (
                <button
                  onClick={() => handleGenerateDocument(job.id, 'resume', true)}
                  disabled={docState[docKey(job.id, 'resume')]?.status === 'loading'}
                  className="text-xs text-gray-500 underline disabled:opacity-50"
                  title="Generate a fresh tailored resume instead of reusing the saved one"
                >
                  Regenerate
                </button>
              )}

              <button
                onClick={() => handleGenerateDocument(job.id, 'cover_letter')}
                disabled={docState[docKey(job.id, 'cover_letter')]?.status === 'loading'}
                className="inline-block rounded-md border px-4 py-2 text-sm disabled:opacity-50"
              >
                {docState[docKey(job.id, 'cover_letter')]?.status === 'loading'
                  ? 'Writing letter…'
                  : 'Download Cover Letter'}
              </button>

              {docState[docKey(job.id, 'cover_letter')]?.fileUrl && (
                <button
                  onClick={() => handleGenerateDocument(job.id, 'cover_letter', true)}
                  disabled={docState[docKey(job.id, 'cover_letter')]?.status === 'loading'}
                  className="text-xs text-gray-500 underline disabled:opacity-50"
                  title="Generate a fresh cover letter instead of reusing the saved one"
                >
                  Regenerate
                </button>
              )}
            </div>

            {docState[docKey(job.id, 'resume')]?.status === 'idle' &&
              docState[docKey(job.id, 'resume')]?.atsScore != null && (
                <p className="mt-1 text-xs text-green-700">
                  Tailored resume ATS score: {docState[docKey(job.id, 'resume')]?.atsScore}%
                </p>
              )}
            {docState[docKey(job.id, 'resume')]?.status === 'error' && (
              <p className="mt-1 text-xs text-red-600">
                Resume generation failed — {docState[docKey(job.id, 'resume')]?.error}
              </p>
            )}
            {docState[docKey(job.id, 'cover_letter')]?.status === 'error' && (
              <p className="mt-1 text-xs text-red-600">
                Cover letter generation failed — {docState[docKey(job.id, 'cover_letter')]?.error}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
