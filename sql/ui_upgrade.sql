alter table if exists raw_feed_items add column if not exists image_url text;
alter table if exists topic_candidates add column if not exists image_url text;
