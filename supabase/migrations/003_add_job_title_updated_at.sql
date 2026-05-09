-- Migration 003: Add job_title and updated_at columns to applications

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS job_title  text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

NOTIFY pgrst, 'reload schema';
