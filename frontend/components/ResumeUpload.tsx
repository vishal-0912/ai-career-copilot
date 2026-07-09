'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ProfileCard, { CandidateProfile } from './ProfileCard';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!; // Render service URL

type Status = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export default function ResumeUpload({
  userId,
  initialProfile = null,
  onProfileUpdated,
}: {
  userId: string;
  initialProfile?: CandidateProfile | null;
  onProfileUpdated?: (profile: CandidateProfile) => void;
}) {
  const supabase = createClient();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(initialProfile);

  async function handleFile(file: File) {
    setError(null);
    setStatus('uploading');

    try {
      // 1. Upload the raw file to Supabase Storage
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(path, file);
      if (uploadError) throw uploadError;

      // The bucket is private, so we need a short-lived signed URL rather than a public one.
      const { data: signed, error: signError } = await supabase.storage
        .from('resumes')
        .createSignedUrl(path, 3600);
      if (signError) throw signError;

      // 2. Record the resumes row — store the storage path (stable), not the signed URL (expires)
      const { data: resumeRow, error: dbError } = await supabase
        .from('resumes')
        .insert({ user_id: userId, original_file_url: path })
        .select()
        .single();
      if (dbError) throw dbError;

      // 3. Hand off to the Render backend: extract text -> Claude -> embed -> save
      setStatus('processing');
      const res = await fetch(`${BACKEND_URL}/api/resume/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeId: resumeRow.id,
          userId,
          fileUrl: signed.signedUrl,
          fileName: file.name, // used server-side to tell PDF vs DOCX apart (signed URLs don't keep the extension)
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const { candidateProfile } = await res.json();

      setProfile(candidateProfile);
      setStatus('done');
      // Tells DashboardClient a new profile exists, which bumps JobsSection's
      // refreshSignal — every job's match % gets recomputed against this profile
      // the next time the feed reloads, without a full page refresh.
      onProfileUpdated?.(candidateProfile);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
      setStatus('error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed p-8 text-center">
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="mx-auto"
        />
        <p className="mt-2 text-sm text-gray-500">
          {profile
            ? 'Upload a new resume to replace your current profile'
            : 'PDF or DOCX, up to ~5MB'}
        </p>

        {status === 'uploading' && <p className="mt-4 text-blue-600">Uploading…</p>}
        {status === 'processing' && (
          <p className="mt-4 text-blue-600">
            Reading your resume and building your AI career profile…
          </p>
        )}
        {status === 'error' && (
          <p className="mt-4 text-red-600">
            {error} — try again, or use a different file format.
          </p>
        )}
      </div>

      {profile && <ProfileCard profile={profile} />}
    </div>
  );
}
