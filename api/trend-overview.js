import { getSupabaseAdmin, json, hashValue, parseFeedItems, queryLocal, safeText } from './_lib.js';

const GOOGLE_NEWS_TECH_RSS = 'https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvSkwyMHZNR1ptZHpWbUVnSjBjaG9DVkZJb0FBUAE?hl=tr&gl=TR&ceid=TR:tr';
const TIMEOUT_MS = 15000;
const GOOGLE_TRENDS_RPC = 'i0OFE';
const GOOGLE_TRENDS_CACHE_MS = 8 * 60 * 1000;
const trendsMemoryCache = new Map();

const COUNTRIES = [
  { code: 'TR', name: 'Türkiye', priority: 1, domain: 'https://trends.google.com.tr', lang: 'tr' },
  { code: 'US', name: 'ABD', priority: 2, domain: 'https://trends.google.com', lang: 'en' },
  { code: 'GB', name: 'Birleşik Krallık', priority: 3, domain: 'https://trends.google.com', lang: 'en' },
  { code: 'DE', name: 'Almanya', priority: 4, domain: 'https://trends.google.com', lang: 'de' },
  { code: 'JP', name: 'Japonya', priority: 5, domain: 'https://trends.google.com', lang: 'ja' },
  { code: 'KR', name: 'Güney Kore', priority: 6, domain: 'https://trends.google.com', lang: 'ko' },
  { code: 'IN', name: 'Hindistan', priority: 7, domain: 'https://trends.google.com', lang: 'en' },
  { code: 'FR', name: 'Fransa', priority: 8, domain: 'https://trends.google.com', lang: 'fr' },
  { code: 'BR', name: 'Brezilya', priority: 9, domain: 'https://trends.google.com', lang: 'pt-BR' },
  { code: 'CA', name: 'Kanada', priority: 10, domain: 'https://trends.google.com', lang: 'en' },
  { code: 'AU', name: 'Avustralya', priority: 11, domain: 'https://trends.google.com', lang: 'en' },
  { code: 'SG', name: 'Singapur', priority: 12, domain: 'https://trends.google.com', lang: 'en' },
  { code: 'TW', name: 'Tayvan', priority: 13, domain: 'https://trends.google.com', lang: 'zh-TW' }
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
function countryList(geo = 'all') { const key = String(geo || 'all').toUpperCase(); if (key === 'ALL') return COUNTRIES; if (key === 'WORLD') return COUNTRIES.filter((item) => item.code !== 'TR'); return COUNTRIES.filter((item) => item.code === key).length ? COUNTRIES.filter((item) => item.code === key) : [COUNTRIES[0]]; }
function dateIso(value = '') { const date = new Date(String(value || '').trim()); return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(); }
function pageUrl(country, category, win) { const params = new URLSearchParams({ geo: country.code, category: category.id, hours: String(win.hours) }); return `${country.domain}/trending?${params.toString()}`; }
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

function timestampIso(value) { const timestamp = Number(Array.isArray(value) ? value[0] : value); return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null; }
function trendsRpcUrl(country) { return `${country.domain}/_/TrendsUi/data/batchexecute?rpcids=${GOOGLE_TRENDS_RPC}&hl=${encodeURIComponent(country.lang)}&source-path=%2Ftrending`; }
function trendsRequest(country, win) { return [null, null, country.code, 0, country.lang, win.hours]; }
function parseRpcRows(text = '') {
  try {
    const start = String(text).indexOf('[');
    if (start < 0) return [];
    const envelope = JSON.parse(String(text).slice(start));
    const response = envelope.find((entry) => Array.isArray(entry) && entry[0] === 'wrb.fr' && entry[1] === GOOGLE_TRENDS_RPC);
    if (!response?.[2]) return [];
    const payload = JSON.parse(response[2]);
    return Array.isArray(payload?.[1]) ? payload[1] : [];
  } catch { return []; }
}
async function fetchTrendingRows(country, win) {
  const request = JSON.stringify(trendsRequest(country, win));
  const body = new URLSearchParams({ 'f.req': JSON.stringify([[[GOOGLE_TRENDS_RPC, request, null, 'generic']]]) });
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      const response = await fetch(trendsRpcUrl(country), { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'Mozilla/5.0 TeknoblogRadar/2.0', 'x-same-domain': '1', origin: country.domain, referer: `${country.domain}/trending?geo=${country.code}` }, body: body.toString() });
      if (!response.ok) throw new Error(`Google Trends HTTP ${response.status}`);
      const rows = parseRpcRows(await response.text());
      if (!rows.length) throw new Error('Google Trends boş yanıt döndürdü.');
      return rows;
    } catch (error) { lastError = new Error(`${error?.message || String(error)}${error?.cause?.code ? ` (${error.cause.code})` : ''}`); }
    finally { clearTimeout(timer); }
  }
  throw lastError || new Error('Google Trends bağlantısı kurulamadı.');
}
async function cachedTrendingRows(country, win) {
  const key = `${country.code}:${win.hours}`;
  const memory = trendsMemoryCache.get(key);
  if (memory && Date.now() - memory.fetchedAt < GOOGLE_TRENDS_CACHE_MS) return { rows: memory.rows, fetchedAt: memory.fetchedAt, cache: 'memory', stale: false };
  const saved = await queryLocal(`SELECT payload,fetched_at,expires_at FROM google_trends_cache WHERE cache_key=$1`, [key]).catch(() => ({ rows: [] }));
  const record = saved.rows?.[0];
  if (record && new Date(record.expires_at).getTime() > Date.now()) {
    const rows = Array.isArray(record.payload) ? record.payload : [];
    trendsMemoryCache.set(key, { rows, fetchedAt: new Date(record.fetched_at).getTime() });
    return { rows, fetchedAt: new Date(record.fetched_at).getTime(), cache: 'postgresql', stale: false };
  }
  try {
    const rows = await fetchTrendingRows(country, win); const fetchedAt = Date.now(); const expiresAt = new Date(fetchedAt + GOOGLE_TRENDS_CACHE_MS);
    trendsMemoryCache.set(key, { rows, fetchedAt });
    await queryLocal(`INSERT INTO google_trends_cache(cache_key,geo,window_hours,payload,fetched_at,expires_at) VALUES($1,$2,$3,$4,NOW(),$5)
      ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [key, country.code, win.hours, JSON.stringify(rows), expiresAt]).catch(() => {});
    return { rows, fetchedAt, cache: 'google', stale: false };
  } catch (error) {
    if (record && new Date(record.fetched_at).getTime() > Date.now() - 6 * 3600000) return { rows: Array.isArray(record.payload) ? record.payload : [], fetchedAt: new Date(record.fetched_at).getTime(), cache: 'stale_postgresql', stale: true, error: error.message };
    throw error;
  }
}
function trendMomentum(volume, growth, active, startedAt) {
  const ageHours = startedAt ? Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 3600000) : 24;
  return clamp(Math.round(18 + Math.min(32, Math.log10(Math.max(10, volume)) * 7) + Math.min(28, growth / 40) + (active ? 12 : 3) + Math.max(0, 10 - ageHours)), 1, 99);
}
function exploreDate(win) { if (win.hours === 4) return 'now 4-H'; if (win.hours === 24) return 'now 1-d'; if (win.hours === 48) return 'now 2-d'; return 'now 7-d'; }
function rowToItem(row, country, categories, win, sync) {
  const rowCategories = Array.isArray(row?.[10]) ? row[10].map(String) : [];
  const matched = categories.filter((category) => rowCategories.includes(category.id));
  if (!matched.length) return null;
  const title = cleanTitle(row?.[0] || ''); if (!title) return null;
  const startedAt = timestampIso(row?.[3]); const endedAt = timestampIso(row?.[4]); const active = !endedAt;
  const volume = Number(row?.[6] || 0); const growth = Number(row?.[8] || 0);
  const related = Array.isArray(row?.[9]) ? row[9].map(cleanTitle).filter(Boolean).slice(0, 12) : [];
  const primary = matched[0]; const explore = row?.[12] || title;
  return { title, summary: related.slice(1, 6).join(' · '), related_queries: related, url: `${country.domain}/trends/explore?${new URLSearchParams({ q: explore, date: exploreDate(win), geo: country.code, hl: country.lang }).toString()}`, published_at: startedAt, ended_at: endedAt, is_active: active, search_volume: volume, growth_percentage: growth, source_name: `Google Trends ${country.name}`, country_code: country.code, country_name: country.name, country_priority: country.priority, scope: country.code === 'TR' ? 'turkey' : 'world', category: matched.map((item) => item.name).join(' + '), category_id: matched.map((item) => item.id).join(','), category_key: matched.map((item) => item.key).join(','), category_url: pageUrl(country, primary, win), source_kind: 'trending_now_rpc', selected_window: win.key, window_label: win.label, window_hours: win.hours, from_google_trends: true, trend_score: trendMomentum(volume, growth, active, startedAt), fetched_at: new Date(sync.fetchedAt).toISOString(), stale: Boolean(sync.stale) };
}
function diversifyCountries(items, limit) {
  const groups = COUNTRIES.filter((country) => country.code !== 'TR').map((country) => items.filter((item) => item.country_code === country.code));
  const selected = [];
  for (let index = 0; selected.length < limit && groups.some((group) => index < group.length); index += 1) {
    for (const group of groups) { if (group[index]) selected.push(group[index]); if (selected.length >= limit) break; }
  }
  return selected;
}
async function mapLimited(items, concurrency, task) {
  const results = new Array(items.length); let cursor = 0;
  async function worker() { while (cursor < items.length) { const index = cursor; cursor += 1; try { results[index] = { status: 'fulfilled', value: await task(items[index], index) }; } catch (reason) { results[index] = { status: 'rejected', reason }; } } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
async function googleTrendsItems(limit, geo, categoryKey, windowKey) {
  const win = pickWindow(windowKey); const countries = countryList(geo); const categories = selectedCategories(categoryKey);
  const batches = await mapLimited(countries, 2, async (country) => { const sync = await cachedTrendingRows(country, win); return { country, sync, items: sync.rows.map((row) => rowToItem(row, country, categories, win, sync)).filter(Boolean) }; });
  const items = []; const sync = [];
  batches.forEach((result, index) => { if (result.status !== 'fulfilled') { sync.push({ country_code: countries[index].code, cache: 'error', stale: false, count: 0, error: result.reason?.message || String(result.reason) }); return; } items.push(...result.value.items); sync.push({ country_code: result.value.country.code, fetched_at: new Date(result.value.sync.fetchedAt).toISOString(), cache: result.value.sync.cache, stale: Boolean(result.value.sync.stale), count: result.value.items.length }); });
  if (!batches.some((result) => result.status === 'fulfilled')) throw new Error('Google Trends ülkelerinden güncel veri alınamadı.');
  const seen = new Set(); const unique = items.sort((a, b) => Number(a.country_priority) - Number(b.country_priority) || Number(b.is_active) - Number(a.is_active) || Number(b.trend_score) - Number(a.trend_score) || new Date(b.published_at) - new Date(a.published_at)).filter((item) => { const key = `${item.country_code}:${normalizeTopic(item.title)}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const trItems = unique.filter((item) => item.country_code === 'TR'); const worldItems = unique.filter((item) => item.country_code !== 'TR');
  const scope = String(geo).toUpperCase();
  const selected = scope === 'ALL' ? [...trItems.slice(0, Math.min(20, limit)), ...diversifyCountries(worldItems, Math.max(0, limit - Math.min(20, trItems.length)))] : scope === 'WORLD' ? diversifyCountries(worldItems, limit) : unique.slice(0, limit);
  return { items: selected.slice(0, limit), sync, turkey_count: trItems.length, world_count: worldItems.length };
}

async function fetchRss(url) { const text = await fetchText(url, 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'); return parseFeedItems(text); }
function sourceFromTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts[parts.length - 1].trim() : 'Google News'; }
function cleanNewsTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() : String(title || '').trim(); }
async function fetchGoogleNewsTech(limit = 24) { const raw = await fetchRss(GOOGLE_NEWS_TECH_RSS); const seen = new Set(); const items = []; for (const item of raw) { const title = cleanNewsTitle(safeText(item.title || '')); const key = `${title}:${item.url || ''}`; if (!title || seen.has(key)) continue; seen.add(key); items.push({ title, url: item.url || '', source_name: sourceFromTitle(item.title || ''), published_at: dateIso(item.published_at || ''), summary: safeText(item.summary || ''), image_url: item.image_url || '' }); if (items.length >= limit) break; } return items; }
async function respondGoogleNewsTech(req, res) { const limit = clamp(Number(req.query?.limit || 24), 1, 50); const items = await fetchGoogleNewsTech(limit); return json(res, 200, { items, count: items.length, refreshed_at: new Date().toISOString(), source: 'Google News Bilim ve Teknoloji', source_url: GOOGLE_NEWS_TECH_RSS, via: 'trend-overview' }); }
async function respondGoogleTrends(req, res) { const limit = clamp(Number(req.query?.limit || 72), 1, 120); const geo = String(req.query?.geo || 'all'); const win = pickWindow(req.query?.window || '24h'); const cat = pickCategory(req.query?.category || 'all'); const result = await googleTrendsItems(limit, geo, cat, win.key); const primaryCountry = countryList(geo)[0]; const primaryCategory = selectedCategories(cat)[0] || CATEGORIES[0]; const fetchedTimes = result.sync.map((item) => item.fetched_at).filter(Boolean).sort(); return json(res, 200, { items: result.items, count: result.items.length, turkey_count: result.turkey_count, world_count: result.world_count, sync: result.sync, window: win.key, selected_category: cat, available_windows: WINDOWS, countries: COUNTRIES, categories: CATEGORIES, category: cat === 'all' ? 'Bilim ve Teknoloji' : primaryCategory.name, refreshed_at: fetchedTimes.at(-1) || new Date().toISOString(), response_at: new Date().toISOString(), refresh_interval_minutes: 10, source: 'Google Trends · Şu Anda Trend Olanlar', source_url: pageUrl(primaryCountry, primaryCategory, win), via: 'trend-overview', route: 'google_trends', data_source: 'TrendsUi batchexecute i0OFE', category_source: 'Google Trends kategori kimlikleri 15 ve 18', rss_used: false }); }

function isShortNoiseTopic(topic = '') { const n = normalizeTopic(topic); return ['tr', 'fr', 'uel'].includes(n) || n.length < 3; }
async function defaultOverview(req, res) { const limit = clamp(Number(req.query?.limit || 12), 1, 24); const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); let items = []; try { const supabase = getSupabaseAdmin(); const { data } = await supabase.from('trend_signals').select('normalized_topic,topic_text,detected_at,source_name,signal_score').gte('detected_at', sinceIso).order('detected_at', { ascending: false }).limit(300); const map = new Map(); for (const signal of data || []) { const name = signal.normalized_topic || signal.topic_text || ''; if (!name || isShortNoiseTopic(name)) continue; const key = hashValue(normalizeTopic(name)); if (!map.has(key)) map.set(key, { cluster_key: key, cluster_name: name, trend_score: 55, discover_potential_score: 60, signal_count: 0, window_signal_count: 0, signal_topics: [], signal_sources: [], latest_signal_at: signal.detected_at }); const item = map.get(key); item.signal_count += 1; item.window_signal_count += 1; item.trend_score = Math.max(item.trend_score, Number(signal.signal_score || 55)); item.signal_topics.push(signal.topic_text || name); item.signal_sources.push(signal.source_name || 'Radar'); if (signal.detected_at > item.latest_signal_at) item.latest_signal_at = signal.detected_at; } items = [...map.values()].sort((a, b) => b.window_signal_count - a.window_signal_count || b.trend_score - a.trend_score).slice(0, limit); } catch {} if (!items.length) { const refs = await fetchGoogleNewsTech(limit); items = refs.map((item, index) => ({ cluster_key: hashValue(item.title), cluster_name: item.title, linked_news: [{ candidate_title: item.title, candidate_url: item.url, source_name: item.source_name, published_at: item.published_at, match_score: 1 }], trend_score: 60 - index, discover_potential_score: 62 - index, window_signal_count: 1, signal_count: 1, latest_signal_at: item.published_at })); } return json(res, 200, { items, window: '24h', available_windows: WINDOWS, reference_count: items.length }); }

export default async function handler(req, res) { try { if (String(req.query?.google_news || '') === '1') return await respondGoogleNewsTech(req, res); if (String(req.query?.google_trends || '') === '1') return await respondGoogleTrends(req, res); return await defaultOverview(req, res); } catch (error) { return json(res, 500, { error: error?.message || String(error) }); } }
