import { registryKinds } from "../disciplines/labels.ts";

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;
// Kind-of-act display names (disciplines/labels.server.ts): seeded from the registry; existing
// rows are never overwritten, so edits made with `npm run kinds:set` survive.
const ACT_KINDS_SEED = registryKinds()
  .map((k) => `(${lit(k.kind)}, ${lit(k.label)}, ${lit(k.hint)}, ${k.sort})`)
  .join(",\n  ");

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

-- "Your work" without accounts (PLAN Q16): ids are random uuids (capability links); whoever creates
-- a run or project gets an owner key, stored here only as its sha256 hex. Null = made before keys
-- (or through MCP): stays editable by link, can't be deleted from the website.
alter table runs add column if not exists owner_hash text;
alter table projects add column if not exists owner_hash text;
-- Finished AI outputs inside a run (per-city worker picks), so a resumed run reuses them.
create table if not exists run_steps (
  run_id uuid not null references runs(id) on delete cascade,
  step text not null,
  key text not null,
  output jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, step, key)
);

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

-- Stable night identity (PLAN Q19): show notes and check-ins carry the night's key (city + room),
-- so when the act edits the plan only the changed nights lose their notes. Null = made before keys
-- (still keyed by night number). One set of notes per night key.
alter table show_prep add column if not exists stop_key text;
alter table show_prep drop constraint if exists show_prep_pkey;
create unique index if not exists show_prep_run_key on show_prep (run_id, stop_key);
alter table checkins add column if not exists stop_key text;

-- Act profile (PLAN Q21): who the act is, asked once; tours and events start from it. No accounts:
-- the browser that made it holds the owner key (sha256 here only).
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null,
  name text,
  kinds jsonb not null default '[]', -- every kind the act does, main first (Q21)
  listed boolean not null default true,
  basis text,
  peers jsonb not null default '[]',
  styles jsonb not null default '[]',
  home jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles add column if not exists kinds jsonb not null default '[]';
alter table runs add column if not exists profile_id uuid references profiles(id) on delete set null;
-- Workspace archive (Q21): null = automatic (archived once the last date has passed),
-- true = archived by hand, false = restored by hand.
alter table runs add column if not exists archived boolean;
alter table projects add column if not exists archived boolean;
-- One-off events (Q21): a gig, a gallery show, a talk, a residency. Dates and venue are optional
-- for drafts; the venue is the act's own (name + address) or one of Tourbo's suggested rooms from
-- the event's helper plan (run_id, a one-night plan around the city).
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null,
  profile_id uuid references profiles(id) on delete set null,
  title text not null,
  artist text not null,
  kind text not null,
  city jsonb not null, -- { name, lat, lon }
  start_date date,
  end_date date,
  venue jsonb, -- { name, address?, source: own | tourbo, venueId?, profit?, currency? }
  run_id uuid references runs(id) on delete set null,
  archived boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_profile on events (profile_id);
-- A tour's nights are events too (tour_id = the tour's run, stop_key = the night's stable key);
-- a one-off event has no tour. Rows for a tour are synced from its plan (events.server.ts).
alter table events add column if not exists tour_id uuid references runs(id) on delete cascade;
alter table events add column if not exists stop_key text;
-- Classes and seatings: { sessions, seats } (teacher, maker, dancer, circus, chef). Optional.
alter table events add column if not exists classes jsonb;
create unique index if not exists events_tour_night on events (tour_id, stop_key);

-- Material (Q21): the act's library of songs, bits, talks, pieces, owned by the act profile
-- (owner_hash = the profile's). An event's set is an ordered list of material refs; deleting an
-- event drops its set rows, never the material.
create table if not exists material (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  owner_hash text not null,
  kind text,
  title text not null,
  type text not null,
  length_min real,
  notes text,
  tags text[] not null default '{}',
  origin text not null default 'original', -- original | cover | local_idea
  source jsonb, -- local ideas: { ref, category?, city }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists material_profile on material (profile_id);
-- Per-kind details (key, tempo, energy, marker, size, price, course, part): optional, additive.
alter table material add column if not exists details jsonb;
create table if not exists event_set (
  event_id uuid not null references events(id) on delete cascade,
  position int not null,
  material_id uuid not null references material(id) on delete cascade,
  primary key (event_id, position)
);
create index if not exists event_set_material on event_set (material_id);

-- AI assists (Q21): finished drafts per task + input hash (library parse / tags, titles), so the
-- same paste never pays twice. Run-bound assists (row insights) live in run_steps instead.
create table if not exists assists (
  task text not null,
  key text not null,
  output jsonb not null,
  created_at timestamptz not null default now(),
  primary key (task, key)
);

-- Kind-of-act labels, hints, order and on/off; registry defaults, edits survive restarts.
create table if not exists act_kinds (
  kind text primary key,
  label text not null,
  hint text not null,
  sort int not null,
  enabled boolean not null default true,
  updated_at timestamptz default now()
);
insert into act_kinds (kind, label, hint, sort) values
  ${ACT_KINDS_SEED}
on conflict (kind) do nothing;
`;
