import { getSupabaseAdmin, json, hashValue, parseFeedItems, safeText } from './_lib.js';

const GOOGLE_NEWS_TECH_RSS = 'https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvSkwyMHZNR1ptZHpWbUVnSjBjaG9DVkZJb0FBUAE?hl=tr&gl=TR&ceid=TR:tr';
const TIMEOUT_MS = 12000;

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
  { key: 'science', id: '15', name: 'Bilim', priority: 1, realtimeCat: 't' },
  { key: 'technology', id: '18', name: 'Teknoloji', priority: 2, realtimeCat: 't' }
];

const WINDOWS = [
  { key: '4h', label: 'Son 4 saat', hours: 4 },
  { key: '24h', label: 'Son 24 saat', hours: 24 },
  { key: '48h', label: 'Son 48 saat', hours: 48 },
  { key: '168h', label: 'Son 7 gün', hours: 168 }
];

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function normalizeTopic(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9çğıöşü\s]/gi, ' ').replace(/\s+/g, ' ').trim(); }
function pickWindow(value = '24h') { return WINDOWS.find((item) => item.key === String(value || '').toLowerCase()) || WINDOWS[1]; }
function pickCategory(value = 'all') { const key = String(value || 'all').toLowerCase(); if (key === '15' || key === 'science') return 'science'; if (key === '18' || key === 'technology' || key === 'tech') return 'technology'; return 'all'; }
function selectedCategories(value = 'all') { const key = pickCategory(value); return key === 'all' ? CATEGORIES : CATEGORIES.filter((item) => item.key === key); }
function countryList(geo = 'all') { const key = String(geo || 'all').toUpperCase(); return key === 'ALL' ? COUNTRIES : (COUNTRIES.filter((item) => item.code === key).length ? COUNTRIES.filter((item) => item.code === key) : [COUNTRIES[0]]); }
function dateIso(value = '') { const date = new Date(String(value || '').trim()); return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(); }
function pageUrl(country, category, win) { const params = new URLSearchParams({ geo: country.code, category: category.id, hours: String(win.hours) }); return `${country.domain}/trending?${params.toString()}`; }
function score(index, country, category) { return clamp(104 - index * 3 - country.priority - category.priority + (country.code === 'TR' ? 5 : 0), 1, 100); }
function cleanTitle(value = '') { return safeText(String(value || '').replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>')).trim(); }

async function fetchText(url, accept = 'application/json, text/plain, */*') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { accept, 'user-agent': 'Mozilla/5.0 TeknoblogRadar/1.0' } });
    if (!response.ok) return '';
    return await response.text();
  } finally { clearTimeout(timer); }
}

function stripGoogleJsonPrefix(text = '') { return String(text || '').replace(/^\)\]\}',?\s*/, '').trim(); }
function realtimeApiUrl(country, win) { const params = new URLSearchParams({ hl: 'tr-TR', tz: '-180', cat: 't', fi: '0', fs: '0', geo: country.code, ri: '300', rs: '20', sort: '0' }); return `https://trends.google.com/trends/api/realtimetrends?${params.toString()}`; }
function storyTimeIso(story = {}) { const value = story?.image?.newsUrl || story?.shareUrl || ''; const ts = Number(story?.articles?.[0]?.time || story?.article?.time || story?.timestamp || 0); if (Number.isFinite(ts) && ts > 0) return new Date(ts * (ts < 10000000000 ? 1000 : 1)).toISOString(); return new Date().toISOString(); }
function storyTitle(story = {}) { return cleanTitle(story?.title || story?.entityNames?.[0] || story?.articles?.[0]?.title || ''); }
function storySummary(story = {}) { const names = Array.isArray(story?.entityNames) ? story.entityNames.join(', ') : ''; const articleTitle = story?.articles?.[0]?.title || ''; return cleanTitle(names || articleTitle || 'Google Trends gerçek zamanlı Bilim/Teknoloji hikayesi.'); }
function storyUrl(story = {}, country, category, win) { return story?.shareUrl || story?.articles?.[0]?.url || pageUrl(country, category, win); }

async function fetchRealtimeStories(country, category, win) {
  const text = await fetchText(realtimeApiUrl(country, win)).catch(() => '');
  if (!text) return [];
  let data;
  try { data = JSON.parse(stripGoogleJsonPrefix(text)); } catch { return []; }
  const stories = data?.storySummaries?.trendingStories || data?.trendingStories || [];
  return Array.isArray(stories) ? stories : [];
}

async function googleTrendsItems(limit, geo, categoryKey, windowKey) {
  const win = pickWindow(windowKey);
  const countries = countryList(geo);
  const categories = selectedCategories(categoryKey);
  const perCountryLimit = String(geo || 'all').toUpperCase() === 'ALL' ? Math.max(4, Math.ceil(limit / Math.max(1, countries.length))) : limit;
  const batches = await Promise.allSettled(countries.map(async (country) => {
    const category = categories[0] || CATEGORIES[0];
    const stories = await fetchRealtimeStories(country, category, win);
    return stories.slice(0, perCountryLimit).map((story, index) => {
      const title = storyTitle(story);
      const value = score(index, country, category);
      return { title, summary: storySummary(story), url: storyUrl(story, country, category, win), published_at: storyTimeIso(story), source_name: `Google Trends ${country.name}`, country_code: country.code, country_name: country.name, country_priority: country.priority, category: categories.length === 2 ? 'Bilim ve Teknoloji' : category.name, category_id: categories.map((item) => item.id).join(','), category_key: categoryKey, category_url: pageUrl(country, category, win), feed_url: realtimeApiUrl(country, win), source_kind: 'realtimetrends', selected_window: win.key, window_label: win.label, window_hours: win.hours, is_tech: true, from_google_trends: true, trend_score: value, traffic_score: value, discover_score: value };
    }).filter((item) => item.title);
  }));
  const seen = new Set();
  const items = [];
  for (const result of batches) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      const key = `${item.country_code}:${normalizeTopic(item.title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items.sort((a, b) => Number(a.country_priority) - Number(b.country_priority) || Number(b.trend_score) - Number(a.trend_score)).slice(0, limit);
}

async function fetchRss(url) { const text = await fetchText(url, 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'); return parseFeedItems(text); }
function sourceFromTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts[parts.length - 1].trim() : 'Google News'; }
function cleanNewsTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() : String(title || '').trim(); }
async function fetchGoogleNewsTech(limit = 24) { const raw = await fetchRss(GOOGLE_NEWS_TECH_RSS); const seen = new Set(); const items = []; for (const item of raw) { const title = cleanNewsTitle(safeText(item.title || '')); const key = `${title}:${item.url || ''}`; if (!title || seen.has(key)) continue; seen.add(key); items.push({ title, url: item.url || '', source_name: sourceFromTitle(item.title || ''), published_at: dateIso(item.published_at || ''), summary: safeText(item.summary || ''), image_url: item.image_url || '' }); if (items.length >= limit) break; } return items; }
async function respondGoogleNewsTech(req, res) { const limit = clamp(Number(req.query?.limit || 24), 1, 50); const items = await fetchGoogleNewsTech(limit); return json(res, 200, { items, count: items.length, refreshed_at: new Date().toISOString(), source: 'Google News Bilim ve Teknoloji', source_url: GOOGLE_NEWS_TECH_RSS, via: 'trend-overview' }); }
async function respondGoogleTrends(req, res) { const limit = clamp(Number(req.query?.limit || 48), 1, 80); const geo = String(req.query?.geo || 'all'); const win = pickWindow(req.query?.window || '24h'); const cat = pickCategory(req.query?.category || 'all'); const items = await googleTrendsItems(limit, geo, cat, win.key); const primaryCountry = countryList(geo)[0]; const primaryCategory = selectedCategories(cat)[0] || CATEGORIES[0]; return json(res, 200, { items, count: items.length, window: win.key, selected_category: cat, available_windows: WINDOWS, countries: COUNTRIES, categories: CATEGORIES, category: cat === 'all' ? 'Bilim ve Teknoloji' : primaryCategory.name, refreshed_at: new Date().toISOString(), source: 'Google Trends gerçek zamanlı Bilim/Teknoloji', source_url: pageUrl(primaryCountry, primaryCategory, win), via: 'trend-overview', route: 'google_trends', data_source: 'trends/api/realtimetrends?cat=t' }); }

function isShortNoiseTopic(topic = '') { const n = normalizeTopic(topic); return ['tr', 'fr', 'uel'].includes(n) || n.length < 3; }
async function defaultOverview(req, res) { const limit = clamp(Number(req.query?.limit || 12), 1, 24); const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); let items = []; try { const supabase = getSupabaseAdmin(); const { data } = await supabase.from('trend_signals').select('normalized_topic,topic_text,detected_at,source_name,signal_score').gte('detected_at', sinceIso).order('detected_at', { ascending: false }).limit(300); const map = new Map(); for (const signal of data || []) { const name = signal.normalized_topic || signal.topic_text || ''; if (!name || isShortNoiseTopic(name)) continue; const key = hashValue(normalizeTopic(name)); if (!map.has(key)) map.set(key, { cluster_key: key, cluster_name: name, trend_score: 55, discover_potential_score: 60, signal_count: 0, window_signal_count: 0, signal_topics: [], signal_sources: [], latest_signal_at: signal.detected_at }); const item = map.get(key); item.signal_count += 1; item.window_signal_count += 1; item.trend_score = Math.max(item.trend_score, Number(signal.signal_score || 55)); item.signal_topics.push(signal.topic_text || name); item.signal_sources.push(signal.source_name || 'Radar'); if (signal.detected_at > item.latest_signal_at) item.latest_signal_at = signal.detected_at; } items = [...map.values()].sort((a, b) => b.window_signal_count - a.window_signal_count || b.trend_score - a.trend_score).slice(0, limit); } catch {} if (!items.length) { const refs = await fetchGoogleNewsTech(limit); items = refs.map((item, index) => ({ cluster_key: hashValue(item.title), cluster_name: item.title, linked_news: [{ candidate_title: item.title, candidate_url: item.url, source_name: item.source_name, published_at: item.published_at, match_score: 1 }], trend_score: 60 - index, discover_potential_score: 62 - index, window_signal_count: 1, signal_count: 1, latest_signal_at: item.published_at })); } return json(res, 200, { items, window: '24h', available_windows: WINDOWS, reference_count: items.length }); }

export default async function handler(req, res) { try { if (String(req.query?.google_news || '') === '1') return await respondGoogleNewsTech(req, res); if (String(req.query?.google_trends || '') === '1') return await respondGoogleTrends(req, res); return await defaultOverview(req, res); } catch (error) { return json(res, 500, { error: error?.message || String(error) }); } }
