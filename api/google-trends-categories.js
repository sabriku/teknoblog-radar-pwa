import { json, parseFeedItems, safeText } from './_lib.js';

const COUNTRIES = [
  { code: 'TR', name: 'Türkiye', priority: 1, domain: 'https://trends.google.com.tr' },
  { code: 'US', name: 'ABD', priority: 2, domain: 'https://trends.google.com' },
  { code: 'GB', name: 'Birleşik Krallık', priority: 3, domain: 'https://trends.google.com' },
  { code: 'DE', name: 'Almanya', priority: 4, domain: 'https://trends.google.com' },
  { code: 'JP', name: 'Japonya', priority: 5, domain: 'https://trends.google.com' },
  { code: 'KR', name: 'Güney Kore', priority: 6, domain: 'https://trends.google.com' },
  { code: 'IN', name: 'Hindistan', priority: 7, domain: 'https://trends.google.com' },
  { code: 'FR', name: 'Fransa', priority: 8, domain: 'https://trends.google.com' },
  { code: 'IT', name: 'İtalya', priority: 9, domain: 'https://trends.google.com' },
  { code: 'BR', name: 'Brezilya', priority: 10, domain: 'https://trends.google.com' }
];

const CATEGORIES = [
  { key: 'science', id: '15', name: 'Bilim', priority: 1 },
  { key: 'technology', id: '18', name: 'Teknoloji', priority: 2 }
];

const WINDOWS = [
  { key: '4h', label: 'Son 4 saat', hours: 4 },
  { key: '24h', label: 'Son 24 saat', hours: 24 },
  { key: '48h', label: 'Son 48 saat', hours: 48 },
  { key: '168h', label: 'Son 7 gün', hours: 168 }
];

function pickWindow(value = '24h') {
  return WINDOWS.find((item) => item.key === String(value || '').toLowerCase()) || WINDOWS[1];
}

function pickCategories(value = 'all') {
  const key = String(value || 'all').toLowerCase();
  if (key === 'science' || key === '15') return CATEGORIES.filter((item) => item.key === 'science');
  if (key === 'technology' || key === 'tech' || key === '18') return CATEGORIES.filter((item) => item.key === 'technology');
  return CATEGORIES;
}

function pageUrl(country, category, win) {
  const params = new URLSearchParams({ geo: country.code, category: category.id, hours: String(win.hours) });
  return `${country.domain}/trending?${params.toString()}`;
}

function rssUrls(country, category, win) {
  const params = new URLSearchParams({ geo: country.code, category: category.id, hours: String(win.hours) });
  const local = `${country.domain}/trending/rss?${params.toString()}`;
  const global = `https://trends.google.com/trending/rss?${params.toString()}`;
  return [...new Set([local, global])];
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'user-agent': 'Mozilla/5.0 TeknoblogRadar/1.0'
      }
    });
    if (!response.ok) return '';
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFeed(urls) {
  for (const url of urls) {
    const text = await fetchText(url).catch(() => '');
    const items = parseFeedItems(text);
    if (items.length) return { items, feed_url: url };
  }
  return { items: [], feed_url: urls[0] || '' };
}

function normalizeDate(value) {
  const date = new Date(String(value || '').trim());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function score(index, country, category) {
  return Math.max(1, Math.min(100, Math.round(105 - index * 3 - country.priority - category.priority + (country.code === 'TR' ? 5 : 0))));
}

async function fetchCountryCategory(country, category, win, perFeedLimit) {
  const source_url = pageUrl(country, category, win);
  const { items: raw, feed_url } = await fetchFeed(rssUrls(country, category, win));
  return raw.slice(0, perFeedLimit).map((item, index) => {
    const value = score(index, country, category);
    return {
      title: safeText(item.title || ''),
      summary: safeText(item.summary || item.description || ''),
      url: item.url || item.link || source_url,
      published_at: normalizeDate(item.published_at || ''),
      source_name: `Google Trends ${country.name}`,
      country_code: country.code,
      country_name: country.name,
      country_priority: country.priority,
      category: category.name,
      category_id: category.id,
      category_key: category.key,
      category_url: source_url,
      feed_url,
      selected_window: win.key,
      window_label: win.label,
      window_hours: win.hours,
      is_tech: true,
      from_google_trends: true,
      trend_score: value,
      traffic_score: value,
      discover_score: value
    };
  }).filter((item) => item.title);
}

export default async function handler(req, res) {
  try {
    const limit = Math.max(1, Math.min(80, Number(req.query?.limit || 48)));
    const geo = String(req.query?.geo || 'all').toUpperCase();
    const win = pickWindow(req.query?.window || '24h');
    const cats = pickCategories(req.query?.category || 'all');
    const countries = geo === 'ALL' ? COUNTRIES : COUNTRIES.filter((item) => item.code === geo);
    const list = countries.length ? countries : [COUNTRIES[0]];
    const perFeedLimit = geo === 'ALL' ? Math.max(4, Math.ceil(limit / Math.max(1, list.length * cats.length))) : limit;
    const batches = await Promise.allSettled(list.flatMap((country) => cats.map((cat) => fetchCountryCategory(country, cat, win, perFeedLimit))));
    const seen = new Set();
    const items = [];
    for (const result of batches) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        const key = `${item.country_code}:${item.category_id}:${String(item.title).toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
    }
    items.sort((a, b) => Number(a.country_priority) - Number(b.country_priority) || Number(a.category_id) - Number(b.category_id) || Number(b.trend_score) - Number(a.trend_score));
    return json(res, 200, {
      items: items.slice(0, limit),
      count: Math.min(items.length, limit),
      window: win.key,
      available_windows: WINDOWS,
      countries: COUNTRIES,
      categories: CATEGORIES,
      category: cats.length === 2 ? 'Bilim ve Teknoloji' : cats[0]?.name,
      source: 'Google Trends Bilim ve Teknoloji',
      source_url: pageUrl(list[0], cats[0], win),
      refreshed_at: new Date().toISOString(),
      via: 'google-trends-categories'
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
