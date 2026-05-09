-- Migration 002: Add missing columns to applications table
-- Run this in Supabase SQL Editor if your table was created without job_title / company / timestamps

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS job_title  text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company    text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ensure unique constraint exists (safe no-op if already present)
ALTER TABLE public.applications
  ADD CONSTRAINT IF NOT EXISTS applications_user_job_unique
  UNIQUE (user_id, job_id);

-- Notify PostgREST to pick up schema changes immediately
NOTIFY pgrst, 'reload schema';
