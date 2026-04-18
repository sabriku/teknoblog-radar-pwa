insert into sources (name, rss_url, site_url, source_type, market_relevance, priority_weight, trust_score, is_active)
values
('The Verge', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com', 'news', 'global', 82, 88, true),
('TechCrunch', 'https://techcrunch.com/feed/', 'https://techcrunch.com', 'news', 'global', 76, 85, true),
('Engadget', 'https://www.engadget.com/rss.xml', 'https://www.engadget.com', 'news', 'global', 74, 83, true),
('9to5Google', 'https://9to5google.com/feed/', 'https://9to5google.com', 'news', 'global', 84, 86, true),
('9to5Mac', 'https://9to5mac.com/feed/', 'https://9to5mac.com', 'news', 'global', 84, 86, true),
('MacRumors', 'https://www.macrumors.com/macrumors.xml', 'https://www.macrumors.com', 'news', 'global', 86, 88, true),
('Android Authority', 'https://www.androidauthority.com/feed/', 'https://www.androidauthority.com', 'news', 'global', 80, 82, true),
('OpenAI Blog', 'https://openai.com/news/rss.xml', 'https://openai.com', 'official', 'global', 92, 95, true),
('Google Blog', 'https://blog.google/rss/', 'https://blog.google', 'official', 'global', 90, 94, true),
('Apple Newsroom', 'https://www.apple.com/newsroom/rss-feed.rss', 'https://www.apple.com/newsroom/', 'official', 'global', 92, 96, true),
('Samsung Global Newsroom', 'https://news.samsung.com/global/feed', 'https://news.samsung.com/global', 'official', 'global', 88, 94, true),
('Microsoft News', 'https://news.microsoft.com/feed/', 'https://news.microsoft.com', 'official', 'global', 88, 94, true),
('Meta Newsroom', 'https://about.fb.com/news/feed/', 'https://about.fb.com/news/', 'official', 'global', 86, 92, true),
('Adobe Blog', 'https://blog.adobe.com/en/feed', 'https://blog.adobe.com', 'official', 'global', 82, 90, true),
('Qualcomm Newsroom', 'https://www.qualcomm.com/news/onq/feed', 'https://www.qualcomm.com/news', 'official', 'global', 80, 90, true),
('Intel Newsroom', 'https://www.intel.com/content/www/us/en/newsroom/rss-feed.xml', 'https://www.intel.com/newsroom/', 'official', 'global', 80, 90, true)
on conflict (rss_url) do nothing;
