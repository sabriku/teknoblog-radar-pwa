insert into public.sources
  (name, feed_url, rss_url, site_url, source_type, market_relevance, priority_weight, trust_score, is_active)
values
  ('The Verge', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com', 'news', 'global', 86, 90, true),
  ('TechCrunch', 'https://techcrunch.com/feed/', 'https://techcrunch.com/feed/', 'https://techcrunch.com', 'news', 'global', 84, 88, true),
  ('Engadget', 'https://www.engadget.com/rss.xml', 'https://www.engadget.com/rss.xml', 'https://www.engadget.com', 'news', 'global', 80, 85, true),
  ('9to5Google', 'https://9to5google.com/feed/', 'https://9to5google.com/feed/', 'https://9to5google.com', 'news', 'global', 83, 86, true),
  ('9to5Mac', 'https://9to5mac.com/feed/', 'https://9to5mac.com/feed/', 'https://9to5mac.com', 'news', 'global', 83, 86, true),
  ('MacRumors', 'https://www.macrumors.com/macrumors.xml', 'https://www.macrumors.com/macrumors.xml', 'https://www.macrumors.com', 'news', 'global', 82, 87, true),
  ('Android Authority', 'https://www.androidauthority.com/feed/', 'https://www.androidauthority.com/feed/', 'https://www.androidauthority.com', 'news', 'global', 80, 84, true),
  ('LOG.com.tr', 'https://www.log.com.tr/feed/', 'https://www.log.com.tr/feed/', 'https://www.log.com.tr', 'news', 'turkey', 82, 78, true),
  ('Digital Trends', 'https://www.digitaltrends.com/feed/', 'https://www.digitaltrends.com/feed/', 'https://www.digitaltrends.com', 'news', 'global', 76, 80, true),
  ('TechRadar', 'https://www.techradar.com/feeds.xml', 'https://www.techradar.com/feeds.xml', 'https://www.techradar.com', 'news', 'global', 78, 82, true),
  ('Gizmochina', 'https://www.gizmochina.com/feed/', 'https://www.gizmochina.com/feed/', 'https://www.gizmochina.com', 'news', 'global', 74, 76, true),
  ('GSMArena', 'https://www.gsmarena.com/rss-news-reviews.php3', 'https://www.gsmarena.com/rss-news-reviews.php3', 'https://www.gsmarena.com', 'news', 'global', 85, 90, true),
  ('PhoneArena', 'https://www.phonearena.com/rss/news', 'https://www.phonearena.com/rss/news', 'https://www.phonearena.com', 'news', 'global', 80, 84, true),
  ('Tom''s Hardware', 'https://www.tomshardware.com/feeds/all', 'https://www.tomshardware.com/feeds/all', 'https://www.tomshardware.com', 'news', 'global', 82, 88, true),
  ('Windows Central', 'https://www.windowscentral.com/feed', 'https://www.windowscentral.com/feed', 'https://www.windowscentral.com', 'news', 'global', 79, 84, true),
  ('SamMobile', 'https://www.sammobile.com/feed/', 'https://www.sammobile.com/feed/', 'https://www.sammobile.com', 'news', 'global', 84, 88, true),
  ('VideoCardz', 'https://videocardz.com/feed', 'https://videocardz.com/feed', 'https://videocardz.com', 'news', 'global', 81, 86, true),
  ('Electrek', 'https://electrek.co/feed/', 'https://electrek.co/feed/', 'https://electrek.co', 'news', 'global', 77, 82, true)
on conflict do nothing;
