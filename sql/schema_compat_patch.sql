alter table if exists public.sources
  add column if not exists rss_url text,
  add column if not exists site_url text,
  add column if not exists source_type text default 'news',
  add column if not exists market_relevance text default 'global',
  add column if not exists priority_weight integer default 50,
  add column if not exists trust_score integer default 70,
  add column if not exists is_active boolean default true,
  add column if not exists updated_at timestamptz default now();

update public.sources
set rss_url = coalesce(rss_url, feed_url)
where (rss_url is null or rss_url = '')
  and feed_url is not null
  and feed_url <> '';

update public.sources
set feed_url = coalesce(feed_url, rss_url)
where (feed_url is null or feed_url = '')
  and rss_url is not null
  and rss_url <> '';

create table if not exists public.pipeline_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  ingested_count integer not null default 0,
  processed_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.raw_feed_items (
  id bigserial primary key,
  source_id bigint references public.sources(id) on delete set null,
  title text not null default '',
  url text not null default '',
  canonical_url text,
  summary text,
  image_url text,
  published_at timestamptz,
  content_hash text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.topic_candidates (
  id bigserial primary key,
  raw_feed_item_id bigint unique references public.raw_feed_items(id) on delete cascade,
  source_id bigint references public.sources(id) on delete set null,
  title text not null default '',
  summary text,
  url text not null default '',
  image_url text,
  published_at timestamptz,
  content_type_hint text not null default 'analysis',
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
