'use client';

import { useCallback, useState } from 'react';
import ResumeUpload from './ResumeUpload';
import JobsSection from './JobsSection';
import type { CandidateProfile } from './ProfileCard';

// Wraps ResumeUpload + JobsSection so a new resume can tell the feed to reload
// without a full page refresh. dashboard/page.tsx is a server component and can't
// hold client state or pass callbacks across the server/client boundary, so this
// thin client wrapper is where that shared state actually lives.
export default function DashboardClient({
  userId,
  initialProfile,
}: {
  userId: string;
  initialProfile: CandidateProfile | null;
}) {
  const [profile, setProfile] = useState<CandidateProfile | null>(initialProfile);
  // Bumped on every successful upload; JobsSection reloads whenever this changes.
  const [refreshSignal, setRefreshSignal] = useState(0);

  const handleProfileUpdated = useCallback((newProfile: CandidateProfile) => {
    setProfile(newProfile);
    setRefreshSignal((n) => n + 1);
  }, []);

  return (
    <>
      <ResumeUpload userId={userId} initialProfile={profile} onProfileUpdated={handleProfileUpdated} />

      {profile ? (
        <JobsSection
          userId={userId}
          defaultTitle={profile.job_titles?.[0] ?? ''}
          refreshSignal={refreshSignal}
        />
      ) : (
        <p className="text-sm text-gray-500">
          Upload a resume above to unlock your job feed and import tools.
        </p>
      )}
    </>
  );
}
