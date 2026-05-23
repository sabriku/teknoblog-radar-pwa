import { json, parseFeedItems, safeText } from './_lib.js';

const GOOGLE_NEWS_TECH_RSS = 'https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvSkwyMHZNR1ptZHpWbUVnSjBjaG9DVkZJb0FBUAE?hl=tr&gl=TR&ceid=TR:tr';
const REQUEST_TIMEOUT_MS = 12000;

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

function normalizeLimit(value) {
  const limit = Number(value || 24);
  if (!Number.isFinite(limit)) return 24;
  return Math.min(40, Math.max(1, Math.round(limit)));
}

function normalizePublishedAt(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString();
}

function normalizeItem(item = {}) {
  const title = safeText(item.title || '');
  const clean = cleanTitle(title);
  const source = sourceFromTitle(title);
  return {
    title: clean,
    url: item.url || '',
    source_name: source,
    published_at: normalizePublishedAt(item.published_at || ''),
    summary: safeText(item.summary || ''),
    image_url: item.image_url || ''
  };
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0 (+https://www.teknoblog.com/)',
        accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  try {
    const response = await fetchWithTimeout(GOOGLE_NEWS_TECH_RSS);

    if (!response.ok) {
      return json(res, 502, {
        error: `Google News RSS alınamadı: HTTP ${response.status}`,
        items: [],
        count: 0,
        refreshed_at: new Date().toISOString(),
        source: 'Google News Bilim ve Teknoloji',
        source_url: GOOGLE_NEWS_TECH_RSS
      });
    }

    const xml = await response.text();
    const limit = normalizeLimit(req.query?.limit);
    const seen = new Set();
    const items = [];

    for (const item of parseFeedItems(xml).map(normalizeItem)) {
      const key = `${item.title}::${item.url}`;
      if (!item.title || !item.url || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= limit) break;
    }

    return json(res, 200, {
      items,
      count: items.length,
      refreshed_at: new Date().toISOString(),
      source: 'Google News Bilim ve Teknoloji',
      source_url: GOOGLE_NEWS_TECH_RSS
    });
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    return json(res, 504, {
      error: isAbort ? 'Google News RSS isteği zaman aşımına uğradı' : (error?.message || String(error)),
      items: [],
      count: 0,
      refreshed_at: new Date().toISOString(),
      source: 'Google News Bilim ve Teknoloji',
      source_url: GOOGLE_NEWS_TECH_RSS
    });
  }
}
