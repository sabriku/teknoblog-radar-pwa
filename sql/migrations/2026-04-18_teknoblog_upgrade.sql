create extension if not exists pgcrypto;

create table if not exists sources (
  id bigint generated always as identity primary key,
  name text not null,
  feed_url text not null unique,
  site_url text,
  source_type text not null default 'news' check (source_type in ('news','official','deal','blog')),
  market_relevance text not null default 'global' check (market_relevance in ('global','turkey','mixed')),
  priority_weight int not null default 50 check (priority_weight between 0 and 100),
  trust_score int not null default 50 check (trust_score between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table raw_feed_items
  add column if not exists source_id bigint references sources(id) on delete set null,
  add column if not exists canonical_url text,
  add column if not exists canonical_url_hash text,
  add column if not exists content_language text,
  add column if not exists source_type text,
  add column if not exists market_relevance text,
  add column if not exists trust_score int default 50,
  add column if not exists priority_weight int default 50;

create unique index if not exists raw_feed_items_canonical_url_hash_uniq on raw_feed_items(canonical_url_hash) where canonical_url_hash is not null;
create index if not exists raw_feed_items_source_id_idx on raw_feed_items(source_id);

alter table topic_candidates
  add column if not exists source_name text,
  add column if not exists source_type text,
  add column if not exists market_relevance text,
  add column if not exists trust_score int default 50,
  add column if not exists priority_weight int default 50,
  add column if not exists content_type_hint text check (content_type_hint in ('hot_news','launch','update','guide','comparison','deal','analysis')),
  add column if not exists topic_cluster_key text,
  add column if not exists canonical_topic_title text,
  add column if not exists source_count int not null default 1,
  add column if not exists published_at timestamptz;

create index if not exists topic_candidates_type_score_idx on topic_candidates(content_type_hint, total_score desc);
create index if not exists topic_candidates_cluster_idx on topic_candidates(topic_cluster_key);

create table if not exists source_blacklist_terms (
  id bigint generated always as identity primary key,
  term text not null unique,
  created_at timestamptz not null default now()
);
