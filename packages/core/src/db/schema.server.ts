// Idempotent schema; applied on first DB use. Kept in TS so it ships in the server bundle.
export const SCHEMA = /* sql */ `
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  artist_name text not null,
  artist_id text,
  params jsonb not null default '{}',
  status text not null default 'pending',
  plan jsonb,
  baseline jsonb,
  created_at timestamptz not null default now()
);

create table if not exists trace_events (
  id bigserial primary key,
  run_id uuid not null references runs(id) on delete cascade,
  seq integer not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create table if not exists qloo_cache (
  key text primary key,
  url text not null,
  response jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists outreach (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  city text not null,
  venue_id text,
  venue_name text,
  status text not null default 'drafted',
  draft text,
  thread_token text unique,
  last_reply text,
  updated_at timestamptz not null default now()
);
alter table outreach add column if not exists stop_index integer;
alter table outreach add column if not exists subject text;
alter table outreach add column if not exists reply_summary text;
alter table outreach add column if not exists created_at timestamptz not null default now();
alter table outreach add column if not exists offer jsonb;

-- Logged results (post-show loop): calibrate the act's draw for the next plan.
create table if not exists show_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id) on delete set null,
  artist_id text not null,
  city text not null,
  fan_index real,
  attendance integer not null,
  gross numeric,
  notes text,
  played_on date,
  created_at timestamptz not null default now()
);
create index if not exists show_results_artist on show_results (artist_id);

-- Ticket pace check-ins (keeps-working loop) and per-city show prep.
create table if not exists checkins (
  id bigserial primary key,
  run_id uuid not null references runs(id) on delete cascade,
  stop_index integer not null,
  sold integer not null,
  created_at timestamptz not null default now()
);
create table if not exists show_prep (
  run_id uuid not null references runs(id) on delete cascade,
  stop_index integer not null,
  prep jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (run_id, stop_index)
);
`;
