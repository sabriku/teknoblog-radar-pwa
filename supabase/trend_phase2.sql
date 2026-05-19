create extension if not exists pgcrypto;

create table if not exists trend_signals (
  id uuid primary key default gen_random_uuid(),
  signal_hash text not null unique,
  source_type text not null,
  source_name text not null,
  market_scope text not null default 'global',
  country_code text,
  topic_text text not null,
  normalized_topic text not null,
  signal_score integer not null default 0,
  time_window text not null default '24h',
  detected_at timestamptz not null default now(),
  signal_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trend_signals_detected_at_idx on trend_signals (detected_at desc);
create index if not exists trend_signals_normalized_topic_idx on trend_signals (normalized_topic);
create index if not exists trend_signals_source_type_idx on trend_signals (source_type);

create table if not exists trend_clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_key text not null unique,
  cluster_name text not null,
  market_scope text not null default 'global',
  country_code text,
  source_count integer not null default 0,
  signal_count integer not null default 0,
  competitor_count integer not null default 0,
  turkey_interest_score integer not null default 0,
  early_signal_score integer not null default 0,
  trend_score integer not null default 0,
  discover_potential_score integer not null default 0,
  seo_potential_score integer not null default 0,
  affiliate_potential_score integer not null default 0,
  recommendation_type text not null default 'detay_haber',
  status text not null default 'emerging',
  summary jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trend_clusters_trend_score_idx on trend_clusters (trend_score desc);
create index if not exists trend_clusters_last_seen_at_idx on trend_clusters (last_seen_at desc);
create index if not exists trend_clusters_status_idx on trend_clusters (status);

create table if not exists trend_news_links (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references trend_clusters(id) on delete cascade,
  topic_candidate_id uuid references topic_candidates(id) on delete cascade,
  raw_feed_item_id uuid references raw_feed_items(id) on delete cascade,
  candidate_url text,
  candidate_title text,
  source_name text,
  match_score integer not null default 0,
  created_at timestamptz not null default now(),
  unique (cluster_id, topic_candidate_id),
  unique (cluster_id, raw_feed_item_id)
);

create index if not exists trend_news_links_cluster_id_idx on trend_news_links (cluster_id);
create index if not exists trend_news_links_match_score_idx on trend_news_links (match_score desc);

create table if not exists competitor_mentions (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references trend_clusters(id) on delete cascade,
  source_name text not null,
  article_title text,
  article_url text,
  published_at timestamptz,
  country_scope text,
  created_at timestamptz not null default now(),
  unique (cluster_id, source_name, article_url)
);

create index if not exists competitor_mentions_cluster_id_idx on competitor_mentions (cluster_id);
create index if not exists competitor_mentions_source_name_idx on competitor_mentions (source_name);
