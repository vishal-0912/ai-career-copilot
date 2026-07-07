import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ResumeUpload from '@/components/ResumeUpload';
import type { CandidateProfile } from '@/components/ProfileCard';

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Load the most recent AI career profile for this user, if one already exists,
  // so it survives logging out/back in or refreshing the page.
  const { data: existingProfile } = await supabase
    .from('candidate_profiles')
    .select('summary, skills, job_titles, keywords, years_experience')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your Career Copilot</h1>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-gray-500 underline">Log out</button>
        </form>
      </div>

      <ResumeUpload
        userId={user.id}
        initialProfile={existingProfile as CandidateProfile | null}
      />
    </main>
  );
}
