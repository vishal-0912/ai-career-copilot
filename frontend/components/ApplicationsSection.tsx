'use client';

import { useEffect, useState } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!;

const STATUS_OPTIONS = ['saved', 'applied', 'interviewing', 'offer', 'rejected'] as const;
type Status = (typeof STATUS_OPTIONS)[number];

const STATUS_LABELS: Record<Status, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

type Application = {
  id: string;
  status: Status;
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
  refreshSignal = 0,
  onChanged,
}: {
  userId: string;
  // Bump this from a sibling component (e.g. after tracking a job from the feed) to
  // reload the list here without a full page refresh.
  refreshSignal?: number;
  // Called after a status change made in THIS component, so a sibling (e.g. the job
  // feed's own status dropdown) can stay in sync too.
  onChanged?: () => void;
}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});

  async function loadApplications() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications?userId=${userId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setApplications(data.applications ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  async function handleStatusChange(applicationId: string, status: Status) {
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
      if (!res.ok) throw new Error(await res.text());
      onChanged?.();
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
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.open(data.fileUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setDocErrors((prev) => ({
        ...prev,
        [applicationId + type]: err.message ?? 'Could not open document',
      }));
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-medium">My Applications</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading your applications…</p>}
      {!loading && applications.length === 0 && (
        <p className="text-sm text-gray-500">
          Nothing tracked yet — use the status dropdown on a job card in your feed to start
          tracking one.
        </p>
      )}

      {!loading && applications.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Applied</th>
                <th className="px-3 py-2">Links</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{app.job?.title ?? 'Job no longer available'}</div>
                    <div className="text-xs text-gray-500">
                      {app.job?.company ?? 'Unknown company'} · {app.job?.location ?? 'Location not specified'}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={app.status}
                      onChange={(e) => handleStatusChange(app.id, e.target.value as Status)}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {app.applied_at ? new Date(app.applied_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {app.job?.jd_url && (
                        <a
                          href={app.job.jd_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline"
                        >
                          Listing
                        </a>
                      )}
                      {app.resume_document_id && app.job && (
                        <button
                          onClick={() => openDocument(app.id, app.job!.id, 'resume')}
                          className="text-blue-600 underline"
                        >
                          Resume
                        </button>
                      )}
                      {app.cover_letter_document_id && app.job && (
                        <button
                          onClick={() => openDocument(app.id, app.job!.id, 'cover_letter')}
                          className="text-blue-600 underline"
                        >
                          Cover letter
                        </button>
                      )}
                    </div>
                    {(docErrors[app.id + 'resume'] || docErrors[app.id + 'cover_letter']) && (
                      <p className="mt-1 text-xs text-red-600">
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
