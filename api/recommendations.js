import { getSupabaseAdmin, json, queryLocal } from './_lib.js';
import opportunityRadar from './opportunity-radar.js';
import { loadIntelligenceModel, modelInfluence, predictWithModel, primaryTopicKey, savePredictions } from './_intelligence-model.js';

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

const BRAND_PATTERNS = [
  ['Samsung', /\bsamsung\b|\bgalaxy\b|\bone\s*ui\b/i],
  ['Apple', /\bapple\b|\biphone\b|\bipad\b|\bmacbook\b|\bmacos\b|\bvision\s*pro\b/i],
  ['Google', /\bgoogle\b|\bandroid\b|\bpixel\b|\bgemini\b|\bchrome\b|\byoutube\b/i],
  ['OpenAI', /\bopenai\b|\bchatgpt\b|\bsora\b/i],
  ['Microsoft', /\bmicrosoft\b|\bwindows\b|\bcopilot\b|\bxbox\b/i],
  ['Xiaomi', /\bxiaomi\b|\bredmi\b|\bpoco\b|\bhyperos\b/i],
  ['Huawei', /\bhuawei\b|\bharmonyos\b|\bmately\b/i],
  ['Honor', /\bhonor\b|\bmagic\s*[0-9a-z]+\b/i],
  ['OPPO / OnePlus', /\boppo\b|\boneplus\b|\bcoloros\b|\boxygenos\b/i],
  ['vivo', /\bvivo\b|\biqoo\b/i],
  ['Meta', /\bmeta\b|\bwhatsapp\b|\binstagram\b|\bfacebook\b|\bthreads\b/i],
  ['NVIDIA', /\bnvidia\b|\bgeforce\b|\brtx\b/i],
  ['AMD', /\bamd\b|\bryzen\b|\bradeon\b/i],
  ['Intel', /\bintel\b|\bcore\s*ultra\b/i],
  ['Qualcomm', /\bqualcomm\b|\bsnapdragon\b/i],
  ['Garmin', /\bgarmin\b/i],
  ['Sony', /\bsony\b|\bplaystation\b|\bxperia\b/i],
  ['Nintendo', /\bnintendo\b|\bswitch\b/i],
  ['Amazon', /\bamazon\b|\balexa\b|\bkindle\b/i],
  ['Tesla', /\btesla\b/i],
  ['SpaceX', /\bspacex\b|\bstarlink\b/i],
  ['Nothing', /\bnothing\b|\bcmf\b/i],
  ['DJI', /\bdji\b/i],
  ['Adobe', /\badobe\b|\bphotoshop\b/i],
  ['Lenovo / Motorola', /\blenovo\b|\bmotorola\b|\bmoto\b/i],
  ['ASUS', /\basus\b|\brog\b|\bzenfone\b/i]
];

const PERFORMANCE_STOP_WORDS = new Set('haber haberi yeni son için ile bir bu şu daha olan olarak teknoloji teknolojik özellik özellikleri modeli model update güncelleme duyurdu tanıttı çıktı yayınlandı geliyor başladı şimdi today latest launch launches launched announces announced gets getting will from with that this the and'.split(' '));

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

function performanceTokens(value = '') {
  return new Set(String(value || '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü\s]/gi, ' ').split(/\s+/)
    .filter((word) => word.length >= 3 && !PERFORMANCE_STOP_WORDS.has(word)));
}

function tokenSimilarity(leftValue = '', rightValue = '') {
  const left = leftValue instanceof Set ? leftValue : performanceTokens(leftValue);
  const right = rightValue instanceof Set ? rightValue : performanceTokens(rightValue);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common += 1;
  return common / Math.max(2, Math.min(left.size, right.size));
}

export function buildPerformanceProfiles(rows = []) {
  const prepared = rows.map((row) => ({
    ...row,
    words: performanceTokens(row.title),
    discoverRaw: Math.log1p(Number(row.discover_clicks || 0)) * 14 + Math.log1p(Number(row.discover_impressions || 0)) * 6 + Math.min(0.35, Number(row.discover_ctr || 0)) * 100,
    trafficRaw: Math.log1p(Number(row.ga4_views || 0)) * 15 + Math.log1p(Number(row.ga4_active_users || 0)) * 8 + Math.min(1, Number(row.ga4_engagement_rate || 0)) * 15
  })).filter((row) => row.title && row.words.size);
  const discoverMax = Math.max(1, ...prepared.map((row) => row.discoverRaw));
  const trafficMax = Math.max(1, ...prepared.map((row) => row.trafficRaw));
  return prepared.map((row) => ({
    title: row.title,
    words: row.words,
    discover_strength: clampScore(row.discoverRaw / discoverMax * 100),
    traffic_strength: clampScore(row.trafficRaw / trafficMax * 100)
  })).filter((row) => row.discover_strength >= 25 || row.traffic_strength >= 25);
}

export function performanceAffinity(item = {}, profiles = []) {
  const words = performanceTokens(`${item.title || ''} ${item.summary || item.description || item.excerpt || ''}`);
  let discover = 0; let traffic = 0; let match = '';
  for (const profile of profiles) {
    const similarity = tokenSimilarity(words, profile.words);
    if (similarity < .24) continue;
    const discoverValue = similarity * Number(profile.discover_strength || 0);
    const trafficValue = similarity * Number(profile.traffic_strength || 0);
    if (discoverValue > discover) { discover = discoverValue; match = profile.title; }
    traffic = Math.max(traffic, trafficValue);
  }
  return { discover: clampScore(discover), traffic: clampScore(traffic), match };
}

function percentileDiscoverScore(percentile) {
  const value = Math.max(0, Math.min(1, Number(percentile) || 0));
  if (value < .02) return Math.round(96 - value / .02 * 6);
  if (value < .10) return Math.round(89 - (value - .02) / .08 * 7);
  if (value < .25) return Math.round(81 - (value - .10) / .15 * 6);
  if (value < .50) return Math.round(74 - (value - .25) / .25 * 9);
  return Math.round(64 - (value - .50) / .50 * 29);
}

export function calibrateDiscoverScores(items = []) {
  const eligible = items.filter((item) => ageHours(item) <= 24 && !isHardNoise(item));
  if (!eligible.length) return items;
  const ranked = eligible.slice().sort((a, b) => {
    const scoreDiff = scoreValue(b, 'discover_score') - scoreValue(a, 'discover_score');
    if (scoreDiff) return scoreDiff;
    const probabilityDiff = scoreValue(b, 'discover_probability') - scoreValue(a, 'discover_probability');
    if (probabilityDiff) return probabilityDiff;
    const affinityDiff = scoreValue(b, 'published_discover_affinity') - scoreValue(a, 'published_discover_affinity');
    if (affinityDiff) return affinityDiff;
    return timeValue(b.published_at || b.created_at) - timeValue(a.published_at || a.created_at);
  });
  const calibration = new Map();
  ranked.forEach((item, index) => {
    const percentile = (index + .5) / ranked.length;
    calibration.set(item, { score: percentileDiscoverScore(percentile), percentile });
  });
  return items.map((item) => {
    const calibrated = calibration.get(item);
    if (!calibrated) return item;
    const original = scoreValue(item, 'discover_score');
    return {
      ...item,
      precalibrated_discover_score: original,
      discover_percentile: Math.max(1, Math.round((1 - calibrated.percentile) * 100)),
      radar_discover_score: calibrated.score,
      discover_score: calibrated.score,
      score_reasons: [
        ...(item.score_reasons || []),
        { signal: 'discover_percentile_calibration', impact: calibrated.score - original, label: `Son 24 saatlik aday havuzunda ilk %${Math.max(1, Math.round(calibrated.percentile * 100))}` }
      ]
    };
  });
}

function brandName(item = {}) {
  const title = String(item.title || '').toLocaleLowerCase('tr-TR');
  const context = [item.summary, item.excerpt, item.description].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
  for (const [name, pattern] of BRAND_PATTERNS) if (pattern.test(title)) return name;
  for (const [name, pattern] of BRAND_PATTERNS) if (pattern.test(context)) return name;
  return 'Diğer teknoloji';
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

function withRadarScores(item = {}, learnedTerms = new Map(), performanceProfiles = [], modelRow = null) {
  const originalScores = {
    original_discover_score: scoreValue(item, 'discover_score'),
    original_traffic_score: scoreValue(item, 'traffic_score'),
    original_editorial_score: scoreValue(item, 'editorial_score'),
    original_conversion_score: scoreValue(item, 'conversion_score'),
    original_social_score: scoreValue(item, 'social_score'),
    original_total_score: scoreValue(item, 'total_score')
  };
  const learningBoost = learnedPerformanceBoost(item, learnedTerms);
  const affinity = performanceAffinity(item, performanceProfiles);
  const computedDiscover = computedDiscoverScore(item);
  const heuristicDiscover = clampScore(performanceProfiles.length
    ? computedDiscover * .84 + affinity.discover * .16 + Math.min(4, learningBoost)
    : computedDiscover + learningBoost);
  const heuristicEditorial = computedEditorialScore(item, heuristicDiscover);
  const prediction = predictWithModel(item, modelRow, { discover: heuristicDiscover, editorial: heuristicEditorial, news: heuristicEditorial });
  const discoverWeight = modelRow ? modelInfluence(modelRow, 'discover', .45) : 0;
  const newsWeight = modelRow ? modelInfluence(modelRow, 'news', .28) : 0;
  const editorialWeight = prediction.editorial_probability != null ? Math.min(.2, modelInfluence(modelRow, 'editorial', 0)) : 0;
  const discover = clampScore(heuristicDiscover * (1 - discoverWeight) + prediction.discover_probability * discoverWeight);
  const computedTraffic = computedTrafficScore(item, discover);
  const traffic = clampScore(performanceProfiles.length ? computedTraffic * .88 + affinity.traffic * .12 : computedTraffic);
  const editorialBase = computedEditorialScore(item, discover);
  const editorial = clampScore(
    editorialBase * Math.max(0, 1 - newsWeight - editorialWeight) +
    prediction.news_probability * newsWeight +
    Number(prediction.editorial_probability || editorialBase) * editorialWeight
  );
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
  if (affinity.discover >= 35) reasons.push({ signal: 'published_discover_affinity', impact: Math.round(affinity.discover * .16), label: `Teknoblog’da iyi Discover performansı gösteren benzer konu: ${affinity.match}` });
  if (affinity.traffic >= 35) reasons.push({ signal: 'published_traffic_affinity', impact: Math.round(affinity.traffic * .12), label: 'Teknoblog’da yüksek trafik alan konu geçmişiyle uyumlu' });
  for (const reason of prediction.reasons.slice(0, 3)) reasons.push({ signal: `intelligence_${reason.channel}`, impact: reason.impact, label: `${reason.channel === 'discover' ? 'Discover' : 'Google News'} geçmişi: ${reason.label}` });
  if (isHardNoise(item)) reasons.push({ signal: 'noise', impact: -40, label: 'Gürültü filtresi riski' });
  return {
    ...item,
    brand_name: brandName(item),
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
    published_discover_affinity: affinity.discover,
    published_traffic_affinity: affinity.traffic,
    published_performance_match: affinity.match || null,
    intelligence_model_version: prediction.model_version,
    discover_probability: prediction.discover_probability,
    news_probability: prediction.news_probability,
    editorial_probability: prediction.editorial_probability,
    intelligence_confidence: prediction.confidence,
    expected_clicks_low: prediction.expected_clicks_low,
    expected_clicks_high: prediction.expected_clicks_high,
    intelligence_reasons: prediction.reasons,
    intelligence_features: prediction.features,
    intelligence_weights: { discover: discoverWeight, news: newsWeight, editorial: editorialWeight },
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

export function compareItems(a, b, sortKey) {
  if (sortKey === 'published_at' || sortKey === 'updated_at') return adjustedScore(b, sortKey) - adjustedScore(a, sortKey);
  const diff = adjustedScore(b, sortKey) - adjustedScore(a, sortKey);
  if (diff) return diff;
  if (sortKey === 'discover_score') {
    const rawDiff = scoreValue(b, 'precalibrated_discover_score') - scoreValue(a, 'precalibrated_discover_score');
    if (rawDiff) return rawDiff;
    const probabilityDiff = scoreValue(b, 'discover_probability') - scoreValue(a, 'discover_probability');
    if (probabilityDiff) return probabilityDiff;
    const affinityDiff = scoreValue(b, 'published_discover_affinity') - scoreValue(a, 'published_discover_affinity');
    if (affinityDiff) return affinityDiff;
  }
  return timeValue(b?.published_at || b?.updated_at || b?.created_at) - timeValue(a?.published_at || a?.updated_at || a?.created_at);
}

function diversifyItems(items = [], sortKey = 'published_at') {
  if (sortKey === 'published_at' || sortKey === 'updated_at' || items.length < 4) return items;
  const remaining = items.slice();
  const selected = [];
  const sourceCounts = new Map();
  const topicCounts = new Map();
  const brandCounts = new Map();
  const target = Math.min(120, remaining.length);
  while (selected.length < target && remaining.length) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < Math.min(100, remaining.length); index += 1) {
      const item = remaining[index];
      const source = String(item.source_name || 'unknown').toLocaleLowerCase('tr-TR');
      const topic = primaryTopicKey(item);
      const brand = item.brand_name || brandName(item);
      const sourcePenalty = Math.max(0, (sourceCounts.get(source) || 0) - 1) * 5;
      const topicPenalty = Math.max(0, (topicCounts.get(topic) || 0) - 2) * 4;
      const brandCount = brandCounts.get(brand) || 0;
      const brandPenalty = brand === 'Diğer teknoloji' ? Math.max(0, brandCount - 3) * 3
        : brandCount === 0 ? 0 : brandCount === 1 ? 2 : 11 + (brandCount - 2) * 8;
      const value = adjustedScore(item, sortKey) - sourcePenalty - topicPenalty - brandPenalty - index * .015;
      if (value > bestValue) { bestValue = value; bestIndex = index; }
    }
    const [picked] = remaining.splice(bestIndex, 1);
    const source = String(picked.source_name || 'unknown').toLocaleLowerCase('tr-TR');
    const topic = primaryTopicKey(picked);
    const brand = picked.brand_name || brandName(picked);
    picked.diversity_rank = selected.length + 1;
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
    selected.push(picked);
  }
  return [...selected, ...remaining];
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
    const sort = req.query?.sort || 'discover_score';
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
    let performanceProfiles = [];
    let intelligenceModel = null;
    try {
      const learned = await queryLocal(`SELECT title,discover_clicks,discover_impressions,discover_ctr,ga4_views,ga4_active_users,ga4_engagement_seconds,ga4_engagement_rate FROM published_performance
        WHERE title IS NOT NULL AND title<>'' AND published_at>=NOW()-INTERVAL '365 days' AND (discover_impressions>0 OR ga4_views>0)
        ORDER BY (discover_clicks*12 + LN(1+discover_impressions)*8 + LN(1+ga4_views)*10 + LN(1+ga4_active_users)*6) DESC, observed_at DESC LIMIT 800`);
      performanceProfiles = buildPerformanceProfiles(learned.rows);
      for (const row of learned.rows) {
        const searchWeight = Math.log1p(Number(row.discover_impressions || 0)) / 3 + Number(row.discover_ctr || 0) * 8 + Math.log1p(Number(row.discover_clicks || 0)) / 2;
        const audienceWeight = Math.log1p(Number(row.ga4_views || 0)) / 4 + Math.log1p(Number(row.ga4_active_users || 0)) / 5
          + Math.log1p(Number(row.ga4_engagement_seconds || 0)) / 9 + Number(row.ga4_engagement_rate || 0) * 2;
        const weight = Math.min(3, searchWeight * .7 + audienceWeight * .3);
        for (const word of [...new Set(String(row.title).toLowerCase().replace(/[^a-z0-9çğıöşü\s]/gi, ' ').split(/\s+/).filter((item) => item.length >= 4))]) {
          learnedTerms.set(word, Math.max(learnedTerms.get(word) || 0, weight));
        }
      }
    } catch {}
    try { intelligenceModel = await loadIntelligenceModel(); } catch {}

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

    let enriched = dedupeItems([...candidateItems, ...rawFallback]).map((item) => withRadarScores(item, learnedTerms, performanceProfiles, intelligenceModel));
    enriched = calibrateDiscoverScores(enriched);

    if (discoverMode) {
      enriched = enriched.filter((item) => ageHours(item) <= 24);
    }

    enriched.sort((a, b) => compareItems(a, b, sortKey));
    const diversitySetting = String(req.query?.diversify || '');
    const diversityApplied = diversitySetting === '1';
    if (diversityApplied) enriched = diversifyItems(enriched, sortKey);
    if (intelligenceModel) {
      try { await savePredictions(enriched, intelligenceModel.model_version); } catch {}
    }

    return json(res, 200, {
      items: enriched.slice(0, 500),
      filters: {
        sort: sortKey,
        includes_raw_feed_fallback: true,
        candidate_error: candidateError?.message || null,
        candidate_count: candidateItems.length,
        raw_fallback_count: rawFallback.length,
        returned_count: Math.min(enriched.length, 500),
        diversity_applied: diversityApplied,
        diversity_mode: diversityApplied ? 'source_topic_brand_balanced' : 'strict_score',
        scoring_model: intelligenceModel ? 'intelligence_v1' : 'calibrated_v2',
        intelligence_model_version: intelligenceModel?.model_version || null,
        intelligence_sample_count: intelligenceModel?.sample_count || 0,
        intelligence_weights: intelligenceModel ? {
          discover: modelInfluence(intelligenceModel, 'discover', .45),
          news: modelInfluence(intelligenceModel, 'news', .28),
          editorial: modelInfluence(intelligenceModel, 'editorial', 0)
        } : null,
        performance_learning_terms: learnedTerms.size,
        published_performance_profiles: performanceProfiles.length,
        normalized_scores: ['total_score', 'traffic_score', 'conversion_score', 'discover_score', 'social_score', 'editorial_score']
      }
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
