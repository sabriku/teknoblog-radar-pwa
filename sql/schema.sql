create extension if not exists pgcrypto;

create table if not exists public.sources (
  id bigserial primary key,
  name text not null,
  feed_url text not null,
  rss_url text,
  site_url text,
  source_type text not null default 'news',
  market_relevance text not null default 'global',
  priority_weight integer not null default 50,
  trust_score integer not null default 70,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.raw_feed_items (
  id bigserial primary key,
  source_id bigint references public.sources(id) on delete set null,
  title text not null,
  url text not null,
  canonical_url text,
  summary text,
  image_url text,
  published_at timestamptz,
  content_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.topic_candidates (
  id bigserial primary key,
  raw_feed_item_id bigint not null unique references public.raw_feed_items(id) on delete cascade,
  source_id bigint references public.sources(id) on delete set null,
  title text not null,
  summary text,
  url text not null,
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
