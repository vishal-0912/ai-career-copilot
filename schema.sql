-- AI Career Copilot — Day 1 schema
-- Run in Supabase SQL editor

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

create policy "own profile" on profiles
  for all using (auth.uid() = id);

create policy "own resumes" on resumes
  for all using (auth.uid() = user_id);

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
create policy "resumes: owner can insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes: owner can select"
  on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "generated-docs: owner can insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'generated-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "generated-docs: owner can select"
  on storage.objects for select to authenticated
  using (bucket_id = 'generated-docs' and (storage.foldername(name))[1] = auth.uid()::text);