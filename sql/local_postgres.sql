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

CREATE TABLE IF NOT EXISTS editorial_queue (
  id BIGSERIAL PRIMARY KEY,
  candidate_id TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source_name TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority INTEGER NOT NULL DEFAULT 50,
  notes TEXT,
  assigned_to TEXT,
  published_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS source_health (
  source_id TEXT PRIMARY KEY,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  quality_score INTEGER NOT NULL DEFAULT 50,
  last_status TEXT NOT NULL DEFAULT 'unknown',
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_clusters (
  id BIGSERIAL PRIMARY KEY,
  cluster_key TEXT NOT NULL UNIQUE,
  cluster_name TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  momentum_score INTEGER NOT NULL DEFAULT 0,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS early_signal_snapshots (
  id BIGSERIAL PRIMARY KEY,
  cluster_key TEXT NOT NULL,
  capture_bucket TIMESTAMPTZ NOT NULL,
  early_signal_score INTEGER NOT NULL DEFAULT 0,
  first_mover_score INTEGER NOT NULL DEFAULT 0,
  breakout_probability INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  competitor_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cluster_key,capture_bucket)
);

CREATE TABLE IF NOT EXISTS google_trends_cache (
  cache_key TEXT PRIMARY KEY,
  geo TEXT NOT NULL,
  window_hours INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_news_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teknoblog_content (
  id BIGSERIAL PRIMARY KEY,
  wp_id BIGINT UNIQUE,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  image_url TEXT,
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS published_performance (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  published_at TIMESTAMPTZ,
  discover_clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  discover_impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  discover_ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  google_news_clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  google_news_impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  web_clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  web_impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS smart_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_key TEXT NOT NULL UNIQUE,
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_checks (
  url TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  content_type TEXT,
  content_length BIGINT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  encrypted_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_snapshots (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  search_type TEXT NOT NULL,
  clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(url,snapshot_date,search_type)
);

CREATE TABLE IF NOT EXISTS intelligence_models (
  id BIGSERIAL PRIMARY KEY,
  model_version TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sample_count INTEGER NOT NULL DEFAULT 0,
  discover_positive_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  news_positive_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  model JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS content_predictions (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  candidate_id TEXT,
  title TEXT,
  source_name TEXT,
  model_version TEXT NOT NULL,
  discover_probability DOUBLE PRECISION NOT NULL DEFAULT 0,
  news_probability DOUBLE PRECISION NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0,
  expected_clicks_low INTEGER NOT NULL DEFAULT 0,
  expected_clicks_high INTEGER NOT NULL DEFAULT 0,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(url,model_version)
);

CREATE TABLE IF NOT EXISTS editorial_feedback (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  source_name TEXT,
  decision TEXT NOT NULL,
  notes TEXT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prediction_outcomes (
  id BIGSERIAL PRIMARY KEY,
  prediction_url TEXT NOT NULL,
  published_url TEXT NOT NULL,
  model_version TEXT,
  match_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  discover_probability DOUBLE PRECISION NOT NULL DEFAULT 0,
  news_probability DOUBLE PRECISION NOT NULL DEFAULT 0,
  discover_clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  discover_impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  news_clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  news_impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  expected_clicks_low INTEGER NOT NULL DEFAULT 0,
  expected_clicks_high INTEGER NOT NULL DEFAULT 0,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observed_at TIMESTAMPTZ,
  UNIQUE(prediction_url,published_url)
);

CREATE TABLE IF NOT EXISTS weekly_intelligence_reports (
  week_start DATE PRIMARY KEY,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cluster_lifecycle_events (
  id BIGSERIAL PRIMARY KEY,
  cluster_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT,
  source_name TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(cluster_key,event_type,to_stage,occurred_at)
);

CREATE TABLE IF NOT EXISTS source_leadership_stats (
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  beat TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  first_break_count INTEGER NOT NULL DEFAULT 0,
  corroboration_count INTEGER NOT NULL DEFAULT 0,
  avg_lead_minutes INTEGER NOT NULL DEFAULT 0,
  leadership_score INTEGER NOT NULL DEFAULT 0,
  success_score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(source_id,beat)
);

CREATE TABLE IF NOT EXISTS radar_watchlists (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  beats JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  alert_threshold INTEGER NOT NULL DEFAULT 65,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

ALTER TABLE source_health ADD COLUMN IF NOT EXISTS last_status TEXT DEFAULT 'unknown';
ALTER TABLE source_health ADD COLUMN IF NOT EXISTS inserted_count INTEGER DEFAULT 0;
ALTER TABLE source_health ADD COLUMN IF NOT EXISTS updated_count INTEGER DEFAULT 0;
ALTER TABLE source_health ADD COLUMN IF NOT EXISTS duplicate_count INTEGER DEFAULT 0;
ALTER TABLE content_predictions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE content_predictions ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE content_predictions ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;
ALTER TABLE editorial_feedback ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE editorial_feedback ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE editorial_feedback ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS early_signal_score INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS first_mover_score INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS breakout_probability INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS competitor_count INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS official_source_count INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS owned_coverage BOOLEAN DEFAULT FALSE;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS lead_window_minutes INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS signal_stage TEXT DEFAULT 'watch';
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS first_source_name TEXT;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT DEFAULT 'detected';
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS novelty_score INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS spread_score INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS opportunity_minutes INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS opportunity_expires_at TIMESTAMPTZ;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS story_type TEXT DEFAULT 'news';
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS beat TEXT DEFAULT 'general';
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS country_count INTEGER DEFAULT 0;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS countries JSONB DEFAULT '[]'::jsonb;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS source_timeline JSONB DEFAULT '[]'::jsonb;
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS editorial_package JSONB DEFAULT '{}'::jsonb;

ALTER TABLE editorial_feedback ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE editorial_feedback ADD COLUMN IF NOT EXISTS cluster_key TEXT;

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
CREATE INDEX IF NOT EXISTS idx_editorial_queue_status ON editorial_queue(status, priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_health_quality ON source_health(quality_score, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_clusters_momentum ON content_clusters(momentum_score DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_teknoblog_content_published ON teknoblog_content(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_teknoblog_content_search ON teknoblog_content USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(excerpt,'')));
CREATE INDEX IF NOT EXISTS idx_performance_observed ON published_performance(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_smart_alerts_status ON smart_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_date ON performance_snapshots(snapshot_date DESC,search_type);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_url ON performance_snapshots(url,snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_probability ON content_predictions(discover_probability DESC,news_probability DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_url ON editorial_feedback(url,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_published ON prediction_outcomes(published_url,observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_model ON prediction_outcomes(model_version,matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_topic_candidates_search ON topic_candidates USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source_name,'')));
CREATE INDEX IF NOT EXISTS idx_raw_feed_items_search ON raw_feed_items USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source_name,'')));
CREATE INDEX IF NOT EXISTS idx_content_clusters_search ON content_clusters USING GIN (to_tsvector('simple', coalesce(cluster_name,'') || ' ' || coalesce(payload::text,'')));
CREATE INDEX IF NOT EXISTS idx_content_clusters_early ON content_clusters(owned_coverage,first_mover_score DESC,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_clusters_lifecycle ON content_clusters(lifecycle_stage,opportunity_expires_at,first_mover_score DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_events_key ON cluster_lifecycle_events(cluster_key,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_events_type ON cluster_lifecycle_events(event_type,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_leadership_score ON source_leadership_stats(leadership_score DESC,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchlists_active ON radar_watchlists(is_active,updated_at DESC);

INSERT INTO radar_watchlists(name,keywords,beats,alert_threshold) VALUES
  ('Apple & Ekosistem','["apple","iphone","ipad","macbook","ios","macos","vision pro"]'::jsonb,'["apple"]'::jsonb,68),
  ('Android & Mobil','["android","samsung","galaxy","pixel","xiaomi","one ui","snapdragon"]'::jsonb,'["android","mobile"]'::jsonb,66),
  ('Yapay Zekâ','["yapay zeka","ai","openai","chatgpt","gemini","claude","copilot"]'::jsonb,'["ai"]'::jsonb,65),
  ('Siber Güvenlik','["güvenlik açığı","siber saldırı","veri ihlali","malware","ransomware","zero day"]'::jsonb,'["security"]'::jsonb,70),
  ('Türkiye Fiyat & Erişim','["türkiye","tl","fiyat","satışa çıktı","ön sipariş","kampanya"]'::jsonb,'["deals","mobile"]'::jsonb,64)
ON CONFLICT(name) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_early_signal_snapshots_time ON early_signal_snapshots(capture_bucket DESC,first_mover_score DESC);
CREATE INDEX IF NOT EXISTS idx_google_trends_cache_expiry ON google_trends_cache(expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_news_cache_expiry ON google_news_cache(expires_at DESC);
