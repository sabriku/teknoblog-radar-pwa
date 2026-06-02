import { getSupabaseAdmin, json } from './_lib.js';
import opportunityRadar from './opportunity-radar.js';

function scoreValue(item, key) {
  const value = Number(item?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function timeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function textOf(item = {}) {
  return [
    item.title,
    item.summary,
    item.excerpt,
    item.description,
    item.source_name,
    item.url,
    item.canonical_url,
    item.link
  ].filter(Boolean).join(' ').toLowerCase();
}

const HARD_NOISE_PATTERNS = [
  /hull\s*city/i,
  /polonya/i,
  /voleybol/i,
  /futbol/i,
  /basketbol/i,
  /\bkupa\b/i,
  /hangi\s*kanalda/i,
  /canli\s*izle|canlı\s*izle/i,
  /\bmac[iı]\b/i,
  /\bmaç[ıi]?\b/i,
  /\bspor\b/i,
  /premier\s*league/i,
  /championship/i,
  /galatasaray/i,
  /fenerbahçe/i,
  /besiktas|beşiktaş/i,
  /trabzonspor/i,
  /transfer/i,
  /deprem/i,
  /hava\s*durumu/i,
  /burç/i,
  /kimdir/i
];

const TECH_PATTERNS = [
  /google|android|iphone|ios|ipad|macbook|windows|samsung|galaxy|xiaomi|huawei|oppo|vivo|honor|pixel/i,
  /openai|chatgpt|gemini|claude|yapay\s*zeka|\bai\b/i,
  /telefon|tablet|laptop|gpu|cpu|nvidia|amd|intel|snapdragon|mediatek|çip|chip|işlemci/i,
  /watch|wear\s*os|akıllı\s*saat|app\s*store|play\s*store|whatsapp|instagram|youtube|chrome/i,
  /microsoft|apple|meta|xbox|playstation|steam|güvenlik|siber|veri|uygulama|yazılım|robot/i
];

const DISCOVER_TOPIC_PATTERNS = [
  /yapay\s*zeka|openai|chatgpt|gemini|claude|copilot/i,
  /google|android|chrome|youtube|whatsapp|instagram|meta/i,
  /apple|iphone|ios|ipad|macbook|vision\s*pro/i,
  /samsung|galaxy|one\s*ui|xiaomi|huawei|honor|oppo|vivo|pixel/i,
  /windows|microsoft|nvidia|amd|intel|snapdragon|mediatek/i,
  /güvenlik|siber|veri\s*sızıntısı|hack|açık/i,
  /güncelleme|beta|özellik|sızıntı|iddia|rapor|tanıttı|duyurdu|fiyat|indirim/i
];

const TRUSTED_SOURCE_PATTERNS = [
  /teknoblog/i,
  /the verge|verge/i,
  /engadget/i,
  /techcrunch/i,
  /9to5|macrumors|android authority|windows central/i,
  /shiftdelete|donanımhaber|webtekno|webrazzi|log\.com\.tr|chip/i
];

function isHardNoise(item = {}) {
  const text = textOf(item);
  if (!text.trim()) return false;
  const hasNoise = HARD_NOISE_PATTERNS.some((pattern) => pattern.test(text));
  if (!hasNoise) return false;
  return !TECH_PATTERNS.some((pattern) => pattern.test(text));
}

function hasTechSignal(item = {}) {
  return TECH_PATTERNS.some((pattern) => pattern.test(textOf(item)));
}

function isTrendFeedItem(item = {}) {
  const text = textOf(item);
  return /google\s*trends|trend\s*feed|tr\s*4s\s*teknoloji|tr\s*24s\s*teknoloji|tr\s*48s\s*teknoloji|tr\s*168s\s*teknoloji/i.test(text);
}

function ageHours(item) {
  const published = timeValue(item?.published_at || item?.updated_at || item?.created_at);
  if (!published) return 999999;
  return Math.max(0, (Date.now() - published) / 3600000);
}

function isFreshForDiscover(item, maxHours = 24) {
  return ageHours(item) <= maxHours;
}

function freshnessScore(item) {
  const hours = ageHours(item);
  if (hours <= 2) return 34;
  if (hours <= 6) return 30;
  if (hours <= 12) return 25;
  if (hours <= 24) return 20;
  if (hours <= 36) return 6;
  if (hours <= 48) return -8;
  if (hours <= 72) return -24;
  if (hours <= 168) return -58;
  return -100;
}

function sourceAdjustment(item) {
  let adjustment = 0;
  if (isTrendFeedItem(item)) adjustment -= 45;
  if (TRUSTED_SOURCE_PATTERNS.some((pattern) => pattern.test(textOf(item)))) adjustment += 8;
  return adjustment;
}

function titleQualityScore(item = {}) {
  const title = String(item.title || '').trim();
  const text = textOf(item);
  let value = 0;
  if (title.length >= 35 && title.length <= 130) value += 10;
  if (DISCOVER_TOPIC_PATTERNS.some((pattern) => pattern.test(text))) value += 24;
  if (/nasıl|neden|hangi|ne zaman|liste|alacak|geliyor|değişiyor|artıyor|düşüyor|başladı|yayınlandı|sundu|tanıttı|duyurdu/i.test(title)) value += 10;
  if (/son dakika|canlı|maç|hangi kanalda|kimdir|burç|deprem/i.test(text)) value -= 35;
  if (item.image_url || item.image || item.thumbnail) value += 6;
  if (item.summary || item.excerpt || item.description) value += 5;
  return value;
}

function computedDiscoverScore(item = {}) {
  const base = scoreValue(item, 'discover_score');
  const total = scoreValue(item, 'total_score');
  const traffic = scoreValue(item, 'traffic_score');
  const editorial = scoreValue(item, 'editorial_score');
  const score = Math.round(
    (base * 0.34) +
    (total * 0.16) +
    (traffic * 0.12) +
    (editorial * 0.10) +
    titleQualityScore(item) +
    freshnessScore(item) +
    sourceAdjustment(item)
  );
  return Math.max(0, Math.min(100, Math.max(base, score)));
}

function adjustedScore(item, sortKey) {
  if (sortKey === 'published_at' || sortKey === 'updated_at') {
    return timeValue(item?.[sortKey]);
  }

  if (sortKey === 'discover_score') {
    return computedDiscoverScore(item);
  }

  const raw = scoreValue(item, sortKey);
  const total = scoreValue(item, 'total_score');
  const editorial = scoreValue(item, 'editorial_score');
  const discover = computedDiscoverScore(item);

  return Math.round(
    (raw * 0.55) +
    (total * 0.18) +
    (editorial * 0.14) +
    (discover * 0.13) +
    freshnessScore(item) +
    sourceAdjustment(item)
  );
}

function compareItems(a, b, sortKey) {
  if (sortKey === 'published_at' || sortKey === 'updated_at') {
    return timeValue(b?.[sortKey]) - timeValue(a?.[sortKey]);
  }

  const adjustedDiff = adjustedScore(b, sortKey) - adjustedScore(a, sortKey);
  if (adjustedDiff !== 0) return adjustedDiff;

  const publishedDiff = timeValue(b?.published_at) - timeValue(a?.published_at);
  if (publishedDiff !== 0) return publishedDiff;

  return timeValue(b?.updated_at) - timeValue(a?.updated_at);
}

function withDiscoverScore(item = {}) {
  const radarDiscoverScore = computedDiscoverScore(item);
  return {
    ...item,
    original_discover_score: scoreValue(item, 'discover_score'),
    radar_discover_score: radarDiscoverScore,
    discover_score: radarDiscoverScore
  };
}

function normalizeRawItem(item = {}, sourceMap = new Map()) {
  const sourceName = item.source_name || sourceMap.get(String(item.source_id)) || '';
  return {
    ...item,
    title: item.title || item.item_title || item.feed_title || item.name || '',
    summary: item.summary || item.description || item.excerpt || '',
    url: item.url || item.link || item.canonical_url || item.guid || '',
    source_name: sourceName,
    published_at: item.published_at || item.created_at || item.updated_at || null,
    image_url: item.image_url || item.thumbnail || item.image || null,
    total_score: item.total_score || 0,
    traffic_score: item.traffic_score || 0,
    editorial_score: item.editorial_score || 0,
    discover_score: item.discover_score || 0
  };
}

function dedupeItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.url || item.canonical_url || item.link || item.title || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function handler(req, res) {
  try {
    if (String(req.query?.opportunity || '') === '1') {
      return await opportunityRadar(req, res);
    }

    const supabase = getSupabaseAdmin();
    const sort = req.query?.sort || 'published_at';

    const allowedSorts = [
      'total_score',
      'traffic_score',
      'conversion_score',
      'discover_score',
      'social_score',
      'editorial_score',
      'updated_at',
      'published_at'
    ];

    const sortKey = allowedSorts.includes(sort) ? sort : 'published_at';
    const discoverMode = sortKey === 'discover_score';

    const [{ data: items, error: itemsError }, { data: sources, error: sourcesError }, { data: rawItems, error: rawItemsError }] = await Promise.all([
      supabase
        .from('topic_candidates')
        .select('*')
        .eq('status', 'active')
        .limit(2500),
      supabase
        .from('sources')
        .select('id,name'),
      supabase
        .from('raw_feed_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25000)
    ]);

    if (itemsError) return json(res, 500, { error: itemsError.message });
    if (sourcesError) return json(res, 500, { error: sourcesError.message });
    if (rawItemsError) return json(res, 500, { error: rawItemsError.message });

    const sourceMap = new Map((sources || []).map((source) => [String(source.id), source.name || '']));
    const rawMap = new Map((rawItems || []).map((item) => [String(item.id), item]));

    let enriched = (items || []).map((item) => {
      const raw = rawMap.get(String(item.raw_feed_item_id || '')) || null;
      return {
        ...item,
        source_name: item.source_name || sourceMap.get(String(item.source_id)) || sourceMap.get(String(raw?.source_id || '')) || '',
        published_at: item.published_at || raw?.published_at || item.created_at || item.updated_at || null,
        image_url: item.image_url || raw?.image_url || null,
        url: item.url || item.canonical_url || raw?.url || raw?.link || item.source_url || ''
      };
    })
      .filter((item) => !isHardNoise(item))
      .filter((item) => !isTrendFeedItem(item));

    if (discoverMode) {
      const candidateItems = enriched
        .filter((item) => isFreshForDiscover(item, 24))
        .map(withDiscoverScore);

      const rawFallback = (rawItems || [])
        .map((item) => normalizeRawItem(item, sourceMap))
        .filter((item) => isFreshForDiscover(item, 24))
        .filter((item) => !isHardNoise(item))
        .filter((item) => !isTrendFeedItem(item))
        .filter(hasTechSignal)
        .map(withDiscoverScore)
        .map((item) => ({ ...item, from_raw_feed_fallback: true }));

      enriched = dedupeItems([...candidateItems, ...rawFallback]);
    } else {
      enriched = enriched.map(withDiscoverScore);
    }

    enriched.sort((a, b) => compareItems(a, b, sortKey));

    return json(res, 200, {
      items: enriched.slice(0, 500),
      filters: discoverMode
        ? { sort: sortKey, max_age_hours: 24, min_radar_discover_score: 0, includes_raw_feed_fallback: true, candidate_count: enriched.length }
        : { sort: sortKey }
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
