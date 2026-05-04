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
