import { getSupabaseAdmin, json, hashValue, parseFeedItems, safeText } from './_lib.js';

const GOOGLE_NEWS_TECH_RSS = 'https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvSkwyMHZNR1ptZHpWbUVnSjBjaG9DVkZJb0FBUAE?hl=tr&gl=TR&ceid=TR:tr';
const GOOGLE_NEWS_TIMEOUT_MS = 12000;

const STRONG_TECH_INCLUDE_PATTERNS = [
  /\byapay zeka\b/i, /\bartificial intelligence\b/i, /\bai\b/i, /\bgemini\b/i,
  /\bopenai\b/i, /\bchatgpt\b/i, /\bcodex\b/i, /\bclaude\b/i,
  /\bandroid\b/i, /\bone ui\b/i, /\bios\b/i, /\biphone\b/i, /\bipad\b/i,
  /\bmacbook\b/i, /\bmac\b/i, /\bwindows\b/i, /\bchromebook\b/i,
  /\bpixel\b/i, /\bgalaxy\b/i, /\bsamsung\b/i, /\bgoogle\b/i, /\bapple\b/i,
  /\bhuawei\b/i, /\bxiaomi\b/i, /\boppo\b/i, /\bvivo\b/i, /\bhonor\b/i,
  /\bmeta\b/i, /\byoutube\b/i, /\bchrome\b/i, /\bwhatsapp\b/i, /\btelegram\b/i,
  /\btelefon\b/i, /\bakıllı telefon\b/i, /\btablet\b/i, /\blaptop\b/i, /\bdizüstü\b/i,
  /\bgpu\b/i, /\bcpu\b/i, /\bnvidia\b/i, /\bamd\b/i, /\bintel\b/i,
  /\bsnapdragon\b/i, /\bmediatek\b/i, /\bçip\b/i, /\bchip\b/i, /\bişlemci\b/i,
  /\bwear os\b/i, /\bakıllı saat\b/i, /\bsmartwatch\b/i, /\bapp store\b/i,
  /\bplay store\b/i, /\bxr\b/i, /\bvr\b/i, /\bar\b/i, /\bstreet view\b/i,
  /\bgenie\b/i, /\bomni\b/i, /\bspark\b/i, /\bxbox\b/i, /\bplaystation\b/i,
  /\bsteam\b/i, /\bcontroller\b/i, /\bkonsol\b/i
];

const WEAK_TECH_INCLUDE_PATTERNS = [
  /\bgüncelleme\b/i, /\bupdate\b/i, /\bözellik\b/i, /\bfeature\b/i,
  /\buygulama\b/i, /\bapplication\b/i, /\bsearch\b/i, /\bads\b/i,
  /\bcloud\b/i, /\bdata center\b/i
];

const TECH_EXCLUDE_PATTERNS = [
  /\bhull city\b/i, /\bchampionship\b/i, /\bpremier league\b/i, /\buefa\b/i,
  /\buel\b/i, /\bfutbol\b/i, /\bfootball\b/i, /\bmaç\b/i, /\bmacı\b/i, /\bmaçı\b/i,
  /\bhangi kanalda\b/i, /\bkupa\b/i, /\bvoleybol\b/i, /\bspor\b/i,
  /\btransfer\b/i, /\bteknik direktör\b/i, /\bfenerbahçe\b/i, /\bgalatasaray\b/i,
  /\bbeşiktaş\b/i, /\btrabzonspor\b/i, /\bbasketbol\b/i, /\bfinal\b/i,
  /\blive\b/i, /\bdeprem\b/i, /\bhava durumu\b/i, /\bmeteoroloji\b/i,
  /\bkonser\b/i, /\bbelediye\b/i, /\bsiyaset\b/i, /\bparti\b/i, /\bseçim\b/i,
  /\bemekli\b/i, /\bmaaş\b/i, /\baltın\b/i, /\bdolar\b/i, /\bfaiz\b/i,
  /\bborsa\b/i, /\bhisse\b/i, /\bprime video\b/i, /\bnetflix\b/i, /\bdizi\b/i,
  /\bsezon\b/i, /\bbölüm\b/i, /\bkimdir\b/i, /\bsevgilisi\b/i, /\bsurvivor\b/i,
  /\bthe boys\b/i, /\bçılgın sayısal\b/i, /\bşok kataloğu\b/i, /\bbankalar açık mı\b/i,
  /\bptt\b/i, /\bbaraj\b/i, /\belektrik kesintisi\b/i, /\bson dakika\b/i,
  /\bokullar ne zaman kapanıyor\b/i, /\btan taşcı\b/i, /\buyuşturucu\b/i, /\boperasyon\b/i
];

const SHORT_NOISE_TOPICS = new Set(['tr', 'fr', 'uel']);
const TURKEY_TECH_SOURCE_PATTERNS = [/shiftdelete/i, /donanımhaber/i, /webtekno/i, /tamindir/i, /log\.com\.tr/i, /teknoblog/i, /webrazzi/i, /chip online/i, /hardware plus/i, /google trends tr/i, /tr 4s teknoloji/i, /tr 24s teknoloji/i, /tr 48s teknoloji/i, /tr 168s teknoloji/i, /tr 7g teknoloji/i];

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function normalizeTopic(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9çğıöşü\s]/gi, ' ').replace(/\s+/g, ' ').trim(); }
function parseWindow(value = '') { const n = String(value || '').trim().toLowerCase(); return ['4h', '24h', '48h', '168h'].includes(n) ? n : '24h'; }
function windowHours(w = '24h') { return Number(String(w).replace(/[^0-9]/g, '')) || 24; }
function hoursAgoIso(hours) { return new Date(Date.now() - (hours * 3600 * 1000)).toISOString(); }
function sortByTurkeyTechAndTrend(a, b) { return Number(b.window_signal_count || 0) - Number(a.window_signal_count || 0) || Number(b.trend_score || 0) - Number(a.trend_score || 0) || new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime(); }
function bucketSizeHours(w = '24h') { if (w === '4h') return 1; if (w === '48h') return 4; if (w === '168h') return 24; return 2; }
function formatBucketLabel(date, bucketHours) { const pad = (n) => String(n).padStart(2, '0'); const hour = date.getUTCHours(); return bucketHours >= 24 ? `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}` : `${pad(hour)}:00`; }
function buildSparkline(signals = [], selectedWindow = '24h') { const hours = windowHours(selectedWindow); const bucketHours = bucketSizeHours(selectedWindow); const bucketCount = Math.max(1, Math.ceil(hours / bucketHours)); const now = Date.now(); const bucketMs = bucketHours * 3600 * 1000; const startMs = now - (bucketCount * bucketMs); const buckets = Array.from({ length: bucketCount }, (_, i) => { const ts = startMs + (i * bucketMs); return { ts: new Date(ts).toISOString(), label: formatBucketLabel(new Date(ts), bucketHours), count: 0 }; }); for (const signal of signals) { const detectedAt = new Date(signal.detected_at || 0).getTime(); if (!Number.isFinite(detectedAt) || detectedAt < startMs) continue; const index = Math.floor((detectedAt - startMs) / bucketMs); if (index >= 0 && index < buckets.length) buckets[index].count += 1; } return buckets; }
function hasStrongTech(text = '') { return STRONG_TECH_INCLUDE_PATTERNS.some((p) => p.test(String(text || ''))); }
function hasWeakTech(text = '') { return WEAK_TECH_INCLUDE_PATTERNS.some((p) => p.test(String(text || ''))); }
function looksExcluded(text = '') { return TECH_EXCLUDE_PATTERNS.some((p) => p.test(String(text || ''))); }
function isShortNoiseTopic(topic = '') { const n = normalizeTopic(topic); return SHORT_NOISE_TOPICS.has(n) || n.length < 3; }
function hasTurkeyTechSignal(cluster = {}) { const sourceText = [cluster.country_code, cluster.market_scope, ...(Array.isArray(cluster.signal_sources) ? cluster.signal_sources : []), ...(Array.isArray(cluster.linked_news) ? cluster.linked_news.map((i) => i.source_name) : []), ...(Array.isArray(cluster.summary?.sample_topics) ? cluster.summary.sample_topics : [])].filter(Boolean).join(' \n '); return Number(cluster.turkey_interest_score || 0) >= 50 || /\bTR\b/i.test(sourceText) || /turkey|türkiye/i.test(sourceText) || TURKEY_TECH_SOURCE_PATTERNS.some((p) => p.test(sourceText)); }
function filterLinkedNews(cluster = {}) { return (Array.isArray(cluster.linked_news) ? cluster.linked_news : []).filter((item) => { const text = [item.candidate_title, item.source_name, item.candidate_url].filter(Boolean).join(' \n '); if (looksExcluded(text)) return false; return hasStrongTech(text) || hasWeakTech(text); }).slice(0, 5); }
function isTechCluster(cluster = {}) { const linkedNews = filterLinkedNews(cluster); const signalTopics = Array.isArray(cluster.signal_topics) ? cluster.signal_topics : []; if (signalTopics.length && signalTopics.every(isShortNoiseTopic)) return false; const text = [cluster.cluster_name, cluster.summary?.display_name, ...(Array.isArray(cluster.summary?.sample_topics) ? cluster.summary.sample_topics : []), ...signalTopics, ...linkedNews.map((item) => item.candidate_title)].filter(Boolean).join(' \n '); if (!text.trim()) return false; if (looksExcluded(text) && !hasStrongTech(text)) return false; if (!hasTurkeyTechSignal({ ...cluster, linked_news: linkedNews })) return false; if (hasStrongTech(text)) return true; return hasWeakTech(text) && linkedNews.length >= 1; }
function decorateCluster(cluster = {}, signalGroup = {}, selectedWindow = '24h') { const signals = Array.isArray(signalGroup.signals) ? signalGroup.signals : []; const sparkline = buildSparkline(signals, selectedWindow); const latestSignalAt = signals.length ? signals.reduce((latest, item) => { const current = new Date(item.detected_at || 0).toISOString(); return !latest || current > latest ? current : latest; }, '') : null; return { ...cluster, selected_window: selectedWindow, window_signal_count: signals.length, sparkline, latest_signal_at: latestSignalAt, signal_sources: [...new Set(signals.map((item) => item.source_name).filter(Boolean))], signal_topics: [...new Set(signals.map((item) => item.topic_text).filter(Boolean))], linked_news: filterLinkedNews(cluster) }; }

function googleNewsSourceFromTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts[parts.length - 1].trim() : 'Google News'; }
function googleNewsCleanTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() : String(title || '').trim(); }
function normalizeGoogleNewsLimit(value) { const limit = Number(value || 24); return Math.min(40, Math.max(1, Number.isFinite(limit) ? Math.round(limit) : 24)); }
function normalizeGoogleNewsDate(value = '') { const date = new Date(String(value || '').trim()); return Number.isNaN(date.getTime()) ? String(value || '').trim() : date.toISOString(); }
async function fetchGoogleNewsTech(limit = 24) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), GOOGLE_NEWS_TIMEOUT_MS); try { const response = await fetch(GOOGLE_NEWS_TECH_RSS, { cache: 'no-store', signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0 (+https://www.teknoblog.com/)', accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' } }); if (!response.ok) throw new Error(`Google News RSS alınamadı: HTTP ${response.status}`); const xml = await response.text(); const seen = new Set(); const items = []; for (const raw of parseFeedItems(xml)) { const title = safeText(raw.title || ''); const cleanTitle = googleNewsCleanTitle(title); const item = { title: cleanTitle, url: raw.url || '', source_name: googleNewsSourceFromTitle(title), published_at: normalizeGoogleNewsDate(raw.published_at || ''), summary: safeText(raw.summary || ''), image_url: raw.image_url || '' }; const key = `${item.title}::${item.url}`; if (!item.title || !item.url || seen.has(key)) continue; seen.add(key); items.push(item); if (items.length >= limit) break; } return items; } finally { clearTimeout(timeout); } }
async function respondGoogleNewsTech(req, res) { const limit = normalizeGoogleNewsLimit(req.query?.limit); const items = await fetchGoogleNewsTech(limit); return json(res, 200, { items, count: items.length, refreshed_at: new Date().toISOString(), source: 'Google News Bilim ve Teknoloji', source_url: GOOGLE_NEWS_TECH_RSS, via: 'trend-overview' }); }

export default async function handler(req, res) {
  try {
    if (String(req.query?.google_news || '') === '1') return await respondGoogleNewsTech(req, res);

    const supabase = getSupabaseAdmin();
    const selectedWindow = parseWindow(req.query?.window || '24h');
    const limit = clamp(Number(req.query?.limit || 12), 1, 24);
    const sinceIso = hoursAgoIso(windowHours(selectedWindow) + 4);
    const { data: signals, error: signalsError } = await supabase.from('trend_signals').select('normalized_topic,topic_text,detected_at,time_window,market_scope,country_code,source_name,signal_score').eq('time_window', selectedWindow).gte('detected_at', sinceIso).order('detected_at', { ascending: false }).limit(2000);
    if (signalsError) return json(res, 500, { error: signalsError.message });
    const signalGroups = new Map();
    for (const signal of signals || []) { const normalizedTopic = normalizeTopic(signal.normalized_topic || signal.topic_text || ''); if (!normalizedTopic || isShortNoiseTopic(normalizedTopic)) continue; const clusterKey = hashValue(normalizedTopic); if (!signalGroups.has(clusterKey)) signalGroups.set(clusterKey, { cluster_key: clusterKey, normalized_topic: normalizedTopic, signals: [] }); signalGroups.get(clusterKey).signals.push(signal); }
    const clusterKeys = [...signalGroups.keys()];
    if (!clusterKeys.length) return json(res, 200, { items: [], window: selectedWindow, available_windows: ['4h', '24h', '48h', '168h'] });
    const { data: clusters, error: clustersError } = await supabase.from('trend_clusters').select('*').in('cluster_key', clusterKeys).neq('status', 'archived').limit(150);
    if (clustersError) return json(res, 500, { error: clustersError.message });
    const clusterIds = (clusters || []).map((item) => item.id).filter(Boolean);
    let links = [];
    if (clusterIds.length) { const { data: linkRows, error: linksError } = await supabase.from('trend_news_links').select('cluster_id,candidate_title,candidate_url,source_name,match_score').in('cluster_id', clusterIds).order('match_score', { ascending: false }); if (linksError) return json(res, 500, { error: linksError.message }); links = linkRows || []; }
    const linksByCluster = new Map();
    for (const link of links) { const key = String(link.cluster_id || ''); if (!linksByCluster.has(key)) linksByCluster.set(key, []); if (linksByCluster.get(key).length < 8) linksByCluster.get(key).push(link); }
    const decorated = (clusters || []).map((cluster) => decorateCluster({ ...cluster, linked_news: linksByCluster.get(String(cluster.id || '')) || [] }, signalGroups.get(String(cluster.cluster_key || '')) || { signals: [] }, selectedWindow)).filter((cluster) => Number(cluster.window_signal_count || 0) > 0).filter(isTechCluster).sort(sortByTurkeyTechAndTrend).slice(0, limit);
    return json(res, 200, { items: decorated, window: selectedWindow, available_windows: ['4h', '24h', '48h', '168h'] });
  } catch (error) { return json(res, 500, { error: error?.message || String(error) }); }
}
