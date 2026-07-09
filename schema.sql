-- AI Career Copilot — schema
-- Run in Supabase SQL editor. Safe to re-run in full at any point (every
-- create is guarded with if-not-exists / drop-if-exists / or-replace).

create extension if not exists vector;

-- Extends auth.users with app-level profile info
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz default now()
);

create table if not exists resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_file_url text not null,
  raw_text text,
  uploaded_at timestamptz default now()
);

create table if not exists candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid references resumes(id) on delete cascade,
  skills text[] default '{}',
  job_titles text[] default '{}',
  keywords text[] default '{}',
  years_experience numeric,
  summary text,
  raw_json jsonb,
  embedding vector(512), -- matches voyage-3-lite's output size; change if you swap embedding models
  created_at timestamptz default now()
);

-- Row level security: users only see their own rows
alter table profiles enable row level security;
alter table resumes enable row level security;
alter table candidate_profiles enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for all using (auth.uid() = id);

drop policy if exists "own resumes" on resumes;
create policy "own resumes" on resumes
  for all using (auth.uid() = user_id);

drop policy if exists "own candidate_profiles" on candidate_profiles;
create policy "own candidate_profiles" on candidate_profiles
  for all using (auth.uid() = user_id);

-- Auto-create a profiles row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage buckets + policies (creates them via SQL so you don't have to click through the dashboard)
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('generated-docs', 'generated-docs', false)
on conflict (id) do nothing;

-- Files are stored as "<user_id>/<filename>" (see ResumeUpload.tsx), so a user
-- may only touch objects whose first path segment matches their own auth.uid().
drop policy if exists "resumes: owner can insert" on storage.objects;
create policy "resumes: owner can insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resumes: owner can select" on storage.objects;
create policy "resumes: owner can select"
  on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "generated-docs: owner can insert" on storage.objects;
create policy "generated-docs: owner can insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'generated-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "generated-docs: owner can select" on storage.objects;
create policy "generated-docs: owner can select"
  on storage.objects for select to authenticated
  using (bucket_id = 'generated-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Day 2 additions — job feed + import
-- ============================================================

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null, -- 'adzuna' | 'jsearch' | 'import'
  external_id text not null,
  title text not null,
  company text,
  location text,
  salary_min numeric,
  salary_max numeric,
  jd_text text,
  jd_url text,
  posted_at timestamptz,
  raw_json jsonb,
  embedding vector(512), -- matches voyage-3-lite; keep in sync with candidate_profiles.embedding
  created_at timestamptz default now(),
  unique (source, external_id)
);

create table if not exists job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  match_percentage numeric,
  computed_at timestamptz default now(),
  unique (user_id, job_id)
);

create table if not exists import_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_url text not null,
  status text not null default 'pending', -- pending | parsed | failed
  error_message text,
  created_at timestamptz default now()
);

alter table jobs enable row level security;
alter table job_matches enable row level security;
alter table import_queue enable row level security;

-- jobs is a shared pool: any signed-in user can read it. All writes happen via
-- the backend's service_role key (bypasses RLS), so no insert/update policy
-- is needed here for normal app usage.
drop policy if exists "jobs readable by authenticated users" on jobs;
create policy "jobs readable by authenticated users" on jobs
  for select to authenticated using (true);

drop policy if exists "own job_matches" on job_matches;
create policy "own job_matches" on job_matches
  for all using (auth.uid() = user_id);

drop policy if exists "own import_queue" on import_queue;
create policy "own import_queue" on import_queue
  for all using (auth.uid() = user_id);

-- Ranks jobs for a given user by embedding similarity (cosine) to their most
-- recent candidate profile. Called from the backend via supabase.rpc(...).
-- Computed live rather than cached in job_matches — cheap at hackathon scale
-- (hundreds of jobs), and always reflects the latest profile/job embeddings.
create or replace function match_jobs_for_user(p_user_id uuid)
returns table (
  id uuid,
  source text,
  title text,
  company text,
  location text,
  salary_min numeric,
  salary_max numeric,
  jd_text text,
  jd_url text,
  posted_at timestamptz,
  match_percentage numeric
)
language sql stable
as $$
  select
    j.id, j.source, j.title, j.company, j.location, j.salary_min, j.salary_max,
    j.jd_text, j.jd_url, j.posted_at,
    round(greatest(0, least(100, (1 - (j.embedding <=> cp.embedding)) * 100))::numeric, 1) as match_percentage
  from jobs j
  cross join lateral (
    select embedding
    from candidate_profiles
    where user_id = p_user_id
    order by created_at desc
    limit 1
  ) cp
  where j.embedding is not null
  order by j.embedding <=> cp.embedding asc;
$$;

-- ============================================================
-- Day 3 additions — tailored resume + cover letter generation
-- ============================================================

-- Contact info wasn't captured on Day 1 (only summary/skills/titles/keywords),
-- but the resume DOCX header needs it. Nullable + backfilled going forward —
-- existing rows just won't have these until the user re-uploads.
alter table candidate_profiles add column if not exists full_name text;
alter table candidate_profiles add column if not exists email text;
alter table candidate_profiles add column if not exists phone text;

create table if not exists generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  type text not null, -- 'resume' | 'cover_letter'
  file_url text not null, -- storage path, not a signed URL (those expire)
  ats_score numeric, -- null for cover letters, which aren't ATS-scored
  iteration_count integer,
  created_at timestamptz default now()
);

alter table generated_documents enable row level security;

drop policy if exists "own generated_documents" on generated_documents;
create policy "own generated_documents" on generated_documents
  for all using (auth.uid() = user_id);

-- ============================================================
-- Fix — per-user job visibility
-- ============================================================
-- jobs stays a shared pool (dedup + embedding cost stay low across users
-- searching similar roles), but each user's feed should only ever show jobs
-- THEY fetched (via refresh) or imported — not the whole shared pool.
-- user_jobs is the linking table that records that.

create table if not exists user_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, job_id)
);

alter table user_jobs enable row level security;

drop policy if exists "own user_jobs" on user_jobs;
create policy "own user_jobs" on user_jobs
  for all using (auth.uid() = user_id);

-- Redefine to only rank jobs this user has actually fetched or imported
-- (previously ranked the ENTIRE shared jobs pool for every user — the bug
-- this fixes: users were seeing jobs other users had fetched/imported).
create or replace function match_jobs_for_user(p_user_id uuid)
returns table (
  id uuid,
  source text,
  title text,
  company text,
  location text,
  salary_min numeric,
  salary_max numeric,
  jd_text text,
  jd_url text,
  posted_at timestamptz,
  match_percentage numeric
)
language sql stable
as $$
  select
    j.id, j.source, j.title, j.company, j.location, j.salary_min, j.salary_max,
    j.jd_text, j.jd_url, j.posted_at,
    round(greatest(0, least(100, (1 - (j.embedding <=> cp.embedding)) * 100))::numeric, 1) as match_percentage
  from jobs j
  join user_jobs uj on uj.job_id = j.id and uj.user_id = p_user_id
  cross join lateral (
    select embedding
    from candidate_profiles
    where user_id = p_user_id
    order by created_at desc
    limit 1
  ) cp
  where j.embedding is not null
  order by j.embedding <=> cp.embedding asc;
$$;

-- ============================================================
-- Day 4 additions — application tracking
-- ============================================================

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  status text not null default 'saved', -- saved | applied | interviewing | offer | rejected
  resume_document_id uuid references generated_documents(id) on delete set null,
  cover_letter_document_id uuid references generated_documents(id) on delete set null,
  notes text,
  applied_at timestamptz, -- set the first time status moves to 'applied' or beyond
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, job_id)
);

alter table applications enable row level security;

drop policy if exists "own applications" on applications;
create policy "own applications" on applications
  for all using (auth.uid() = user_id);
