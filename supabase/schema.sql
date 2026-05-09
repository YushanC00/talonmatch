-- TalonMatch schema
-- Run in Supabase SQL Editor: https://app.supabase.com/project/_/sql

create table if not exists public.resumes (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null unique,
  skills     jsonb not null default '[]',
  experience jsonb not null default '[]',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.resumes enable row level security;

create policy "Users can read own resume" on public.resumes
  for select using (auth.uid() = user_id);

create policy "Users can upsert own resume" on public.resumes
  for all using (auth.uid() = user_id);

-- Applications: one row per user+job, stores tailored resume state
create table if not exists public.applications (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  job_id        text not null,
  job_title     text not null default '',
  company       text not null default '',
  tailored_json jsonb not null default '{}',
  status        text not null default 'tailored',
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

alter table public.applications
  add constraint if not exists applications_user_job_unique
  unique (user_id, job_id);

alter table public.applications enable row level security;

create policy "Users can manage own applications" on public.applications
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
