import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/DashboardClient';
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

  const profile = existingProfile as CandidateProfile | null;

  return <DashboardClient userId={user.id} initialProfile={profile} />;
}
