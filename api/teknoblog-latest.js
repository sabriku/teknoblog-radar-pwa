import { json, parseFeedItems, safeText } from './_lib.js';

export default async function handler(req, res) {
  try {
    const response = await fetch('https://www.teknoblog.com/feed/', {
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
        'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return json(res, 500, { error: `Teknoblog feed alınamadı: HTTP ${response.status}` });
    }

    const xml = await response.text();
    const items = parseFeedItems(xml)
      .slice(0, 8)
      .map((item) => ({
        title: safeText(item.title || ''),
        url: item.url || '',
        published_at: item.published_at || ''
      }))
      .filter((item) => item.title && item.url);

    return json(res, 200, { items });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
