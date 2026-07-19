WITH seed(id, name, feed_url, site_url, source_type, market_relevance, priority_weight, trust_score) AS (
  VALUES
    ('teknoblog', 'Teknoblog', 'https://www.teknoblog.com/feed/', 'https://www.teknoblog.com', 'owned', 'turkey', 100, 100),
    ('log', 'LOG', 'https://www.log.com.tr/feed/', 'https://www.log.com.tr', 'competitor', 'turkey', 90, 82),
    ('shiftdelete', 'ShiftDelete.Net', 'https://shiftdelete.net/feed', 'https://shiftdelete.net', 'competitor', 'turkey', 86, 80),
    ('donanimhaber', 'DonanımHaber', 'https://www.donanimhaber.com/rss/tum/', 'https://www.donanimhaber.com', 'competitor', 'turkey', 84, 82),
    ('webtekno', 'Webtekno', 'https://www.webtekno.com/rss.xml', 'https://www.webtekno.com', 'competitor', 'turkey', 78, 72),
    ('webrazzi', 'Webrazzi', 'https://webrazzi.com/feed/', 'https://webrazzi.com', 'news', 'turkey', 76, 84),
    ('the-verge', 'The Verge', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com', 'news', 'global', 90, 92),
    ('engadget', 'Engadget', 'https://www.engadget.com/rss.xml', 'https://www.engadget.com', 'news', 'global', 88, 88),
    ('techcrunch', 'TechCrunch', 'https://techcrunch.com/feed/', 'https://techcrunch.com', 'news', 'global', 86, 88),
    ('ars-technica', 'Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'https://arstechnica.com', 'news', 'global', 86, 94),
    ('wired', 'Wired', 'https://www.wired.com/feed/rss', 'https://www.wired.com', 'news', 'global', 80, 90),
    ('9to5google', '9to5Google', 'https://9to5google.com/feed/', 'https://9to5google.com', 'news', 'global', 86, 88),
    ('9to5mac', '9to5Mac', 'https://9to5mac.com/feed/', 'https://9to5mac.com', 'news', 'global', 86, 88),
    ('macrumors', 'MacRumors', 'https://www.macrumors.com/macrumors.xml', 'https://www.macrumors.com', 'news', 'global', 84, 88),
    ('android-police', 'Android Police', 'https://www.androidpolice.com/feed/', 'https://www.androidpolice.com', 'news', 'global', 82, 85),
    ('android-authority', 'Android Authority', 'https://www.androidauthority.com/feed/', 'https://www.androidauthority.com', 'news', 'global', 80, 84),
    ('sammobile', 'SamMobile', 'https://www.sammobile.com/feed/', 'https://www.sammobile.com', 'news', 'global', 84, 88),
    ('gsmarena', 'GSMArena', 'https://www.gsmarena.com/rss-news-reviews.php3', 'https://www.gsmarena.com', 'news', 'global', 85, 90),
    ('notebookcheck', 'Notebookcheck', 'https://www.notebookcheck.net/News.152.100.html', 'https://www.notebookcheck.net', 'news', 'global', 78, 84),
    ('windows-central', 'Windows Central', 'https://www.windowscentral.com/rss', 'https://www.windowscentral.com', 'news', 'global', 79, 84),
    ('toms-hardware', 'Tom''s Hardware', 'https://www.tomshardware.com/feeds/all', 'https://www.tomshardware.com', 'news', 'global', 82, 88),
    ('videocardz', 'VideoCardz', 'https://videocardz.com/rss', 'https://videocardz.com', 'news', 'global', 78, 76),
    ('bleepingcomputer', 'BleepingComputer', 'https://www.bleepingcomputer.com/feed/', 'https://www.bleepingcomputer.com', 'news', 'global', 82, 92),
    ('openai-news', 'OpenAI News', 'https://openai.com/news/rss.xml', 'https://openai.com/news', 'official', 'global', 94, 98),
    ('google-blog', 'Google Blog', 'https://blog.google/rss/', 'https://blog.google', 'official', 'global', 92, 98),
    ('microsoft-blog', 'Microsoft Blog', 'https://blogs.microsoft.com/feed/', 'https://blogs.microsoft.com', 'official', 'global', 90, 98),
    ('nvidia-blog', 'NVIDIA Blog', 'https://blogs.nvidia.com/feed/', 'https://blogs.nvidia.com', 'official', 'global', 88, 98),
    ('apple-newsroom', 'Apple Newsroom', 'https://www.apple.com/newsroom/rss-feed.rss', 'https://www.apple.com/newsroom/', 'official', 'global', 98, 100),
    ('android-developers', 'Android Developers', 'https://android-developers.googleblog.com/feeds/posts/default', 'https://android-developers.googleblog.com', 'official', 'global', 94, 99),
    ('google-security', 'Google Security Blog', 'https://security.googleblog.com/feeds/posts/default', 'https://security.googleblog.com', 'official', 'global', 94, 99),
    ('github-blog', 'GitHub Blog', 'https://github.blog/feed/', 'https://github.blog', 'official', 'global', 88, 96),
    ('cloudflare-blog', 'Cloudflare Blog', 'https://blog.cloudflare.com/rss/', 'https://blog.cloudflare.com', 'official', 'global', 88, 97)
)
INSERT INTO sources (id, name, feed_url, rss_url, site_url, source_type, market_relevance, priority_weight, trust_score, is_active)
SELECT s.id, s.name, s.feed_url, s.feed_url, s.site_url, s.source_type, s.market_relevance, s.priority_weight, s.trust_score, TRUE
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM sources existing
  WHERE lower(coalesce(existing.rss_url, existing.feed_url, '')) = lower(s.feed_url)
     OR lower(coalesce(existing.site_url, '')) = lower(s.site_url)
);

UPDATE sources SET
  feed_url='https://news.google.com/rss/search?q=site%3Avideocardz.com&hl=en-US&gl=US&ceid=US%3Aen',
  rss_url='https://news.google.com/rss/search?q=site%3Avideocardz.com&hl=en-US&gl=US&ceid=US%3Aen',
  updated_at=NOW()
WHERE id='videocardz';
