'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import ResumeUpload from './ResumeUpload';
import { ToastProvider } from './Toast';
import type { CandidateProfile } from './ProfileCard';

// Shown while a code-split section's chunk is still loading — without this, next/dynamic
// renders nothing at all, which reads as a blank/broken pane for the ~200ms-1s it takes to
// fetch the chunk (worse on a slow connection or the very first tab switch after page load).
function SectionLoading() {
  return <p className="text-sm text-[#8A7A5E]">Loading…</p>;
}

// Only one of these three sections is ever visible at a time (tab switch), so
// JobsSection and ApplicationsSection are code-split out of the initial dashboard
// bundle and fetched on demand the first time a user opens that tab. ResumeUpload
// stays a static import since it's the default/first-visible section.
const JobsSection = dynamic(() => import('./JobsSection'), { loading: SectionLoading });
const ApplicationsSection = dynamic(() => import('./ApplicationsSection'), { loading: SectionLoading });

type Section = 'profile' | 'jobs' | 'applications';

const NAV_ITEMS: { key: Section; label: string }[] = [
  { key: 'profile', label: 'Profile & Resume' },
  { key: 'jobs', label: 'Job Feed' },
  { key: 'applications', label: 'My Applications' },
];

// Wraps ResumeUpload + JobsSection + ApplicationsSection so a new resume, a job search,
// or a tracking status change in any one of them can tell the others to reload without a
// full page refresh. dashboard/page.tsx is a server component and can't hold client state
// or pass callbacks across the server/client boundary, so this thin client wrapper is
// where that shared state actually lives. It also owns the sidebar section switch and
// the toast notifications shared across all three sections.
export default function DashboardClient({
  userId,
  initialProfile,
}: {
  userId: string;
  initialProfile: CandidateProfile | null;
}) {
  const [profile, setProfile] = useState<CandidateProfile | null>(initialProfile);
  const [section, setSection] = useState<Section>('profile');
  // Bumped on every successful resume upload; JobsSection reloads whenever this changes.
  const [refreshSignal, setRefreshSignal] = useState(0);
  // Bumped whenever a tracking status changes in either JobsSection or ApplicationsSection,
  // so the other one stays in sync without a full page reload.
  const [applicationsRefreshSignal, setApplicationsRefreshSignal] = useState(0);

  const handleProfileUpdated = useCallback((newProfile: CandidateProfile) => {
    setProfile(newProfile);
    setRefreshSignal((n) => n + 1);
  }, []);

  const bumpApplicationsRefresh = useCallback(() => {
    setApplicationsRefreshSignal((n) => n + 1);
  }, []);

  const goToProfile = useCallback(() => setSection('profile'), []);
  const goToJobs = useCallback(() => setSection('jobs'), []);

  return (
    <ToastProvider>
      <div className="flex h-screen flex-col">
        <div className="flex items-center justify-between border-b border-[rgba(78,34,15,0.15)] bg-[#FBF7EC] px-4 py-3.5 sm:px-8">
          <div className="font-serif text-lg font-semibold text-[#4E220F]">Career Copilot</div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden h-[30px] w-[30px] shrink-0 rounded-full bg-[#B0BA99] sm:block" />
            <form action="/auth/signout" method="post">
              <button className="rounded-md border border-[rgba(78,34,15,0.2)] px-3 py-2 text-sm text-[#4E220F] transition-colors hover:bg-[rgba(78,34,15,0.06)] sm:px-4">
                Log out
              </button>
            </form>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[rgba(78,34,15,0.15)] bg-[#FBF7EC] p-3 md:w-[216px] md:flex-col md:overflow-visible md:border-b-0 md:border-r">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`mb-0.5 block shrink-0 whitespace-nowrap rounded-md px-4 py-3 text-left text-sm font-medium md:w-full ${
                  section === item.key
                    ? 'bg-[#9D6638] font-semibold text-[#F7F1DE]'
                    : 'bg-transparent text-[#4E220F]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-12 pt-6 sm:px-6 sm:pb-16 sm:pt-8 lg:px-12 lg:pb-20 lg:pt-10">
            {section === 'profile' && (
              <ResumeUpload
                userId={userId}
                initialProfile={profile}
                onProfileUpdated={handleProfileUpdated}
              />
            )}
            {section === 'jobs' && (
              <JobsSection
                userId={userId}
                hasProfile={!!profile}
                onGoToProfile={goToProfile}
                defaultTitle={profile?.job_titles?.[0] ?? ''}
                refreshSignal={refreshSignal}
                applicationsRefreshSignal={applicationsRefreshSignal}
                onApplicationsChanged={bumpApplicationsRefresh}
              />
            )}
            {section === 'applications' && (
              <ApplicationsSection
                userId={userId}
                hasProfile={!!profile}
                onGoToProfile={goToProfile}
                onGoToJobs={goToJobs}
                refreshSignal={applicationsRefreshSignal}
                onChanged={bumpApplicationsRefresh}
              />
            )}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
