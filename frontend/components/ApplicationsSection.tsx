'use client';

import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/apiError';
import StatusStepper, { statusLabel, type TrackedStatus } from './StatusStepper';
import { useToast } from './Toast';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!;

type Application = {
  id: string;
  status: TrackedStatus;
  notes: string | null;
  applied_at: string | null;
  updated_at: string;
  resume_document_id: string | null;
  cover_letter_document_id: string | null;
  job: {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    jd_url: string | null;
    source: string;
  } | null;
};

export default function ApplicationsSection({
  userId,
  hasProfile,
  onGoToProfile,
  onGoToJobs,
  refreshSignal = 0,
  onChanged,
}: {
  userId: string;
  // Whether the user has an AI career profile yet — tracking lives behind a CTA to
  // the Profile tab until one exists, matching the Job Feed tab's gating.
  hasProfile: boolean;
  onGoToProfile: () => void;
  onGoToJobs: () => void;
  // Bump this from a sibling component (e.g. after tracking a job from the feed) to
  // reload the list here without a full page refresh.
  refreshSignal?: number;
  // Called after a status change made in THIS component, so a sibling (e.g. the job
  // feed's own status stepper) can stay in sync too.
  onChanged?: () => void;
}) {
  const pushToast = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});

  async function loadApplications() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications?userId=${userId}`);
      if (!res.ok) throw new Error(await apiErrorMessage(res));
      const data = await res.json();
      setApplications(data.applications ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasProfile) return;
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal, hasProfile]);

  async function handleStatusChange(applicationId: string, status: TrackedStatus) {
    // Optimistic update — the list re-sorts by updated_at server-side on next load,
    // but we don't want the row to jump around mid-edit, so just patch status in place.
    setApplications((prev) =>
      prev.map((a) => (a.id === applicationId ? { ...a, status } : a))
    );
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res));
      onChanged?.();
      pushToast(`Marked as ${statusLabel(status)}`);
    } catch {
      // Revert to server truth if the update failed.
      loadApplications();
    }
  }

  async function openDocument(applicationId: string, jobId: string, type: 'resume' | 'cover_letter') {
    setDocErrors((prev) => ({ ...prev, [applicationId + type]: '' }));
    try {
      const endpoint = type === 'resume' ? 'resume' : 'cover-letter';
      const res = await fetch(`${BACKEND_URL}/api/documents/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, jobId }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res));
      const data = await res.json();
      window.open(data.fileUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setDocErrors((prev) => ({
        ...prev,
        [applicationId + type]: err.message ?? 'Could not open document',
      }));
    }
  }

  if (!hasProfile) {
    return (
      <div className="rounded-lg border border-dashed border-[rgba(78,34,15,0.3)] bg-[#FBF7EC] p-12 text-center">
        <p className="mb-1.5 text-[15px] font-semibold text-[#4E220F]">
          Upload a resume to unlock application tracking
        </p>
        <p className="mb-5 text-[13px] text-[#8A7A5E]">
          Track every job you apply to once your AI profile exists.
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
      <h1 className="mb-1.5 font-serif text-[27px] text-[#4E220F]">My Applications</h1>
      <p className="mb-6 text-sm text-[#8A7A5E]">Every job you&rsquo;re tracking, in one place.</p>

      {error && <p className="mb-3 text-sm text-[#A34B3F]">{error}</p>}
      {loading && <p className="text-sm text-[#8A7A5E]">Loading your applications…</p>}

      {!loading && applications.length === 0 && (
        <div className="rounded-lg border border-dashed border-[rgba(78,34,15,0.3)] bg-[#FBF7EC] p-12 text-center">
          <p className="mb-4 text-sm text-[#8A7A5E]">
            Nothing tracked yet &mdash; use the status stepper on a job card in your feed to start
            tracking one.
          </p>
          <button
            onClick={onGoToJobs}
            className="rounded-md border border-[#9D6638] px-5 py-2.5 text-[13px] font-semibold text-[#9D6638] transition-colors hover:bg-[rgba(78,34,15,0.06)]"
          >
            Go to Job Feed
          </button>
        </div>
      )}

      {!loading && applications.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[rgba(78,34,15,0.18)] bg-[#FBF7EC]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[rgba(78,34,15,0.18)] bg-[#F1E9D2]">
                {['Job', 'Status', 'Applied', 'Links'].map((h) => (
                  <th
                    key={h}
                    className="px-[18px] py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[#8A7A5E]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applications
                .filter((a) => a.job)
                .map((app) => (
                  <tr key={app.id} className="border-b border-[rgba(78,34,15,0.1)] last:border-0">
                    <td className="px-[18px] py-3">
                      <div className="text-sm font-semibold text-[#4E220F]">{app.job!.title}</div>
                      <div className="text-xs text-[#8A7A5E]">
                        {app.job!.company ?? 'Unknown company'} &middot;{' '}
                        {app.job!.location ?? 'Location not specified'}
                      </div>
                    </td>
                    <td className="px-[18px] py-3">
                      <div className="mb-1.5">
                        <StatusStepper
                          status={app.status}
                          onSetStatus={(s) => handleStatusChange(app.id, s)}
                          size="sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#5C4A34]">{statusLabel(app.status)}</span>
                        <button
                          onClick={() => handleStatusChange(app.id, 'rejected')}
                          className="bg-transparent p-0 text-[11px] text-[#A34B3F] underline"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                    <td className="px-[18px] py-3 font-mono text-xs text-[#8A7A5E]">
                      {app.applied_at
                        ? new Date(app.applied_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-[18px] py-3">
                      <div className="flex flex-col gap-1">
                        {app.job!.jd_url && (
                          <a
                            href={app.job!.jd_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#9D6638]"
                          >
                            Listing
                          </a>
                        )}
                        {app.resume_document_id && (
                          <button
                            onClick={() => openDocument(app.id, app.job!.id, 'resume')}
                            className="bg-transparent p-0 text-left text-xs text-[#5E7F4C]"
                          >
                            Resume ready
                          </button>
                        )}
                        {app.cover_letter_document_id && (
                          <button
                            onClick={() => openDocument(app.id, app.job!.id, 'cover_letter')}
                            className="bg-transparent p-0 text-left text-xs text-[#5E7F4C]"
                          >
                            Cover letter ready
                          </button>
                        )}
                      </div>
                      {(docErrors[app.id + 'resume'] || docErrors[app.id + 'cover_letter']) && (
                        <p className="mt-1 text-xs text-[#A34B3F]">
                          {docErrors[app.id + 'resume'] || docErrors[app.id + 'cover_letter']}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
