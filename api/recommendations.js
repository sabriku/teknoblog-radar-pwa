import { getSupabaseAdmin, json, queryLocal } from './_lib.js';
import opportunityRadar from './opportunity-radar.js';

const HARD_NOISE_PATTERNS = [
  /hull\s*city/i, /polonya/i, /voleybol/i, /futbol/i, /basketbol/i, /\bkupa\b/i,
  /hangi\s*kanalda/i, /canli\s*izle|canlı\s*izle/i, /\bmac[iı]\b/i, /\bmaç[ıi]?\b/i,
  /\bspor\b/i, /premier\s*league/i, /championship/i, /galatasaray/i, /fenerbahçe/i,
  /besiktas|beşiktaş/i, /trabzonspor/i, /transfer/i, /deprem/i, /hava\s*durumu/i,
  /burç/i, /kimdir/i, /dizi/i, /magazin/i
];

const TECH_PATTERNS = [
  /google|android|iphone|ios|ipad|macbook|macos|windows|samsung|galaxy|xiaomi|huawei|oppo|vivo|honor|pixel/i,
  /openai|chatgpt|gemini|claude|copilot|yapay\s*zeka|\bai\b/i,
  /telefon|akıllı\s*telefon|tablet|laptop|dizüstü|gpu|cpu|nvidia|amd|intel|snapdragon|mediatek|çip|chip|işlemci/i,
  /watch|wear\s*os|akıllı\s*saat|app\s*store|play\s*store|whatsapp|instagram|youtube|chrome|telegram|tiktok/i,
  /microsoft|apple|meta|xbox|playstation|steam|güvenlik|siber|veri|uygulama|yazılım|robot|oyun/i
];

const DISCOVER_PATTERNS = [
  /yapay\s*zeka|openai|chatgpt|gemini|claude|copilot/i,
  /google|android|chrome|youtube|whatsapp|instagram|meta/i,
  /apple|iphone|ios|ipad|macbook|vision\s*pro/i,
  /samsung|galaxy|one\s*ui|xiaomi|huawei|honor|oppo|vivo|pixel/i,
  /windows|microsoft|nvidia|amd|intel|snapdragon|mediatek/i,
  /güvenlik|siber|veri\s*sızıntısı|hack|açık/i,
  /güncelleme|beta|özellik|sızıntı|iddia|rapor|tanıttı|duyurdu|fiyat|indirim/i
];

const TRAFFIC_PATTERNS = [
  /iphone|samsung|galaxy|xiaomi|huawei|android|ios|windows|whatsapp|instagram|youtube|google|openai|chatgpt|gemini/i,
  /güncelleme|hangi modeller|alacak|fiyat|indirim|kampanya|özellik|nasıl|ne zaman/i
];

const CONVERSION_PATTERNS = [
  /fiyat|indirim|kampanya|satış|sipariş|ön sipariş|stok|tl|amazon|hepsiburada|teknosa|mediamarkt|n11/i,
  /telefon|tablet|laptop|kulaklık|akıllı saat|tv|ssd|monitör|oyun konsolu|playstation|xbox/i
];

const SOCIAL_PATTERNS = [
  /whatsapp|instagram|youtube|tiktok|x |twitter|openai|chatgpt|iphone|apple|samsung|google|gemini/i,
  /yasak|tepki|iddia|sızıntı|gündem|viral|kapatma|özellik|değişiklik|kriz/i
];

function scoreValue(item, key) {
  const value = Number(item?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
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

function hasTechSignal(item = {}) {
  const text = textOf(item);
  return TECH_PATTERNS.some((pattern) => pattern.test(text));
}

function isHardNoise(item = {}) {
  const text = textOf(item);
  if (!text.trim()) return false;
  const noisy = HARD_NOISE_PATTERNS.some((pattern) => pattern.test(text));
  return noisy && !hasTechSignal(item);
}

function isTrendFeedItem(item = {}) {
  const text = textOf(item);
  return /google\s*trends|trend\s*feed|tr\s*4s\s*teknoloji|tr\s*24s\s*teknoloji|tr\s*48s\s*teknoloji|tr\s*168s\s*teknoloji/i.test(text);
}

function ageHours(item = {}) {
  const published = timeValue(item.published_at || item.updated_at || item.created_at);
  if (!published) return 999999;
  return Math.max(0, (Date.now() - published) / 3600000);
}

function freshnessScore(item = {}) {
  const hours = ageHours(item);
  if (hours <= 2) return 100;
  if (hours <= 6) return 92;
  if (hours <= 12) return 82;
  if (hours <= 24) return 70;
  if (hours <= 36) return 50;
  if (hours <= 48) return 35;
  if (hours <= 72) return 20;
  if (hours <= 168) return 8;
  return 0;
}

function titleQualityScore(item = {}) {
  const title = String(item.title || '').trim();
  const text = textOf(item);
  let value = 0;
  if (title.length >= 28 && title.length <= 140) value += 10;
  if (DISCOVER_PATTERNS.some((pattern) => pattern.test(text))) value += 24;
  if (/nasıl|neden|hangi|ne zaman|liste|alacak|geliyor|değişiyor|artıyor|düşüyor|başladı|yayınlandı|sundu|tanıttı|duyurdu/i.test(title)) value += 10;
  if (/son dakika|canlı|maç|hangi kanalda|kimdir|burç|deprem/i.test(text) && !hasTechSignal(item)) value -= 35;
  if (item.image_url || item.image || item.thumbnail) value += 6;
  if (item.summary || item.excerpt || item.description) value += 5;
  return value;
}

function patternScore(item = {}, patterns = [], weight = 24) {
  const text = textOf(item);
  return patterns.some((pattern) => pattern.test(text)) ? weight : 0;
}

function rawOrDefault(item = {}, key, fallback) {
  const raw = scoreValue(item, key);
  return raw > 0 ? raw : fallback;
}

function normalizedTitleQuality(item = {}) {
  return clampScore((Math.max(0, titleQualityScore(item)) / 55) * 100);
}

function binarySignal(item = {}, patterns = [], low = 20) {
  return patternScore(item, patterns, 100) || low;
}

function computedDiscoverScore(item = {}) {
  const raw = rawOrDefault(item, 'discover_score', 34);
  const freshness = freshnessScore(item);
  const titleQuality = normalizedTitleQuality(item);
  const discoverIntent = binarySignal(item, DISCOVER_PATTERNS, 22);
  const techRelevance = hasTechSignal(item) ? 88 : 32;
  return clampScore(
    raw * 0.38 +
    freshness * 0.24 +
    titleQuality * 0.18 +
    discoverIntent * 0.12 +
    techRelevance * 0.08
  );
}

function computedTrafficScore(item = {}, discover = computedDiscoverScore(item)) {
  const raw = rawOrDefault(item, 'traffic_score', 38);
  const trafficIntent = binarySignal(item, TRAFFIC_PATTERNS, 24);
  const techRelevance = hasTechSignal(item) ? 88 : 32;
  return clampScore(
    raw * 0.42 +
    trafficIntent * 0.23 +
    discover * 0.15 +
    freshnessScore(item) * 0.12 +
    techRelevance * 0.08
  );
}

function computedEditorialScore(item = {}, discover = computedDiscoverScore(item)) {
  const raw = rawOrDefault(item, 'editorial_score', 36);
  const techRelevance = hasTechSignal(item) ? 90 : 28;
  return clampScore(
    raw * 0.45 +
    discover * 0.15 +
    normalizedTitleQuality(item) * 0.16 +
    techRelevance * 0.16 +
    freshnessScore(item) * 0.08
  );
}

function computedConversionScore(item = {}, discover = computedDiscoverScore(item), traffic = computedTrafficScore(item, discover)) {
  const raw = rawOrDefault(item, 'conversion_score', 24);
  const commercialIntent = binarySignal(item, CONVERSION_PATTERNS, 12);
  return clampScore(
    raw * 0.48 +
    commercialIntent * 0.28 +
    traffic * 0.10 +
    discover * 0.05 +
    freshnessScore(item) * 0.09
  );
}

function computedSocialScore(item = {}, discover = computedDiscoverScore(item)) {
  const raw = rawOrDefault(item, 'social_score', 26);
  const socialIntent = binarySignal(item, SOCIAL_PATTERNS, 18);
  return clampScore(
    raw * 0.46 +
    socialIntent * 0.25 +
    discover * 0.15 +
    freshnessScore(item) * 0.14
  );
}

function computedTotalScore(item = {}, scores = {}) {
  const discover = scores.discover ?? computedDiscoverScore(item);
  const traffic = scores.traffic ?? computedTrafficScore(item, discover);
  const editorial = scores.editorial ?? computedEditorialScore(item, discover);
  const conversion = scores.conversion ?? computedConversionScore(item, discover, traffic);
  const social = scores.social ?? computedSocialScore(item, discover);
  return clampScore(
    discover * 0.27 +
    traffic * 0.25 +
    editorial * 0.22 +
    conversion * 0.13 +
    social * 0.13
  );
}

function learnedPerformanceBoost(item = {}, learnedTerms = new Map()) {
  if (!learnedTerms.size) return 0;
  const words = [...new Set(textOf(item).replace(/[^a-z0-9çğıöşü\s]/gi, ' ').split(/\s+/).filter((word) => word.length >= 4))];
  return Math.min(8, Math.round(words.sort((a, b) => (learnedTerms.get(b) || 0) - (learnedTerms.get(a) || 0)).slice(0, 3).reduce((sum, word) => sum + (learnedTerms.get(word) || 0), 0)));
}

function withRadarScores(item = {}, learnedTerms = new Map()) {
  const originalScores = {
    original_discover_score: scoreValue(item, 'discover_score'),
    original_traffic_score: scoreValue(item, 'traffic_score'),
    original_editorial_score: scoreValue(item, 'editorial_score'),
    original_conversion_score: scoreValue(item, 'conversion_score'),
    original_social_score: scoreValue(item, 'social_score'),
    original_total_score: scoreValue(item, 'total_score')
  };
  const learningBoost = learnedPerformanceBoost(item, learnedTerms);
  const discover = clampScore(computedDiscoverScore(item) + learningBoost);
  const traffic = computedTrafficScore(item, discover);
  const editorial = computedEditorialScore(item, discover);
  const conversion = computedConversionScore(item, discover, traffic);
  const social = computedSocialScore(item, discover);
  const total = computedTotalScore(item, { discover, traffic, editorial, conversion, social });
  const confidence = clampScore(
    34 +
    (item.source_name ? 12 : 0) +
    (item.published_at ? 14 : 0) +
    (item.summary || item.description || item.excerpt ? 14 : 0) +
    (item.image_url || item.image || item.thumbnail ? 12 : 0) +
    (hasTechSignal(item) ? 10 : 0)
  );
  const reasons = [];
  const hours = ageHours(item);
  if (hours <= 3) reasons.push({ signal: 'freshness', impact: 18, label: 'Son 3 saat içinde yayımlandı' });
  else if (hours <= 12) reasons.push({ signal: 'freshness', impact: 12, label: 'Gün içi taze haber' });
  else if (hours <= 24) reasons.push({ signal: 'freshness', impact: 7, label: 'Son 24 saat içinde yayımlandı' });
  if (hasTechSignal(item)) reasons.push({ signal: 'tech_relevance', impact: 10, label: 'Teknoblog teknoloji odağıyla uyumlu' });
  if (DISCOVER_PATTERNS.some((pattern) => pattern.test(textOf(item)))) reasons.push({ signal: 'discover_intent', impact: 12, label: 'Discover ilgisi taşıyan konu veya marka sinyali' });
  if (TRAFFIC_PATTERNS.some((pattern) => pattern.test(textOf(item)))) reasons.push({ signal: 'search_intent', impact: 10, label: 'Arama ve trafik niyeti mevcut' });
  if (item.image_url || item.image || item.thumbnail) reasons.push({ signal: 'image', impact: 6, label: 'Haber görseli mevcut' });
  if (learningBoost > 0) reasons.push({ signal: 'performance_learning', impact: learningBoost, label: 'Geçmiş Teknoblog Discover performansından öğrenilen konu sinyali' });
  if (isHardNoise(item)) reasons.push({ signal: 'noise', impact: -40, label: 'Gürültü filtresi riski' });
  return {
    ...item,
    ...originalScores,
    radar_discover_score: discover,
    radar_traffic_score: traffic,
    radar_editorial_score: editorial,
    radar_conversion_score: conversion,
    radar_social_score: social,
    radar_total_score: total,
    score_confidence: confidence,
    score_reasons: reasons,
    performance_learning_boost: learningBoost,
    discover_score: discover,
    traffic_score: traffic,
    editorial_score: editorial,
    conversion_score: conversion,
    social_score: social,
    total_score: total
  };
}

function normalizeCandidate(item = {}, sourceMap = new Map(), rawMap = new Map()) {
  const raw = rawMap.get(String(item.raw_feed_item_id || '')) || null;
  return {
    ...item,
    title: item.title || item.item_title || item.feed_title || raw?.title || raw?.item_title || raw?.feed_title || '',
    summary: item.summary || item.description || item.excerpt || raw?.summary || raw?.description || raw?.excerpt || '',
    url: item.url || item.canonical_url || item.link || raw?.url || raw?.link || item.source_url || '',
    source_name: item.source_name || sourceMap.get(String(item.source_id)) || sourceMap.get(String(raw?.source_id || '')) || raw?.source_name || '',
    published_at: item.published_at || raw?.published_at || item.created_at || item.updated_at || null,
    image_url: item.image_url || raw?.image_url || raw?.thumbnail || raw?.image || null
  };
}

function normalizeRawItem(item = {}, sourceMap = new Map()) {
  return {
    ...item,
    title: item.title || item.item_title || item.feed_title || item.name || '',
    summary: item.summary || item.description || item.excerpt || '',
    url: item.url || item.link || item.canonical_url || item.guid || '',
    source_name: item.source_name || sourceMap.get(String(item.source_id)) || '',
    published_at: item.published_at || item.created_at || item.updated_at || null,
    image_url: item.image_url || item.thumbnail || item.image || null,
    from_raw_feed_fallback: true
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

function adjustedScore(item, sortKey) {
  if (sortKey === 'published_at' || sortKey === 'updated_at') return timeValue(item?.published_at || item?.updated_at || item?.created_at);
  return scoreValue(item, sortKey);
}

function compareItems(a, b, sortKey) {
  if (sortKey === 'published_at' || sortKey === 'updated_at') return adjustedScore(b, sortKey) - adjustedScore(a, sortKey);
  const diff = adjustedScore(b, sortKey) - adjustedScore(a, sortKey);
  if (diff) return diff;
  return timeValue(b?.published_at || b?.updated_at || b?.created_at) - timeValue(a?.published_at || a?.updated_at || a?.created_at);
}

async function safeSelect(builder) {
  const result = await builder;
  if (result.error) return { data: [], error: result.error };
  return { data: result.data || [], error: null };
}

export default async function handler(req, res) {
  try {
    if (String(req.query?.opportunity || '') === '1') return await opportunityRadar(req, res);

    const supabase = getSupabaseAdmin();
    const sort = req.query?.sort || 'published_at';
    const allowedSorts = ['total_score', 'traffic_score', 'conversion_score', 'discover_score', 'social_score', 'editorial_score', 'updated_at', 'published_at'];
    const sortKey = allowedSorts.includes(sort) ? sort : 'published_at';
    const discoverMode = sortKey === 'discover_score';

    const [{ data: candidates, error: candidateError }, { data: sources, error: sourcesError }, { data: rawItems, error: rawError }] = await Promise.all([
      safeSelect(supabase.from('topic_candidates').select('*').eq('status', 'active').limit(2500)),
      safeSelect(supabase.from('sources').select('id,name')),
      safeSelect(supabase.from('raw_feed_items').select('*').order('created_at', { ascending: false }).limit(25000))
    ]);

    if (sourcesError) return json(res, 500, { error: sourcesError.message });
    if (rawError) return json(res, 500, { error: rawError.message });

    const sourceMap = new Map((sources || []).map((source) => [String(source.id), source.name || '']));
    const rawMap = new Map((rawItems || []).map((item) => [String(item.id), item]));
    const learnedTerms = new Map();
    try {
      const learned = await queryLocal(`SELECT title,discover_clicks,discover_impressions,discover_ctr FROM published_performance
        WHERE title IS NOT NULL AND title<>'' AND discover_impressions>0 ORDER BY observed_at DESC LIMIT 300`);
      for (const row of learned.rows) {
        const weight = Math.min(3, Math.log1p(Number(row.discover_impressions || 0)) / 3 + Number(row.discover_ctr || 0) * 8 + Math.log1p(Number(row.discover_clicks || 0)) / 2);
        for (const word of [...new Set(String(row.title).toLowerCase().replace(/[^a-z0-9çğıöşü\s]/gi, ' ').split(/\s+/).filter((item) => item.length >= 4))]) {
          learnedTerms.set(word, Math.max(learnedTerms.get(word) || 0, weight));
        }
      }
    } catch {}

    const candidateItems = (candidates || [])
      .map((item) => normalizeCandidate(item, sourceMap, rawMap))
      .filter((item) => item.title && item.url)
      .filter((item) => !isHardNoise(item))
      .filter((item) => !isTrendFeedItem(item));

    const rawFallback = (rawItems || [])
      .map((item) => normalizeRawItem(item, sourceMap))
      .filter((item) => item.title && item.url)
      .filter((item) => !isHardNoise(item))
      .filter((item) => !isTrendFeedItem(item))
      .filter((item) => hasTechSignal(item) || ageHours(item) <= 48);

    let enriched = dedupeItems([...candidateItems, ...rawFallback]).map((item) => withRadarScores(item, learnedTerms));

    if (discoverMode) {
      enriched = enriched.filter((item) => ageHours(item) <= 24);
    }

    enriched.sort((a, b) => compareItems(a, b, sortKey));

    return json(res, 200, {
      items: enriched.slice(0, 500),
      filters: {
        sort: sortKey,
        includes_raw_feed_fallback: true,
        candidate_error: candidateError?.message || null,
        candidate_count: candidateItems.length,
        raw_fallback_count: rawFallback.length,
        returned_count: Math.min(enriched.length, 500),
        scoring_model: 'calibrated_v2',
        performance_learning_terms: learnedTerms.size,
        normalized_scores: ['total_score', 'traffic_score', 'conversion_score', 'discover_score', 'social_score', 'editorial_score']
      }
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
