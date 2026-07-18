CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  feed_url TEXT,
  rss_url TEXT,
  site_url TEXT,
  description TEXT,
  source_type TEXT NOT NULL DEFAULT 'news',
  market_relevance TEXT NOT NULL DEFAULT 'global',
  priority_weight INTEGER NOT NULL DEFAULT 50,
  trust_score INTEGER NOT NULL DEFAULT 70,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_feed_items (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  source_name TEXT,
  source_url TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  canonical_url TEXT,
  link TEXT,
  summary TEXT,
  description TEXT,
  excerpt TEXT,
  image_url TEXT,
  thumbnail TEXT,
  image TEXT,
  published_at TIMESTAMPTZ,
  content_hash TEXT UNIQUE,
  url_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_candidates (
  id TEXT PRIMARY KEY,
  raw_feed_item_id TEXT,
  source_id TEXT,
  source_name TEXT,
  title TEXT NOT NULL,
  item_title TEXT,
  feed_title TEXT,
  summary TEXT,
  description TEXT,
  excerpt TEXT,
  url TEXT NOT NULL,
  canonical_url TEXT,
  link TEXT,
  image_url TEXT,
  thumbnail TEXT,
  image TEXT,
  candidate_hash TEXT UNIQUE,
  content_type_hint TEXT NOT NULL DEFAULT 'analysis',
  total_score INTEGER NOT NULL DEFAULT 0,
  traffic_score INTEGER NOT NULL DEFAULT 0,
  conversion_score INTEGER NOT NULL DEFAULT 0,
  discover_score INTEGER NOT NULL DEFAULT 0,
  social_score INTEGER NOT NULL DEFAULT 0,
  editorial_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  ingested_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trend_signals (
  id TEXT PRIMARY KEY,
  signal_hash TEXT UNIQUE,
  source_type TEXT,
  source_name TEXT,
  market_scope TEXT DEFAULT 'global',
  country_code TEXT,
  category TEXT,
  topic_text TEXT NOT NULL,
  normalized_topic TEXT,
  signal_score INTEGER NOT NULL DEFAULT 0,
  time_window TEXT DEFAULT '24h',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signal_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trend_clusters (
  id BIGSERIAL PRIMARY KEY,
  cluster_key TEXT NOT NULL UNIQUE,
  cluster_name TEXT NOT NULL,
  market_scope TEXT DEFAULT 'global',
  country_code TEXT,
  source_count INTEGER NOT NULL DEFAULT 0,
  signal_count INTEGER NOT NULL DEFAULT 0,
  competitor_count INTEGER NOT NULL DEFAULT 0,
  turkey_interest_score INTEGER NOT NULL DEFAULT 0,
  early_signal_score INTEGER NOT NULL DEFAULT 0,
  trend_score INTEGER NOT NULL DEFAULT 0,
  discover_potential_score INTEGER NOT NULL DEFAULT 0,
  seo_potential_score INTEGER NOT NULL DEFAULT 0,
  affiliate_potential_score INTEGER NOT NULL DEFAULT 0,
  recommendation_type TEXT,
  status TEXT NOT NULL DEFAULT 'emerging',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trend_news_links (
  id BIGSERIAL PRIMARY KEY,
  cluster_id BIGINT NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
  topic_candidate_id TEXT,
  raw_feed_item_id TEXT,
  candidate_url TEXT,
  candidate_title TEXT,
  source_name TEXT,
  match_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS editor_actions (
  id BIGSERIAL PRIMARY KEY,
  candidate_id TEXT,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_blacklist_terms (
  id BIGSERIAL PRIMARY KEY,
  term TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sources ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS rss_url TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS site_url TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'news';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS market_relevance TEXT DEFAULT 'global';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS priority_weight INTEGER DEFAULT 50;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 70;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS excerpt TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS thumbnail TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS url_hash TEXT;
ALTER TABLE raw_feed_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS item_title TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS feed_title TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS excerpt TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS thumbnail TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE topic_candidates ADD COLUMN IF NOT EXISTS candidate_hash TEXT;

ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS signal_hash TEXT;
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS market_scope TEXT DEFAULT 'global';
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS time_window TEXT DEFAULT '24h';
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS signal_payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_items_content_hash ON raw_feed_items(content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_items_url_hash ON raw_feed_items(url_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_hash ON topic_candidates(candidate_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_raw_item ON topic_candidates(raw_feed_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trend_signal_hash ON trend_signals(signal_hash);
CREATE INDEX IF NOT EXISTS idx_sources_active_priority ON sources(is_active, priority_weight DESC);
CREATE INDEX IF NOT EXISTS idx_raw_items_created ON raw_feed_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_items_published ON raw_feed_items(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_candidates_status_created ON topic_candidates(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_status_published ON topic_candidates(status, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trend_signals_detected ON trend_signals(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_trend_clusters_status_seen ON trend_clusters(status, last_seen_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_trend_links_cluster ON trend_news_links(cluster_id);
