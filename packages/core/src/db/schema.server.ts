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

-- Generic cache tier (packages/core/src/cache). qloo_cache above stays as a read-through source
-- for the "qloo" namespace (never dropped: it's large and slow to rebuild).
create table if not exists cache (
  namespace text not null,
  key text not null,
  value jsonb not null,
  stored_at timestamptz not null default now(),
  expires_at timestamptz,
  tags text[] not null default '{}',
  primary key (namespace, key)
);
create index if not exists cache_tags on cache using gin (tags);

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

-- Projects: one per tour or show. Notes, to-dos, setlist / bit drafts and saved city briefs;
-- plan runs attach to it. Same data on the website and through MCP tools.
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  kind text,
  created_at timestamptz not null default now()
);
create table if not exists project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null,
  city text,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists project_items_project on project_items (project_id, created_at);
alter table runs add column if not exists project_id uuid references projects(id) on delete set null;

-- World cities (GeoNames cities15000, CC BY 4.0), loaded by scripts/seed-cities.ts; never in git.
create table if not exists cities (
  id integer primary key, -- GeoNames id
  name text not null,
  ascii_name text not null,
  country text not null, -- ISO alpha-2
  admin1 text,
  lat double precision not null,
  lon double precision not null,
  population integer not null default 0,
  timezone text,
  continent text not null
);
create index if not exists cities_pop on cities (population desc);
create table if not exists countries (
  code text primary key, -- ISO alpha-2
  name text not null,
  continent text not null,
  currency text
);
create index if not exists cities_country on cities (country);

-- Home-page examples, built by scripts/prewarm-examples.ts from the engine; never in git.
create table if not exists home_examples (
  id text primary key,
  example jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists home_fan_density (
  fan_key text primary key,
  density jsonb not null,
  updated_at timestamptz not null default now()
);
`;
