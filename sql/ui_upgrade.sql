alter table if exists public.raw_feed_items add column if not exists image_url text;
alter table if exists public.topic_candidates add column if not exists image_url text;
alter table if exists public.sources add column if not exists rss_url text;
alter table if exists public.sources add column if not exists site_url text;
update public.sources
set rss_url = coalesce(rss_url, feed_url)
where rss_url is null and feed_url is not null;
