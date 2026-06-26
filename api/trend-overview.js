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
  { key: 'science', id: '15', name: 'Bilim', priority: 1 },
  { key: 'technology', id: '18', name: 'Teknoloji', priority: 2 }
];

const WINDOWS = [
  { key: '4h', label: 'Son 4 saat', hours: 4 },
  { key: '24h', label: 'Son 24 saat', hours: 24 },
  { key: '48h', label: 'Son 48 saat', hours: 48 },
  { key: '168h', label: 'Son 7 gün', hours: 168 }
];

const POSITIVE_PATTERNS = [
  /\byapay zeka\b/i, /\bartificial intelligence\b/i, /\bai\b/i, /\bgemini\b/i, /\bopenai\b/i, /\bchatgpt\b/i, /\bclaude\b/i,
  /\bandroid\b/i, /\bios\b/i, /\biphone\b/i, /\bipad\b/i, /\bmacbook\b/i, /\bmacos\b/i, /\bwindows\b/i, /\bchrome\b/i,
  /\bgoogle\b/i, /\bapple\b/i, /\bsamsung\b/i, /\bhuawei\b/i, /\bxiaomi\b/i, /\boppo\b/i, /\bhonor\b/i, /\bmeta\b/i,
  /\btelefon\b/i, /\btablet\b/i, /\blaptop\b/i, /\bgpu\b/i, /\bcpu\b/i, /\bnvidia\b/i, /\bamd\b/i, /\bintel\b/i,
  /\bçip\b/i, /\bchip\b/i, /\bişlemci\b/i, /\byazılım\b/i, /\bdonanım\b/i, /\bsoftware\b/i, /\bhardware\b/i,
  /\bbilim\b/i, /\bscience\b/i, /\bteknoloji\b/i, /\btechnology\b/i, /\buzay\b/i, /\bspace\b/i, /\bnasa\b/i, /\bspacex\b/i,
  /\broket\b/i, /\buydu\b/i, /\basteroit\b/i, /\basteroid\b/i, /\bmeteor\b/i, /\bgezegen\b/i, /\bmars\b/i, /\bteleskop\b/i,
  /\bastronomi\b/i, /\bquantum\b/i, /\bkuantum\b/i, /\brobot\b/i, /\brobotik\b/i, /\bsemiconductor\b/i, /\bbatarya\b/i,
  /\bsiber\b/i, /\bcyber\b/i, /\bmalware\b/i, /\bgüvenlik açığı\b/i, /\bveri merkezi\b/i, /\bdata center\b/i,
  /\belektrikli araç\b/i, /\botonom\b/i, /\bev\b/i, /\btogg\b/i, /\btesla\b/i, /\bstarlink\b/i
];

const NEGATIVE_PATTERNS = [
  /\bkanye\b/i, /\bwest\b/i, /\bcan korkmaz\b/i, /\bmagazin\b/i, /\brapper\b/i, /\bşarkı\b/i, /\bsarki\b/i, /\balbüm\b/i, /\bkonser\b/i,
  /\bfutbol\b/i, /\bfootball\b/i, /\bmaç\b/i, /\bcanlı izle\b/i, /\bhangi kanalda\b/i, /\bvs\b/i, /\bsenegal\b/i, /\biraq\b/i, /\bnorveç\b/i, /\bfrancia\b/i,
  /\bspor\b/i, /\btransfer\b/i, /\bfenerbahçe\b/i, /\bgalatasaray\b/i, /\bbeşiktaş\b/i, /\btrabzonspor\b/i, /\bbasketbol\b/i,
  /\basgari ücret\b/i, /\bsermaye artırımı\b/i, /\bborsa\b/i, /\bhisse\b/i, /\bdolar\b/i, /\baltın\b/i, /\bfaiz\b/i, /\bemekli\b/i, /\bmaaş\b/i,
  /\bdizi\b/i, /\bsezon\b/i, /\bbölüm\b/i, /\bkimdir\b/i, /\bsevgilisi\b/i, /\bsurvivor\b/i, /\bastroloji\b/i, /\bburç\b/i
];

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function normalizeTopic(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9çğıöşü\s]/gi, ' ').replace(/\s+/g, ' ').trim(); }
function pickWindow(value = '24h') { return WINDOWS.find((item) => item.key === String(value || '').toLowerCase()) || WINDOWS[1]; }
function pickCategory(value = 'all') { const key = String(value || 'all').toLowerCase(); if (key === '15' || key === 'science') return 'science'; if (key === '18' || key === 'technology' || key === 'tech') return 'technology'; return 'all'; }
function selectedCategories(value = 'all') { const key = pickCategory(value); return key === 'all' ? CATEGORIES : CATEGORIES.filter((item) => item.key === key); }
function countryList(geo = 'all') { const key = String(geo || 'all').toUpperCase(); return key === 'ALL' ? COUNTRIES : (COUNTRIES.filter((item) => item.code === key).length ? COUNTRIES.filter((item) => item.code === key) : [COUNTRIES[0]]); }
function dateIso(value = '') { const date = new Date(String(value || '').trim()); return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(); }
function pageUrl(country, category, win) { const params = new URLSearchParams({ geo: country.code, category: category.id, hours: String(win.hours) }); return `${country.domain}/trending?${params.toString()}`; }
function rssUrls(country, category, win) { const params = new URLSearchParams({ geo: country.code, category: category.id, hours: String(win.hours) }); return [...new Set([`${country.domain}/trending/rss?${params.toString()}`, `https://trends.google.com/trending/rss?${params.toString()}`])]; }
function score(index, country, category) { return clamp(104 - index * 3 - country.priority - category.priority + (country.code === 'TR' ? 5 : 0), 1, 100); }
function titleFromUrl(url = '') { try { return decodeURIComponent(new URL(url).searchParams.get('q') || ''); } catch { return ''; } }
function cleanTitle(value = '') { return safeText(String(value || '').replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>')).trim(); }
function isRelevantTrend(text = '') { const value = String(text || ''); if (!value.trim()) return false; if (NEGATIVE_PATTERNS.some((p) => p.test(value))) return POSITIVE_PATTERNS.some((p) => p.test(value)); return POSITIVE_PATTERNS.some((p) => p.test(value)); }

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { accept: 'application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8', 'user-agent': 'Mozilla/5.0 TeknoblogRadar/1.0' } });
    if (!response.ok) return '';
    return await response.text();
  } finally { clearTimeout(timer); }
}

function htmlItems(html = '', fallbackUrl = '') {
  const found = [];
  const seen = new Set();
  const patterns = [/"title"\s*:\s*"([^"]{3,140})"/g, /"query"\s*:\s*"([^"]{3,140})"/g, /\[\s*"([^"]{3,90})"\s*,\s*"\/[^"]*trends\/explore/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) && found.length < 60) {
      const title = cleanTitle(match[1]);
      const key = normalizeTopic(title);
      if (!key || seen.has(key)) continue;
      if (/google trends|trending|cookies|privacy|gizlilik/i.test(title)) continue;
      if (!isRelevantTrend(title)) continue;
      seen.add(key);
      found.push({ title, summary: '', url: fallbackUrl, published_at: new Date().toISOString() });
    }
  }
  return found;
}

async function fetchTrendFeed(country, category, win) {
  for (const url of rssUrls(country, category, win)) {
    const text = await fetchText(url).catch(() => '');
    const items = parseFeedItems(text).filter((item) => isRelevantTrend(`${item.title || titleFromUrl(item.url)} ${item.summary || item.description || ''}`));
    if (items.length) return { items, feed_url: url, source_kind: 'rss' };
  }
  const sourceUrl = pageUrl(country, category, win);
  const html = await fetchText(sourceUrl).catch(() => '');
  return { items: htmlItems(html, sourceUrl), feed_url: sourceUrl, source_kind: 'page' };
}

async function googleTrendsItems(limit, geo, categoryKey, windowKey) {
  const win = pickWindow(windowKey);
  const countries = countryList(geo);
  const categories = selectedCategories(categoryKey);
  const perFeedLimit = String(geo || 'all').toUpperCase() === 'ALL' ? Math.max(4, Math.ceil(limit / Math.max(1, countries.length * categories.length))) : limit;
  const batches = await Promise.allSettled(countries.flatMap((country) => categories.map(async (category) => {
    const feed = await fetchTrendFeed(country, category, win);
    return feed.items.slice(0, perFeedLimit).map((item, index) => {
      const title = cleanTitle(item.title || titleFromUrl(item.url));
      const summary = cleanTitle(item.summary || item.description || '');
      const value = score(index, country, category);
      return { title, summary, url: item.url || pageUrl(country, category, win), published_at: dateIso(item.published_at || ''), source_name: `Google Trends ${country.name}`, country_code: country.code, country_name: country.name, country_priority: country.priority, category: category.name, category_id: category.id, category_key: category.key, category_url: pageUrl(country, category, win), feed_url: feed.feed_url, source_kind: feed.source_kind, selected_window: win.key, window_label: win.label, window_hours: win.hours, is_tech: true, from_google_trends: true, trend_score: value, traffic_score: value, discover_score: value };
    }).filter((item) => item.title && isRelevantTrend(`${item.title} ${item.summary}`));
  })));
  const seen = new Set();
  const items = [];
  for (const result of batches) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      const key = `${item.country_code}:${item.category_id}:${normalizeTopic(item.title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items.sort((a, b) => Number(a.country_priority) - Number(b.country_priority) || Number(a.category_id) - Number(b.category_id) || Number(b.trend_score) - Number(a.trend_score)).slice(0, limit);
}

async function fetchRss(url) { const text = await fetchText(url); return parseFeedItems(text); }
function sourceFromTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts[parts.length - 1].trim() : 'Google News'; }
function cleanNewsTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() : String(title || '').trim(); }
async function fetchGoogleNewsTech(limit = 24) { const raw = await fetchRss(GOOGLE_NEWS_TECH_RSS); const seen = new Set(); const items = []; for (const item of raw) { const title = cleanNewsTitle(safeText(item.title || '')); const key = `${title}:${item.url || ''}`; if (!title || seen.has(key)) continue; if (!isRelevantTrend(`${title} ${item.summary || ''}`)) continue; seen.add(key); items.push({ title, url: item.url || '', source_name: sourceFromTitle(item.title || ''), published_at: dateIso(item.published_at || ''), summary: safeText(item.summary || ''), image_url: item.image_url || '' }); if (items.length >= limit) break; } return items; }
async function respondGoogleNewsTech(req, res) { const limit = clamp(Number(req.query?.limit || 24), 1, 50); const items = await fetchGoogleNewsTech(limit); return json(res, 200, { items, count: items.length, refreshed_at: new Date().toISOString(), source: 'Google News Bilim ve Teknoloji', source_url: GOOGLE_NEWS_TECH_RSS, via: 'trend-overview' }); }
async function respondGoogleTrends(req, res) { const limit = clamp(Number(req.query?.limit || 48), 1, 80); const geo = String(req.query?.geo || 'all'); const win = pickWindow(req.query?.window || '24h'); const cat = pickCategory(req.query?.category || 'all'); const items = await googleTrendsItems(limit, geo, cat, win.key); const primaryCountry = countryList(geo)[0]; const primaryCategory = selectedCategories(cat)[0]; return json(res, 200, { items, count: items.length, window: win.key, selected_category: cat, available_windows: WINDOWS, countries: COUNTRIES, categories: CATEGORIES, category: cat === 'all' ? 'Bilim ve Teknoloji' : primaryCategory.name, refreshed_at: new Date().toISOString(), source: 'Google Trends Bilim ve Teknoloji', source_url: pageUrl(primaryCountry, primaryCategory, win), via: 'trend-overview', route: 'google_trends' }); }

function isShortNoiseTopic(topic = '') { const n = normalizeTopic(topic); return ['tr', 'fr', 'uel'].includes(n) || n.length < 3; }
async function defaultOverview(req, res) { const limit = clamp(Number(req.query?.limit || 12), 1, 24); const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); let items = []; try { const supabase = getSupabaseAdmin(); const { data } = await supabase.from('trend_signals').select('normalized_topic,topic_text,detected_at,source_name,signal_score').gte('detected_at', sinceIso).order('detected_at', { ascending: false }).limit(300); const map = new Map(); for (const signal of data || []) { const name = signal.normalized_topic || signal.topic_text || ''; if (!name || isShortNoiseTopic(name) || !isRelevantTrend(name)) continue; const key = hashValue(normalizeTopic(name)); if (!map.has(key)) map.set(key, { cluster_key: key, cluster_name: name, trend_score: 55, discover_potential_score: 60, signal_count: 0, window_signal_count: 0, signal_topics: [], signal_sources: [], latest_signal_at: signal.detected_at }); const item = map.get(key); item.signal_count += 1; item.window_signal_count += 1; item.trend_score = Math.max(item.trend_score, Number(signal.signal_score || 55)); item.signal_topics.push(signal.topic_text || name); item.signal_sources.push(signal.source_name || 'Radar'); if (signal.detected_at > item.latest_signal_at) item.latest_signal_at = signal.detected_at; } items = [...map.values()].sort((a, b) => b.window_signal_count - a.window_signal_count || b.trend_score - a.trend_score).slice(0, limit); } catch {} if (!items.length) { const refs = await fetchGoogleNewsTech(limit); items = refs.map((item, index) => ({ cluster_key: hashValue(item.title), cluster_name: item.title, linked_news: [{ candidate_title: item.title, candidate_url: item.url, source_name: item.source_name, published_at: item.published_at, match_score: 1 }], trend_score: 60 - index, discover_potential_score: 62 - index, window_signal_count: 1, signal_count: 1, latest_signal_at: item.published_at })); } return json(res, 200, { items, window: '24h', available_windows: WINDOWS, reference_count: items.length }); }

export default async function handler(req, res) { try { if (String(req.query?.google_news || '') === '1') return await respondGoogleNewsTech(req, res); if (String(req.query?.google_trends || '') === '1') return await respondGoogleTrends(req, res); return await defaultOverview(req, res); } catch (error) { return json(res, 500, { error: error?.message || String(error) }); } }
