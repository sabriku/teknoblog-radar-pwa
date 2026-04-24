import { json, parseFeedItems, safeText } from './_lib.js';

function istanbulDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

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
    const todayKey = istanbulDayKey(new Date());
    const items = parseFeedItems(xml)
      .map((item) => ({
        title: safeText(item.title || ''),
        url: item.url || '',
        published_at: item.published_at || ''
      }))
      .filter((item) => item.title && item.url && istanbulDayKey(item.published_at) === todayKey)
      .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());

    return json(res, 200, { items, day_key: todayKey });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
