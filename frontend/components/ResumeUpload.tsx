'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiErrorMessage } from '@/lib/apiError';
import ProfileCard, { CandidateProfile } from './ProfileCard';
import { useToast } from './Toast';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!; // Render service URL
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // matches the "up to 5MB" copy below the dropzone

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
  const pushToast = useToast();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(initialProfile);

  async function handleFile(file: File) {
    setError(null);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit is 5MB`);
      setStatus('error');
      return;
    }

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

      if (!res.ok) throw new Error(await apiErrorMessage(res));
      const { candidateProfile } = await res.json();

      setProfile(candidateProfile);
      setStatus('done');
      // Tells DashboardClient a new profile exists, which bumps JobsSection's
      // refreshSignal — every job's match % gets recomputed against this profile
      // the next time the feed reloads, without a full page refresh.
      onProfileUpdated?.(candidateProfile);
      pushToast('Your AI career profile is ready');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
      setStatus('error');
    }
  }

  const busyLabel =
    status === 'uploading'
      ? 'Uploading…'
      : 'Reading your resume and building your AI career profile…';
  const progressWidth = status === 'uploading' ? '35%' : status === 'processing' ? '85%' : '100%';

  return (
    <div>
      <h1 className="mb-1.5 font-serif text-[27px] text-[#4E220F]">Profile &amp; Resume</h1>
      <p className="mb-7 text-sm text-[#8A7A5E]">
        Your AI-extracted career profile powers job matching and tailored documents.
      </p>

      {(status === 'idle' || status === 'error') && (
        <div className="rounded-lg border-[1.5px] border-dashed border-[rgba(78,34,15,0.35)] bg-[#FBF7EC] px-6 py-14 text-center">
          <div className="relative mx-auto mb-[22px] h-[52px] w-11 rounded-[3px] border-2 border-[#9D6638]">
            <div className="absolute left-2 right-2 top-[13px] h-0.5 bg-[#9D6638]" />
            <div className="absolute left-2 right-2 top-[21px] h-0.5 bg-[#9D6638]" />
            <div className="absolute left-2 right-4 top-[29px] h-0.5 bg-[#9D6638]" />
          </div>
          <p className="mb-1 text-[15px] font-semibold text-[#4E220F]">Drop your resume here</p>
          <p className="mb-6 text-[13px] text-[#8A7A5E]">PDF or DOCX, up to 5MB</p>
          <div className="flex flex-wrap justify-center gap-3">
            <label className="cursor-pointer rounded-md bg-[#9D6638] px-6 py-[11px] text-sm font-semibold text-[#F7F1DE] transition-colors hover:bg-[#7C4E29]">
              Browse files
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>
          {status === 'error' && (
            <p className="mt-4 text-sm text-[#A34B3F]">{error} — try again, or use a different file format.</p>
          )}
        </div>
      )}

      {(status === 'uploading' || status === 'processing') && (
        <div className="rounded-lg border border-[rgba(78,34,15,0.2)] bg-[#FBF7EC] px-6 py-11 text-center">
          <p className="mb-[18px] font-mono text-xs uppercase tracking-[0.06em] text-[#9D6638]">
            {busyLabel}
          </p>
          <div className="mx-auto h-1 max-w-[280px] overflow-hidden rounded-full bg-[rgba(78,34,15,0.12)]">
            <div
              className="h-full rounded-full bg-[#9D6638] transition-all duration-500 ease-out"
              style={{ width: progressWidth }}
            />
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[rgba(78,34,15,0.2)] bg-[#FBF7EC] px-6 py-[18px]">
          <div className="flex items-center gap-3">
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#5E7F4C] text-sm text-[#F7F1DE]">
              &#10003;
            </div>
            <div>
              <p className="text-sm font-semibold text-[#4E220F]">Resume processed</p>
              <p className="mt-0.5 text-xs text-[#8A7A5E]">Your career profile is ready below</p>
            </div>
          </div>
          <label className="cursor-pointer rounded-md border border-[#9D6638] px-[18px] py-[9px] text-[13px] font-semibold text-[#9D6638] transition-colors hover:bg-[rgba(78,34,15,0.06)]">
            Upload a new resume
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
          </label>
        </div>
      )}

      {profile && <ProfileCard profile={profile} />}
    </div>
  );
}
