import { json, parseFeedItems, safeText } from './_lib.js';

const GOOGLE_NEWS_TECH_RSS = 'https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvSkwyMHZNR1ptZHpWbUVnSjBjaG9DVkZJb0FBUAE?hl=tr&gl=TR&ceid=TR:tr';

function sourceFromTitle(title = '') {
  const text = String(title || '').trim();
  const parts = text.split(' - ');
  return parts.length > 1 ? parts[parts.length - 1].trim() : 'Google News';
}

function cleanTitle(title = '') {
  const text = String(title || '').trim();
  const parts = text.split(' - ');
  if (parts.length <= 1) return text;
  return parts.slice(0, -1).join(' - ').trim() || text;
}

function normalizeItem(item = {}) {
  const title = safeText(item.title || '');
  const clean = cleanTitle(title);
  const source = sourceFromTitle(title);
  return {
    title: clean,
    url: item.url || '',
    source_name: source,
    published_at: item.published_at || '',
    summary: safeText(item.summary || ''),
    image_url: item.image_url || ''
  };
}

export default async function handler(req, res) {
  try {
    const response = await fetch(GOOGLE_NEWS_TECH_RSS, {
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
        'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      }
    });

    if (!response.ok) {
      return json(res, 502, { error: `Google News RSS alınamadı: HTTP ${response.status}` });
    }

    const xml = await response.text();
    const items = parseFeedItems(xml)
      .map(normalizeItem)
      .filter((item) => item.title && item.url)
      .slice(0, Math.min(40, Math.max(1, Number(req.query?.limit || 24))));

    return json(res, 200, {
      items,
      count: items.length,
      refreshed_at: new Date().toISOString(),
      source: 'Google News Bilim ve Teknoloji',
      source_url: GOOGLE_NEWS_TECH_RSS
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
