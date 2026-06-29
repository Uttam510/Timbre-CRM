-- Timbre Signal — database schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  source text default 'youtube',
  external_id text unique,          -- YouTube channel id, used for dedupe
  name text not null,
  url text,
  segment text,
  location text,
  subs integer default 0,

  contact_email text,
  contact_link text,                 -- best website link found on the channel
  fit_reasons jsonb default '[]'::jsonb,
  scores jsonb default '{}'::jsonb,  -- { fit, reach, need, timing, total }
  score integer default 0,
  grade text default 'D',

  status text default 'New',         -- New / Researching / Contacted / Replied / Won / Lost
  outreach jsonb,                    -- { subject, body }
  last_message_id text,
  sent_at timestamptz
);

-- Backfill for databases created before contact_link existed.
alter table leads add column if not exists contact_link text;

create index if not exists leads_score_idx on leads (score desc);
create index if not exists leads_status_idx on leads (status);
