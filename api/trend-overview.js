import { getSupabaseAdmin, json, hashValue, parseFeedItems, safeText } from './_lib.js';

const GOOGLE_NEWS_TECH_RSS = 'https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvSkwyMHZNR1ptZHpWbUVnSjBjaG9DVkZJb0FBUAE?hl=tr&gl=TR&ceid=TR:tr';
const GOOGLE_NEWS_TIMEOUT_MS = 12000;
const MAX_AGE_HOURS = 24;

const FRESH_NEWS_QUERIES = [
  'teknoloji',
  'yapay zeka OR ChatGPT OR OpenAI',
  'Google OR Android OR Gemini',
  'Apple OR iPhone OR iOS',
  'Samsung OR Galaxy OR One UI',
  'Xiaomi OR Huawei OR Honor',
  'Windows OR Microsoft OR Copilot',
  'Nvidia OR AMD OR Intel',
  'WhatsApp OR Instagram OR YouTube',
  'telefon OR tablet OR laptop',
  'güvenlik açığı OR siber güvenlik',
  'Türkiye teknoloji'
];

const STRONG_TECH_INCLUDE_PATTERNS = [
  /\byapay zeka\b/i, /\bartificial intelligence\b/i, /\bai\b/i, /\bgemini\b/i,
  /\bopenai\b/i, /\bchatgpt\b/i, /\bcodex\b/i, /\bclaude\b/i,
  /\bandroid\b/i, /\bone ui\b/i, /\bios\b/i, /\biphone\b/i, /\bipad\b/i,
  /\bmacbook\b/i, /\bimac\b/i, /\bmacos\b/i, /\bmac mini\b/i, /\bmac studio\b/i, /\bapple mac\b/i, /\bm\d\s*mac\b/i,
  /\bwindows\b/i, /\bchromebook\b/i, /\bpixel\b/i, /\bgalaxy\b/i, /\bsamsung\b/i,
  /\bgoogle\b/i, /\bapple\b/i, /\bhuawei\b/i, /\bxiaomi\b/i, /\boppo\b/i,
  /\bvivo\b/i, /\bhonor\b/i, /\bmeta\b/i, /\byoutube\b/i, /\bchrome\b/i,
  /\bwhatsapp\b/i, /\btelegram\b/i, /\btelefon\b/i, /\bakıllı telefon\b/i,
  /\btablet\b/i, /\blaptop\b/i, /\bdizüstü\b/i, /\bgpu\b/i, /\bcpu\b/i,
  /\bnvidia\b/i, /\bamd\b/i, /\bintel\b/i, /\bsnapdragon\b/i, /\bmediatek\b/i,
  /\bçip\b/i, /\bchip\b/i, /\bişlemci\b/i, /\bwear os\b/i, /\bakıllı saat\b/i,
  /\bsmartwatch\b/i, /\bapp store\b/i, /\bplay store\b/i, /\bxbox\b/i,
  /\bplaystation\b/i, /\bsteam\b/i, /\bkonsol\b/i, /\bsiber\b/i, /\bgüvenlik açığı\b/i
];

const WEAK_TECH_INCLUDE_PATTERNS = [
  /\bgüncelleme\b/i, /\bupdate\b/i, /\bözellik\b/i, /\bfeature\b/i,
  /\buygulama\b/i, /\bapplication\b/i, /\bsearch\b/i, /\bads\b/i,
  /\bcloud\b/i, /\bdata center\b/i, /\bindirim\b/i, /\bfiyat\b/i
];

const EXCLUDE_PATTERNS = [
  /\bhull city\b/i, /\bchampionship\b/i, /\bpremier league\b/i, /\buefa\b/i,
  /\bfutbol\b/i, /\bfootball\b/i, /\bmaç\b/i, /\bmac\b/i, /\bmacı\b/i, /\bmaci\b/i, /\bmaçı\b/i,
  /\bhangi kanalda\b/i, /\bne zaman\b/i, /\bsaat kaçta\b/i, /\bsaat kacta\b/i,
  /\bcanlı izle\b/i, /\bcanli izle\b/i, /\bcanlı skor\b/i, /\bcanli skor\b/i,
  /\bkupa\b/i, /\bvoleybol\b/i, /\bspor\b/i, /\btransfer\b/i, /\bfenerbahçe\b/i,
  /\bfenerbahce\b/i, /\bgalatasaray\b/i, /\bbeşiktaş\b/i, /\bbesiktas\b/i,
  /\btrabzonspor\b/i, /\bbasketbol\b/i, /\bdeprem\b/i, /\bhava durumu\b/i,
  /\bmeteoroloji\b/i, /\bkonser\b/i, /\bbelediye\b/i, /\bsiyaset\b/i,
  /\bemekli\b/i, /\bmaaş\b/i, /\baltın\b/i, /\bdolar\b/i, /\bfaiz\b/i,
  /\bborsa\b/i, /\bhisse\b/i, /\bdizi\b/i, /\bsezon\b/i, /\bbölüm\b/i,
  /\bkimdir\b/i, /\bsevgilisi\b/i, /\bsurvivor\b/i, /\bson dakika\b/i
];

const SHORT_NOISE_TOPICS = new Set(['tr', 'fr', 'uel']);

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function normalizeTopic(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9çğıöşü\s]/gi, ' ').replace(/\s+/g, ' ').trim(); }
function parseWindow(value = '') { const n = String(value || '').trim().toLowerCase(); return ['4h', '24h', '48h', '168h'].includes(n) ? n : '24h'; }
function windowHours(w = '24h') { return Math.min(Number(String(w).replace(/[^0-9]/g, '')) || 24, MAX_AGE_HOURS); }
function hoursAgoIso(hours) { return new Date(Date.now() - (hours * 3600 * 1000)).toISOString(); }
function isFresh(value = '', maxHours = MAX_AGE_HOURS) { const ts = new Date(value || 0).getTime(); return Number.isFinite(ts) && ts > 0 && (Date.now() - ts) <= maxHours * 3600 * 1000; }
function hasStrongTech(text = '') { return STRONG_TECH_INCLUDE_PATTERNS.some((p) => p.test(String(text || ''))); }
function hasWeakTech(text = '') { return WEAK_TECH_INCLUDE_PATTERNS.some((p) => p.test(String(text || ''))); }
function looksExcluded(text = '') { return EXCLUDE_PATTERNS.some((p) => p.test(String(text || ''))); }
function isShortNoiseTopic(topic = '') { const n = normalizeTopic(topic); return SHORT_NOISE_TOPICS.has(n) || n.length < 3; }
function isTechText(text = '') { const value = String(text || ''); if (!value.trim()) return false; if (looksExcluded(value) && !hasStrongTech(value)) return false; return hasStrongTech(value) || hasWeakTech(value); }
function sortByTodayPriority(a, b) { return Number(b.window_signal_count || 0) - Number(a.window_signal_count || 0) || Number(b.discover_potential_score || 0) - Number(a.discover_potential_score || 0) || Number(b.trend_score || 0) - Number(a.trend_score || 0) || new Date(b.latest_signal_at || b.last_seen_at || 0).getTime() - new Date(a.latest_signal_at || a.last_seen_at || 0).getTime(); }
function bucketSizeHours(w = '24h') { if (w === '4h') return 1; return 4; }
function formatBucketLabel(date, bucketHours) { const pad = (n) => String(n).padStart(2, '0'); const hour = date.getHours(); return bucketHours >= 24 ? `${pad(date.getDate())}.${pad(date.getMonth() + 1)}` : `${pad(hour)}:00`; }
function buildSparkline(signals = [], selectedWindow = '24h') { const hours = windowHours(selectedWindow); const bucketHours = bucketSizeHours(selectedWindow); const bucketCount = Math.max(1, Math.ceil(hours / bucketHours)); const now = Date.now(); const bucketMs = bucketHours * 3600 * 1000; const startMs = now - (bucketCount * bucketMs); const buckets = Array.from({ length: bucketCount }, (_, i) => { const ts = startMs + (i * bucketMs); return { ts: new Date(ts).toISOString(), label: formatBucketLabel(new Date(ts), bucketHours), count: 0 }; }); for (const signal of signals) { const detectedAt = new Date(signal.detected_at || 0).getTime(); if (!Number.isFinite(detectedAt) || detectedAt < startMs) continue; const index = Math.floor((detectedAt - startMs) / bucketMs); if (index >= 0 && index < buckets.length) buckets[index].count += 1; } return buckets; }
function sourceFromTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts[parts.length - 1].trim() : 'Google News'; }
function cleanNewsTitle(title = '') { const parts = String(title || '').trim().split(' - '); return parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() : String(title || '').trim(); }
function normalizePublishedAt(value = '') { const date = new Date(String(value || '').trim()); return Number.isNaN(date.getTime()) ? '' : date.toISOString(); }
function normalizeLimit(value) { const limit = Number(value || 24); return Math.min(50, Math.max(1, Number.isFinite(limit) ? Math.round(limit) : 24)); }
function keywordsFor(text = '') { return normalizeTopic(text).split(' ').filter((word) => word.length >= 4 && !['haber','güncel','teknoloji','türkiye','turkiye','için','olan','yeni'].includes(word)).slice(0, 8); }
function overlapScore(a = '', b = '') { const ak = new Set(keywordsFor(a)); const bk = new Set(keywordsFor(b)); let score = 0; for (const word of ak) if (bk.has(word)) score += 1; return score; }

async function fetchRss(url) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), GOOGLE_NEWS_TIMEOUT_MS); try { const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0 (+https://www.teknoblog.com/)', accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' } }); if (!response.ok) return []; const xml = await response.text(); return parseFeedItems(xml); } finally { clearTimeout(timeout); } }
async function fetchGoogleNewsTech(limit = 24) { const raw = await fetchRss(GOOGLE_NEWS_TECH_RSS); const seen = new Set(); const items = []; for (const item of raw) { const title = safeText(item.title || ''); const normalized = { title: cleanNewsTitle(title), url: item.url || '', source_name: sourceFromTitle(title), published_at: normalizePublishedAt(item.published_at || ''), summary: safeText(item.summary || ''), image_url: item.image_url || '' }; const key = `${normalized.title}::${normalized.url}`; if (!normalized.title || !normalized.url || seen.has(key)) continue; if (!isFresh(normalized.published_at, MAX_AGE_HOURS)) continue; if (!isTechText(`${normalized.title} ${normalized.summary} ${normalized.source_name}`)) continue; seen.add(key); items.push(normalized); if (items.length >= limit) break; } return items; }
async function fetchFreshReferences(limit = 80) { const urls = FRESH_NEWS_QUERIES.map((query) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=tr&gl=TR&ceid=TR:tr`); const batches = await Promise.all(urls.map(fetchRss)); const seen = new Set(); const items = []; for (const raw of batches.flat()) { const title = safeText(raw.title || ''); const item = { candidate_title: cleanNewsTitle(title), candidate_url: raw.url || '', source_name: sourceFromTitle(title), published_at: normalizePublishedAt(raw.published_at || ''), summary: safeText(raw.summary || ''), image_url: raw.image_url || '', match_score: 0 }; const key = `${item.candidate_title}::${item.candidate_url}`; if (!item.candidate_title || !item.candidate_url || seen.has(key)) continue; if (!isFresh(item.published_at, MAX_AGE_HOURS)) continue; if (!isTechText(`${item.candidate_title} ${item.summary} ${item.source_name}`)) continue; seen.add(key); items.push(item); if (items.length >= limit) break; } return items; }
async function respondGoogleNewsTech(req, res) { const limit = normalizeLimit(req.query?.limit); const items = await fetchGoogleNewsTech(limit); return json(res, 200, { items, count: items.length, refreshed_at: new Date().toISOString(), source: 'Google News Bilim ve Teknoloji', source_url: GOOGLE_NEWS_TECH_RSS, max_age_hours: MAX_AGE_HOURS, via: 'trend-overview' }); }
function decorateCluster(cluster = {}, signalGroup = {}, selectedWindow = '24h', freshRefs = []) { const signals = Array.isArray(signalGroup.signals) ? signalGroup.signals.filter((signal) => isFresh(signal.detected_at, windowHours(selectedWindow))) : []; const clusterText = [cluster.cluster_name, cluster.summary?.display_name, ...(Array.isArray(cluster.summary?.sample_topics) ? cluster.summary.sample_topics : []), ...signals.map((item) => item.topic_text)].filter(Boolean).join(' '); const linkedNews = freshRefs.map((ref) => ({ ...ref, match_score: overlapScore(clusterText, `${ref.candidate_title} ${ref.summary}`) })).filter((ref) => ref.match_score >= 1 || hasStrongTech(ref.candidate_title)).sort((a, b) => b.match_score - a.match_score || new Date(b.published_at || 0) - new Date(a.published_at || 0)).slice(0, 5); const latestSignalAt = signals.length ? signals.reduce((latest, item) => { const current = new Date(item.detected_at || 0).toISOString(); return !latest || current > latest ? current : latest; }, '') : null; return { ...cluster, selected_window: selectedWindow, window_signal_count: signals.length, sparkline: buildSparkline(signals, selectedWindow), latest_signal_at: latestSignalAt, signal_sources: [...new Set(signals.map((item) => item.source_name).filter(Boolean))], signal_topics: [...new Set(signals.map((item) => item.topic_text).filter(Boolean))], linked_news: linkedNews, source_count: Math.max(Number(cluster.source_count || 0), linkedNews.length), max_age_hours: MAX_AGE_HOURS }; }
function buildClustersFromFreshReferences(freshRefs = [], limit = 12) { const map = new Map(); for (const ref of freshRefs) { const primary = keywordsFor(ref.candidate_title)[0] || normalizeTopic(ref.candidate_title).slice(0, 40); if (!primary) continue; const key = hashValue(primary); if (!map.has(key)) map.set(key, { cluster_key: key, cluster_name: ref.candidate_title, linked_news: [], trend_score: 55, discover_potential_score: 62, seo_potential_score: 58, affiliate_potential_score: 35, turkey_interest_score: /türkiye|turkiye|tl|btk/i.test(`${ref.candidate_title} ${ref.summary}`) ? 75 : 50, source_count: 0, signal_count: 0, competitor_count: 0, status: 'fresh_reference', summary: { display_name: ref.candidate_title, sample_topics: [ref.candidate_title] } }); const cluster = map.get(key); cluster.linked_news.push({ ...ref, match_score: 1 }); cluster.source_count = new Set(cluster.linked_news.map((item) => item.source_name)).size; cluster.signal_count = cluster.linked_news.length; cluster.window_signal_count = cluster.linked_news.length; cluster.latest_signal_at = cluster.linked_news.reduce((latest, item) => item.published_at > latest ? item.published_at : latest, ''); } return [...map.values()].sort(sortByTodayPriority).slice(0, limit); }

export default async function handler(req, res) {
  try {
    if (String(req.query?.google_news || '') === '1') return await respondGoogleNewsTech(req, res);

    const supabase = getSupabaseAdmin();
    const selectedWindow = parseWindow(req.query?.window || '24h');
    const limit = clamp(Number(req.query?.limit || 12), 1, 24);
    const sinceIso = hoursAgoIso(windowHours(selectedWindow));
    const freshRefs = await fetchFreshReferences(90);

    const { data: signals, error: signalsError } = await supabase
      .from('trend_signals')
      .select('normalized_topic,topic_text,detected_at,time_window,market_scope,country_code,source_name,signal_score')
      .gte('detected_at', sinceIso)
      .order('detected_at', { ascending: false })
      .limit(2000);

    if (signalsError) return json(res, 500, { error: signalsError.message });

    const signalGroups = new Map();
    for (const signal of signals || []) {
      const normalizedTopic = normalizeTopic(signal.normalized_topic || signal.topic_text || '');
      if (!normalizedTopic || isShortNoiseTopic(normalizedTopic) || !isTechText(normalizedTopic)) continue;
      const clusterKey = hashValue(normalizedTopic);
      if (!signalGroups.has(clusterKey)) signalGroups.set(clusterKey, { cluster_key: clusterKey, normalized_topic: normalizedTopic, signals: [] });
      signalGroups.get(clusterKey).signals.push(signal);
    }

    const clusterKeys = [...signalGroups.keys()];
    let decorated = [];

    if (clusterKeys.length) {
      const { data: clusters, error: clustersError } = await supabase
        .from('trend_clusters')
        .select('*')
        .in('cluster_key', clusterKeys)
        .neq('status', 'archived')
        .gte('last_seen_at', sinceIso)
        .limit(150);

      if (clustersError) return json(res, 500, { error: clustersError.message });

      decorated = (clusters || [])
        .map((cluster) => decorateCluster(cluster, signalGroups.get(String(cluster.cluster_key || '')) || { signals: [] }, selectedWindow, freshRefs))
        .filter((cluster) => Number(cluster.window_signal_count || 0) > 0)
        .filter((cluster) => isTechText([cluster.cluster_name, ...(cluster.signal_topics || []), ...(cluster.linked_news || []).map((item) => item.candidate_title)].flat().join(' ')))
        .sort(sortByTodayPriority)
        .slice(0, limit);
    }

    if (decorated.length < Math.min(6, limit)) {
      const fallback = buildClustersFromFreshReferences(freshRefs, limit - decorated.length);
      const existing = new Set(decorated.map((item) => normalizeTopic(item.cluster_name).slice(0, 48)));
      decorated.push(...fallback.filter((item) => !existing.has(normalizeTopic(item.cluster_name).slice(0, 48))));
    }

    return json(res, 200, { items: decorated.slice(0, limit), window: selectedWindow, available_windows: ['4h', '24h'], max_age_hours: MAX_AGE_HOURS, reference_count: freshRefs.length });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
