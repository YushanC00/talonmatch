-- Migration 001: Fix applications table RLS + constraint
-- Run this in Supabase SQL Editor if the table was already created

-- 1. Add explicit WITH CHECK to the RLS policy (required by PostgREST for upsert)
drop policy if exists "Users can manage own applications" on public.applications;

create policy "Users can manage own applications" on public.applications
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Replace unique index with a named constraint (PostgREST onConflict needs this)
drop index if exists applications_user_job_idx;

alter table public.applications
  add constraint if not exists applications_user_job_unique
  unique (user_id, job_id);

-- Tell PostgREST to reload its schema cache immediately
notify pgrst, 'reload schema';
