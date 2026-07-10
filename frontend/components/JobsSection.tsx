'use client';

import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/apiError';
import MatchRing from './MatchRing';
import StatusStepper, { statusLabel, type TrackedStatus } from './StatusStepper';
import { useToast } from './Toast';

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

function salaryText(job: FeedJob) {
  if (!job.salary_min && !job.salary_max) return null;
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  if (job.salary_min && job.salary_max) return `${fmt(job.salary_min)} – ${fmt(job.salary_max)}`;
  return fmt(job.salary_min || job.salary_max || 0);
}

export default function JobsSection({
  userId,
  hasProfile,
  onGoToProfile,
  defaultTitle,
  refreshSignal = 0,
  applicationsRefreshSignal = 0,
  onApplicationsChanged,
}: {
  userId: string;
  // Whether the user has an AI career profile yet — the feed and import tools stay
  // locked behind a CTA to the Profile tab until one exists.
  hasProfile: boolean;
  onGoToProfile: () => void;
  defaultTitle: string;
  // Bump this (e.g. after a new resume upload) to reload the feed — every job's
  // match % is recomputed server-side against whichever profile is newest, this
  // just tells the component to go fetch those fresh numbers.
  refreshSignal?: number;
  // Bump this from a sibling (e.g. the Applications table) to reload tracking
  // statuses here without a full page refresh.
  applicationsRefreshSignal?: number;
  // Called after a status change made in THIS component, so the sibling stays in sync.
  onApplicationsChanged?: () => void;
}) {
  const pushToast = useToast();
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

  // jobId -> tracking status, loaded from /api/applications. A job with no entry here
  // has never been tracked.
  const [appStatus, setAppStatus] = useState<Record<string, TrackedStatus>>({});

  async function loadApplicationStatuses() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, TrackedStatus> = {};
      (data.applications ?? []).forEach((a: any) => {
        if (a.job_id) map[a.job_id] = a.status;
      });
      setAppStatus(map);
    } catch {
      // Non-critical — tracking status just won't show until the next successful load.
    }
  }

  useEffect(() => {
    if (!hasProfile) return;
    loadApplicationStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationsRefreshSignal, userId, hasProfile]);

  async function handleStatusChange(jobId: string, status: TrackedStatus) {
    setAppStatus((prev) => ({ ...prev, [jobId]: status })); // optimistic
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, jobId, status }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res));
      onApplicationsChanged?.();
      pushToast(`Marked as ${statusLabel(status)}`);
    } catch {
      loadApplicationStatuses(); // revert to server truth
    }
  }

  async function loadFeed() {
    setLoading(true);
    setFeedError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/feed?userId=${userId}`);
      if (!res.ok) throw new Error(await apiErrorMessage(res));
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch (err: any) {
      setFeedError(err.message ?? 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasProfile) return;
    loadFeed();
    // Reruns on mount AND whenever refreshSignal changes (e.g. a new resume was
    // uploaded) — intentionally not narrowed to just refreshSignal so the initial
    // load keeps working the same way it always did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal, hasProfile]);

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
      if (!res.ok) throw new Error(await apiErrorMessage(res));
      const data = await res.json();
      setSourceStatus(data.sources ?? null);
      await loadFeed();
      pushToast('Job feed refreshed');
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
      const results: ImportResult[] = data.results ?? [];
      setImportResults(results);
      setImportRaw('');
      await loadFeed();
      pushToast(`${results.length} ${results.length > 1 ? 'jobs' : 'job'} imported`);
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
      if (!res.ok) throw new Error(await apiErrorMessage(res));
      const data = await res.json();

      setDocState((prev) => ({
        ...prev,
        [key]: { status: 'idle', atsScore: data.atsScore, fileUrl: data.fileUrl },
      }));

      // Signed Supabase Storage URL — opening it triggers a direct download/view.
      window.open(data.fileUrl, '_blank', 'noopener,noreferrer');
      pushToast(
        type === 'resume' ? `Resume ready — ${data.atsScore}% ATS score` : 'Cover letter ready'
      );
    } catch (err: any) {
      setDocState((prev) => ({
        ...prev,
        [key]: { status: 'error', error: err.message ?? 'Generation failed' },
      }));
    }
  }

  if (!hasProfile) {
    return (
      <div className="rounded-lg border border-dashed border-[rgba(78,34,15,0.3)] bg-[#FBF7EC] p-12 text-center">
        <p className="mb-1.5 text-[15px] font-semibold text-[#4E220F]">
          Upload a resume to unlock your job feed
        </p>
        <p className="mb-5 text-[13px] text-[#8A7A5E]">
          Matched jobs, import tools, and tailored documents live here once your AI profile exists.
        </p>
        <button
          onClick={onGoToProfile}
          className="rounded-md bg-[#9D6638] px-6 py-[11px] text-sm font-semibold text-[#F7F1DE] transition-colors hover:bg-[#7C4E29]"
        >
          Go to Profile &amp; Resume
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1.5 font-serif text-[27px] text-[#4E220F]">Job Feed</h1>
      <p className="mb-6 text-sm text-[#8A7A5E]">Ranked against your profile by embedding similarity.</p>

      <div className="mb-[18px] rounded-lg border border-[rgba(78,34,15,0.18)] bg-[#FBF7EC] p-5">
        <h2 className="mb-3.5 text-sm font-semibold text-[#4E220F]">Find matching jobs</h2>
        <div className="flex flex-wrap items-end gap-3.5">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-[#8A7A5E]">
              Role
            </label>
            <input
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="e.g. Frontend Engineer"
              className="w-full border-0 border-b-[1.5px] border-[rgba(78,34,15,0.3)] bg-transparent px-0.5 py-2 text-sm text-[#4E220F] placeholder:text-[#A6997C] focus:outline-none"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-[#8A7A5E]">
              Location (optional)
            </label>
            <input
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder="e.g. Bangalore"
              className="w-full border-0 border-b-[1.5px] border-[rgba(78,34,15,0.3)] bg-transparent px-0.5 py-2 text-sm text-[#4E220F] placeholder:text-[#A6997C] focus:outline-none"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !what.trim()}
            className="rounded-md bg-[#9D6638] px-6 py-[11px] text-sm font-semibold text-[#F7F1DE] transition-colors hover:bg-[#7C4E29] disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {sourceStatus && (
          <div className="mt-3.5 flex flex-col gap-1">
            {Object.entries(sourceStatus).map(([source, result]: [string, any]) => (
              <p key={source} className="font-mono text-xs text-[#8A7A5E]">
                <span className="font-medium capitalize">{source}</span>:{' '}
                {result.error
                  ? `failed — ${result.error}`
                  : result.skipped
                    ? result.skipped
                    : formatSourceResult(result)}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mb-7 rounded-lg border border-[rgba(78,34,15,0.18)] bg-[#FBF7EC] p-5">
        <h2 className="mb-2 text-sm font-semibold text-[#4E220F]">Import a job by URL</h2>
        <p className="mb-3 text-[13px] text-[#8A7A5E]">
          Paste a LinkedIn, Naukri, or company careers page URL &mdash; one per line.
        </p>
        <textarea
          value={importRaw}
          onChange={(e) => setImportRaw(e.target.value)}
          rows={3}
          placeholder={'https://company.com/careers/123\nhttps://linkedin.com/jobs/view/456'}
          className="mb-3 w-full resize-y rounded-md border border-[rgba(78,34,15,0.25)] bg-[#F7F1DE] p-2.5 text-[13px] text-[#4E220F] placeholder:text-[#A6997C] focus:outline-none"
        />
        <button
          onClick={handleImport}
          disabled={importing || !importRaw.trim()}
          className="rounded-md border border-[rgba(78,34,15,0.3)] px-[22px] py-2.5 text-sm font-semibold text-[#4E220F] transition-colors hover:bg-[rgba(78,34,15,0.06)] disabled:opacity-50"
        >
          {importing ? 'Importing…' : 'Import job(s)'}
        </button>
        {importResults && (
          <div className="mt-3 flex flex-col gap-1">
            {importResults.map((r, i) => (
              <p
                key={i}
                className={`break-all text-[13px] ${r.status === 'parsed' ? 'text-[#5E7F4C]' : 'text-[#A34B3F]'}`}
              >
                {r.status === 'parsed' ? '✓' : '✗'} {r.url} {r.error ? `— ${r.error}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 flex items-baseline gap-2.5">
        <h2 className="font-serif text-[19px] text-[#4E220F]">Your feed</h2>
        <span className="font-mono text-xs text-[#8A7A5E]">{jobs.length} jobs</span>
      </div>

      {feedError && <p className="mb-3 text-sm text-[#A34B3F]">{feedError}</p>}
      {loading && <p className="mb-3 text-sm text-[#8A7A5E]">Loading your feed…</p>}
      {!loading && jobs.length === 0 && (
        <p className="mb-3 text-sm text-[#8A7A5E]">
          No jobs yet — search above, or import a job URL to add one directly.
        </p>
      )}

      {jobs.map((job) => {
        const status = appStatus[job.id] ?? null;
        const resumeDoc = docState[docKey(job.id, 'resume')];
        const coverDoc = docState[docKey(job.id, 'cover_letter')];
        const salary = salaryText(job);

        return (
          <div
            key={job.id}
            className="mb-4 rounded-lg border border-[rgba(78,34,15,0.18)] bg-[#FBF7EC] p-5"
          >
            <div className="flex justify-between gap-5">
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 font-serif text-lg text-[#4E220F]">{job.title}</h3>
                <p className="mb-1 text-[13px] text-[#8A7A5E]">
                  {job.company ?? 'Unknown company'} &middot; {job.location ?? 'Location not specified'}
                </p>
                {salary && <p className="font-mono text-xs text-[#7C4E29]">{salary}</p>}
                <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[#A6997C]">
                  {getSourceLabel(job)}
                </p>
              </div>

              {job.match_percentage != null && <MatchRing percentage={job.match_percentage} />}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(78,34,15,0.12)] pt-4">
              <div className="flex items-center gap-2.5">
                <StatusStepper
                  status={status}
                  onSetStatus={(s) => handleStatusChange(job.id, s)}
                />
                <span className="ml-1 text-xs text-[#8A7A5E]">{statusLabel(status)}</span>
              </div>
              <button
                onClick={() => handleStatusChange(job.id, 'rejected')}
                className="bg-transparent text-xs text-[#A34B3F] underline"
              >
                Mark rejected
              </button>
            </div>

            <button
              onClick={() => setExpanded(expanded === job.id ? null : job.id)}
              className="mt-3.5 bg-transparent p-0 text-[13px] text-[#9D6638] underline"
            >
              {expanded === job.id ? 'Hide description' : 'View full description'}
            </button>
            {expanded === job.id && (
              <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-[1.6] text-[#5C4A34]">
                {job.jd_text}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {job.jd_url && (
                <a
                  href={job.jd_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-[#9D6638] px-[18px] py-2.5 text-[13px] font-semibold text-[#F7F1DE] no-underline"
                >
                  Apply
                </a>
              )}
              <button
                onClick={() => handleGenerateDocument(job.id, 'resume')}
                disabled={resumeDoc?.status === 'loading'}
                className="rounded-md border border-[rgba(78,34,15,0.3)] px-[18px] py-2.5 text-[13px] text-[#4E220F] transition-colors hover:bg-[rgba(78,34,15,0.06)] disabled:opacity-50"
              >
                {resumeDoc?.status === 'loading' ? 'Tailoring resume…' : 'Download Resume'}
              </button>
              {resumeDoc?.fileUrl && (
                <button
                  onClick={() => handleGenerateDocument(job.id, 'resume', true)}
                  className="bg-transparent text-xs text-[#8A7A5E] underline"
                >
                  Regenerate
                </button>
              )}
              <button
                onClick={() => handleGenerateDocument(job.id, 'cover_letter')}
                disabled={coverDoc?.status === 'loading'}
                className="rounded-md border border-[rgba(78,34,15,0.3)] px-[18px] py-2.5 text-[13px] text-[#4E220F] transition-colors hover:bg-[rgba(78,34,15,0.06)] disabled:opacity-50"
              >
                {coverDoc?.status === 'loading' ? 'Writing letter…' : 'Download Cover Letter'}
              </button>
              {coverDoc?.fileUrl && (
                <button
                  onClick={() => handleGenerateDocument(job.id, 'cover_letter', true)}
                  className="bg-transparent text-xs text-[#8A7A5E] underline"
                >
                  Regenerate
                </button>
              )}
            </div>

            {resumeDoc?.status === 'idle' && resumeDoc?.atsScore != null && (
              <p className="mt-2.5 font-mono text-xs text-[#5E7F4C]">
                Tailored resume ATS score: {resumeDoc.atsScore}%
              </p>
            )}
            {resumeDoc?.status === 'error' && (
              <p className="mt-2.5 text-xs text-[#A34B3F]">Resume generation failed — {resumeDoc.error}</p>
            )}
            {coverDoc?.status === 'error' && (
              <p className="mt-2.5 text-xs text-[#A34B3F]">Cover letter generation failed — {coverDoc.error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
