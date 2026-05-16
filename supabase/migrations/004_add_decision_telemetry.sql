-- Sprint 4: persisted user preference telemetry for few-shot injection
create table if not exists public.decision_telemetry (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  key        text not null default '',
  decision   text not null,
  original   text not null default '',
  tailored   text not null default '',
  job_title  text not null default '',
  company    text not null default '',
  created_at timestamptz not null,
  constraint decision_telemetry_user_ts_unique unique (user_id, created_at)
);

alter table public.decision_telemetry enable row level security;

create policy "Users can manage own telemetry" on public.decision_telemetry
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
