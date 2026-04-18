create extension if not exists pgcrypto;
create extension if not exists pg_net;

create table if not exists sources (
  id bigserial primary key,
  name text not null,
  rss_url text not null unique,
  site_url text,
  source_type text not null default 'news',
  market_relevance text not null default 'global',
  priority_weight integer not null default 50,
  trust_score integer not null default 70,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists raw_feed_items (
  id bigserial primary key,
  source_id bigint references sources(id) on delete cascade,
  guid_hash text not null unique,
  title text,
  link text,
  summary text,
  image_url text,
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);

create table if not exists topic_candidates (
  id bigserial primary key,
  raw_item_id bigint unique references raw_feed_items(id) on delete cascade,
  title text not null,
  url text not null,
  summary text,
  image_url text,
  content_type_hint text not null default 'hot_news',
  total_score integer not null default 0,
  traffic_score integer not null default 0,
  conversion_score integer not null default 0,
  discover_score integer not null default 0,
  social_score integer not null default 0,
  editorial_score integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pipeline_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ingested_count integer not null default 0,
  processed_count integer not null default 0,
  status text not null default 'running',
  notes text
);

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_sources_updated before update on sources
for each row execute procedure touch_updated_at();

create trigger trg_topic_candidates_updated before update on topic_candidates
for each row execute procedure touch_updated_at();
