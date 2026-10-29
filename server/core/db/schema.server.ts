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
`;
