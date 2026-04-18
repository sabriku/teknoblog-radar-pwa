insert into sources (name, feed_url, site_url, source_type, market_relevance, priority_weight, trust_score, is_active)
values
  ('The Verge', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com', 'news', 'global', 82, 88, true),
  ('TechCrunch', 'https://feeds.feedburner.com/TechCrunch/', 'https://techcrunch.com', 'news', 'global', 78, 84, true),
  ('Engadget', 'https://www.engadget.com/rss.xml', 'https://www.engadget.com', 'news', 'global', 74, 82, true),
  ('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'https://arstechnica.com', 'news', 'global', 80, 87, true),
  ('9to5Mac', 'https://9to5mac.com/feed/', 'https://9to5mac.com', 'news', 'global', 86, 88, true),
  ('9to5Google', 'https://9to5google.com/feed/', 'https://9to5google.com', 'news', 'global', 86, 88, true),
  ('Android Authority', 'https://www.androidauthority.com/feed/', 'https://www.androidauthority.com', 'news', 'global', 80, 82, true),
  ('MacRumors', 'https://www.macrumors.com/macrumors.xml', 'https://www.macrumors.com', 'news', 'global', 88, 89, true),
  ('Apple Newsroom', 'https://www.apple.com/newsroom/rss-feed.rss', 'https://www.apple.com/newsroom/', 'official', 'global', 92, 98, true),
  ('Google Blog', 'https://blog.google/rss/', 'https://blog.google', 'official', 'global', 90, 97, true),
  ('Samsung Global Newsroom', 'https://news.samsung.com/global/feed', 'https://news.samsung.com/global', 'official', 'global', 88, 96, true),
  ('Microsoft News', 'https://news.microsoft.com/feed/', 'https://news.microsoft.com', 'official', 'global', 88, 97, true),
  ('Meta Newsroom', 'https://about.fb.com/news/feed/', 'https://about.fb.com/news/', 'official', 'global', 82, 96, true),
  ('OpenAI Blog', 'https://openai.com/news/rss.xml', 'https://openai.com/news', 'official', 'global', 90, 98, true),
  ('Adobe Blog', 'https://blog.adobe.com/en/publish/feeds/adobe-blog.xml', 'https://blog.adobe.com', 'official', 'global', 76, 94, true)
on conflict (feed_url) do update
set
  name = excluded.name,
  site_url = excluded.site_url,
  source_type = excluded.source_type,
  market_relevance = excluded.market_relevance,
  priority_weight = excluded.priority_weight,
  trust_score = excluded.trust_score,
  is_active = excluded.is_active,
  updated_at = now();

insert into source_blacklist_terms (term)
values
  ('affiliate'),
  ('grammarly'),
  ('commission junction'),
  ('plr'),
  ('email marketing'),
  ('content creator tools'),
  ('blogger'),
  ('2022'),
  ('2023'),
  ('2024'),
  ('how i get free traffic'),
  ('best wordpress plugin')
on conflict (term) do nothing;
