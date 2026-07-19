import { queryLocal } from './_lib.js';

const STOP = new Set('acaba ama ancak artık ayrıca aynı başka bazı ben bir biz bu çok da daha de dedi diye en gibi göre hem her hiç için ile ise kadar ki mı mi mu mü nasıl ne neden o olan olarak oldu önce sonra şu ve veya yeni yine zaman the and for from into over after before says report reportedly'.split(' '));
const ENTITY_GROUPS = {
  apple: /apple|iphone|ipad|macbook|macos|ios|vision pro/i,
  google: /google|android|pixel|gemini|chrome|youtube|wear os/i,
  samsung: /samsung|galaxy|one ui/i,
  ai: /yapay zeka|artificial intelligence|openai|chatgpt|gemini|claude|copilot/i,
  microsoft: /microsoft|windows|xbox|copilot/i,
  social: /whatsapp|instagram|facebook|meta|tiktok|youtube|telegram/i,
  chip: /nvidia|amd|intel|qualcomm|snapdragon|mediatek|işlemci|çip|chip|gpu|cpu/i,
  china_mobile: /xiaomi|huawei|honor|oppo|vivo|oneplus/i,
  security: /güvenlik|siber|hack|veri sızıntısı|açık|malware|zararlı/i,
  gaming: /playstation|xbox|nintendo|steam|oyun/i
};
const TYPE_GROUPS = {
  update: /güncelleme|update|beta|sürüm|yaması|patch|hangi modeller|alacak/i,
  launch: /tanıttı|duyurdu|açıkladı|yayınladı|piyasaya çıktı|launch|unveil|introduc/i,
  leak: /sızıntı|iddia|ortaya çıktı|görüntülendi|leak|rumor|reportedly/i,
  price: /fiyat|indirim|kampanya|zam|satış|ön sipariş|stok|\btl\b/i,
  guide: /nasıl|rehber|hangi|liste|karşılaştırma|en iyi/i,
  regulation: /yasak|ceza|dava|düzenleme|regülasyon|mahkeme/i
};
const POSITIVE_DECISIONS = new Set(['approved', 'writing', 'published', 'instagram', 'write', 'yazılacak', 'yazıldı', 'useful']);
const NEGATIVE_DECISIONS = new Set(['skipped', 'skip', 'geç', 'rejected', 'duplicate', 'unreliable']);

function clean(value = '') { return String(value).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü\s]/gi, ' ').replace(/\s+/g, ' ').trim(); }
function sigmoid(value) { return 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, value)))); }
function logit(value) { const p = Math.max(.02, Math.min(.98, Number(value) || .02)); return Math.log(p / (1 - p)); }
function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }

export function extractIntelligenceFeatures(item = {}) {
  const title = clean(item.title || '');
  const body = clean([item.title, item.summary, item.excerpt, item.description].filter(Boolean).join(' '));
  const features = [];
  const labels = {};
  const entities = [];
  const types = [];
  for (const [key, pattern] of Object.entries(ENTITY_GROUPS)) if (pattern.test(body)) { features.push(`entity:${key}`); labels[`entity:${key}`] = key; entities.push(key); }
  for (const [key, pattern] of Object.entries(TYPE_GROUPS)) if (pattern.test(body)) { features.push(`type:${key}`); labels[`type:${key}`] = key; types.push(key); }
  for (const entity of entities.slice(0, 3)) for (const type of types.slice(0, 2)) { features.push(`topic:${entity}+${type}`); labels[`topic:${entity}+${type}`] = `${entity} · ${type}`; }
  if (item.image_url || item.image || item.thumbnail) { features.push('quality:image'); labels['quality:image'] = 'görsel var'; }
  const sourceKey = clean(item.source_name || '').replace(/\s+/g, '_').slice(0, 40);
  if (sourceKey) { features.push(`source:${sourceKey}`); labels[`source:${sourceKey}`] = item.source_name; }
  const published = item.published_at ? new Date(item.published_at) : null;
  if (published && Number.isFinite(published.getTime())) {
    const hour = published.getUTCHours();
    const timeKey = hour < 6 ? 'time:night' : hour < 10 ? 'time:morning' : hour < 15 ? 'time:day' : 'time:evening';
    features.push(timeKey); labels[timeKey] = timeKey.replace('time:', 'yayın zamanı ');
    const dayKey = `weekday:${published.getUTCDay()}`; features.push(dayKey); labels[dayKey] = 'yayın günü';
  }
  const wordCount = title.split(' ').filter(Boolean).length;
  const lengthKey = wordCount <= 6 ? 'format:short_title' : wordCount >= 13 ? 'format:long_title' : 'format:balanced_title';
  features.push(lengthKey); labels[lengthKey] = lengthKey === 'format:balanced_title' ? 'dengeli başlık' : lengthKey === 'format:short_title' ? 'kısa başlık' : 'uzun başlık';
  const terms = [...new Set(title.split(' ').filter((word) => word.length >= 4 && !STOP.has(word) && !/^[0-9]+$/.test(word)))].slice(0, 12);
  for (const term of terms) { features.push(`term:${term}`); labels[`term:${term}`] = term; }
  return { features: [...new Set(features)], labels, entities, types };
}

export function primaryTopicKey(item = {}) {
  const extracted = extractIntelligenceFeatures(item);
  return extracted.features.find((feature) => feature.startsWith('topic:')) || extracted.features.find((feature) => feature.startsWith('entity:')) || extracted.features.find((feature) => feature.startsWith('type:')) || 'topic:general';
}

function buildChannel(samples, positiveKey) {
  const globalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0) || 1;
  const globalPositive = samples.reduce((sum, sample) => sum + (sample[positiveKey] ? sample.weight : 0), 0);
  const globalRate = (globalPositive + 2) / (globalWeight + 4);
  const stats = new Map();
  for (const sample of samples) for (const feature of sample.features) {
    const row = stats.get(feature) || { total: 0, positive: 0 };
    row.total += sample.weight;
    if (sample[positiveKey]) row.positive += sample.weight;
    stats.set(feature, row);
  }
  const features = {};
  for (const [feature, row] of stats) {
    if (row.total < 1.5) continue;
    const rate = (row.positive + globalRate * 4) / (row.total + 4);
    features[feature] = { rate, total: Math.round(row.total * 10) / 10, lift: Math.round((logit(rate) - logit(globalRate)) * 1000) / 1000 };
  }
  return { global_rate: globalRate, features };
}

function channelPrediction(channel, features, heuristic) {
  if (!channel) return { probability: clamp(heuristic) / 100, evidence: [] };
  let value = logit(channel.global_rate);
  const evidence = [];
  for (const feature of features) {
    const stat = channel.features?.[feature];
    if (!stat) continue;
    const strength = Math.min(1, Number(stat.total || 0) / 12);
    const effect = clamp(Number(stat.lift || 0), -1.3, 1.3) * strength;
    evidence.push({ feature, effect, total: stat.total, rate: stat.rate });
  }
  evidence.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  for (const row of evidence.slice(0, 7)) value += row.effect * .55;
  const learned = sigmoid(value);
  return { probability: learned * .72 + (clamp(heuristic) / 100) * .28, evidence: evidence.slice(0, 5) };
}

function metricsAtThreshold(probabilities, threshold) {
  let correct = 0; let tp = 0; let fp = 0; let fn = 0; let tn = 0; let brier = 0;
  for (const row of probabilities) {
    const predicted = row.probability >= threshold;
    if (predicted === row.actual) correct += 1;
    if (predicted && row.actual) tp += 1;
    if (predicted && !row.actual) fp += 1;
    if (!predicted && row.actual) fn += 1;
    if (!predicted && !row.actual) tn += 1;
    brier += (row.probability - (row.actual ? 1 : 0)) ** 2;
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const specificity = tn / Math.max(1, tn + fp);
  const f1 = 2 * precision * recall / Math.max(.0001, precision + recall);
  return { accuracy: correct / Math.max(1, probabilities.length), balancedAccuracy: (recall + specificity) / 2, f1, precision, recall, brier: brier / Math.max(1, probabilities.length) };
}

function evaluateChannel(channel, samples, positiveKey) {
  if (!samples.length) return { accuracy: 0, balanced_accuracy: 0, f1: 0, precision: 0, recall: 0, brier: 0, samples: 0, threshold: 0, recommended_weight: 0 };
  const probabilities = samples.map((sample) => ({ probability: channelPrediction(channel, sample.features, channel.global_rate * 100).probability, actual: Boolean(sample[positiveKey]) }));
  let best = null;
  for (let threshold = .1; threshold <= .7; threshold += .02) {
    const metrics = metricsAtThreshold(probabilities, threshold);
    const objective = metrics.balancedAccuracy * .65 + metrics.f1 * .35;
    if (!best || objective > best.objective) best = { ...metrics, threshold, objective };
  }
  const balanced = Math.round(best.balancedAccuracy * 100);
  const f1 = Math.round(best.f1 * 100);
  const recommendedWeight = clamp(.12 + Math.max(0, balanced - 50) * .012 + f1 * .002, .12, .55);
  return {
    accuracy: Math.round(best.accuracy * 100), balanced_accuracy: balanced, f1,
    precision: Math.round(best.precision * 100), recall: Math.round(best.recall * 100),
    brier: Math.round(best.brier * 1000) / 1000, samples: samples.length,
    threshold: Math.round(best.threshold * 100), recommended_weight: Math.round(recommendedWeight * 100) / 100
  };
}

export function modelInfluence(modelRow, channel, fallback = .25) {
  const evaluation = modelRow?.metrics?.evaluation?.[channel];
  const value = Number(evaluation?.recommended_weight);
  return Number.isFinite(value) && value > 0 ? clamp(value, .1, .55) : fallback;
}

export async function trainIntelligenceModel() {
  const previousActive = await loadIntelligenceModel();
  const result = await queryLocal(`SELECT t.url,t.title,t.excerpt,t.image_url,t.published_at,
    COALESCE(SUM(s.clicks) FILTER(WHERE s.search_type='discover'),0)::float AS discover_clicks,
    COALESCE(SUM(s.impressions) FILTER(WHERE s.search_type='discover'),0)::float AS discover_impressions,
    COALESCE(SUM(s.clicks) FILTER(WHERE s.search_type='googleNews'),0)::float AS news_clicks,
    COALESCE(SUM(s.impressions) FILTER(WHERE s.search_type='googleNews'),0)::float AS news_impressions
    FROM teknoblog_content t LEFT JOIN performance_snapshots s ON regexp_replace(s.url,'/+$','')=regexp_replace(t.url,'/+$','')
    WHERE t.published_at BETWEEN NOW()-INTERVAL '180 days' AND NOW()-INTERVAL '3 days'
    GROUP BY t.url,t.title,t.excerpt,t.image_url,t.published_at ORDER BY t.published_at DESC LIMIT 2500`);
  const samples = result.rows.map((row) => {
    const age = Math.max(0, (Date.now() - new Date(row.published_at).getTime()) / 86400000);
    return { ...row, ...extractIntelligenceFeatures(row), weight: Math.pow(.5, age / 75), discover_positive: Number(row.discover_impressions) >= 100 || Number(row.discover_clicks) >= 3, news_positive: Number(row.news_impressions) >= 50 || Number(row.news_clicks) >= 2 };
  });
  const validationSize = samples.length >= 40 ? Math.max(8, Math.floor(samples.length * .2)) : 0;
  const validation = samples.slice(0, validationSize);
  const training = validationSize ? samples.slice(validationSize) : samples;
  const discover = buildChannel(training, 'discover_positive');
  const news = buildChannel(training, 'news_positive');

  const feedbackRows = (await queryLocal(`SELECT DISTINCT ON(url) url,title,source_name,decision,features,created_at FROM editorial_feedback
    WHERE decision IN ('approved','writing','published','instagram','skipped','rejected','useful','duplicate','unreliable') AND title IS NOT NULL
    ORDER BY url,created_at DESC LIMIT 1500`)).rows;
  const feedbackSamples = feedbackRows.map((row) => ({
    ...row,
    features: Array.isArray(row.features) && row.features.length ? row.features : extractIntelligenceFeatures(row).features,
    weight: Math.pow(.5, Math.max(0, (Date.now() - new Date(row.created_at).getTime()) / 86400000) / 60),
    editorial_positive: POSITIVE_DECISIONS.has(String(row.decision).toLowerCase()),
    editorial_negative: NEGATIVE_DECISIONS.has(String(row.decision).toLowerCase())
  })).filter((row) => row.editorial_positive || row.editorial_negative);
  const editorialValidationSize = feedbackSamples.length >= 30 ? Math.max(6, Math.floor(feedbackSamples.length * .2)) : 0;
  const editorialValidation = feedbackSamples.slice(0, editorialValidationSize);
  const editorialTraining = editorialValidationSize ? feedbackSamples.slice(editorialValidationSize) : feedbackSamples;
  const editorial = editorialTraining.length >= 8 ? buildChannel(editorialTraining, 'editorial_positive') : null;

  const positiveDiscover = samples.filter((sample) => sample.discover_positive);
  const positiveNews = samples.filter((sample) => sample.news_positive);
  const avg = (items, key) => items.length ? items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length : 0;
  const evaluation = {
    discover: evaluateChannel(discover, validation, 'discover_positive'),
    news: evaluateChannel(news, validation, 'news_positive'),
    editorial: editorial ? evaluateChannel(editorial, editorialValidation, 'editorial_positive') : { samples: feedbackSamples.length, recommended_weight: 0 }
  };
  discover.threshold = evaluation.discover.threshold / 100;
  news.threshold = evaluation.news.threshold / 100;
  if (editorial) editorial.threshold = evaluation.editorial.threshold / 100;
  const observedOutcomes = (await queryLocal(`SELECT discover_clicks+news_clicks AS actual,(expected_clicks_low+expected_clicks_high)/2.0 AS expected
    FROM prediction_outcomes WHERE observed_at IS NOT NULL AND expected_clicks_high>0 ORDER BY observed_at DESC LIMIT 500`)).rows;
  const actualTotal = observedOutcomes.reduce((sum, row) => sum + Number(row.actual || 0), 0);
  const expectedTotal = observedOutcomes.reduce((sum, row) => sum + Number(row.expected || 0), 0);
  const clickCalibration = observedOutcomes.length >= 15 && expectedTotal > 0 ? clamp(actualTotal / expectedTotal, .35, 2.5) : 1;
  const model = { discover, news, editorial, clicks: { discover_avg: avg(positiveDiscover, 'discover_clicks'), news_avg: avg(positiveNews, 'news_clicks'), calibration: clickCalibration, calibration_samples: observedOutcomes.length } };
  const version = `intel-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
  const metrics = {
    discover_positive: positiveDiscover.length,
    news_positive: positiveNews.length,
    editorial_feedback: feedbackSamples.length,
    feature_count_discover: Object.keys(discover.features).length,
    feature_count_news: Object.keys(news.features).length,
    feature_count_editorial: Object.keys(editorial?.features || {}).length,
    evaluation
  };
  const scoreOf = (row) => Number(row?.metrics?.evaluation?.discover?.balanced_accuracy || 0) * .62 + Number(row?.metrics?.evaluation?.news?.balanced_accuracy || 0) * .38;
  const candidateScore = scoreOf({ metrics }); const activeScore = scoreOf(previousActive);
  const promoted = !previousActive || candidateScore >= activeScore - 1.5;
  if (promoted) await queryLocal(`UPDATE intelligence_models SET status='retired' WHERE status='active'`);
  await queryLocal(`INSERT INTO intelligence_models(model_version,status,sample_count,discover_positive_rate,news_positive_rate,metrics,model)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [version, promoted ? 'active' : 'challenger', samples.length, discover.global_rate, news.global_rate, JSON.stringify({ ...metrics, comparison: { candidate_score: candidateScore, active_score: activeScore, promoted }, click_calibration: clickCalibration }), JSON.stringify(model)]);
  return { model_version: version, status: promoted ? 'active' : 'challenger', promoted, sample_count: samples.length, discover_positive_rate: discover.global_rate, news_positive_rate: news.global_rate, metrics };
}

export async function loadIntelligenceModel() {
  const result = await queryLocal(`SELECT * FROM intelligence_models WHERE status='active' ORDER BY trained_at DESC LIMIT 1`);
  return result.rows[0] || null;
}

export function predictWithModel(item = {}, modelRow = null, heuristics = {}) {
  const { features, labels } = extractIntelligenceFeatures(item);
  const model = modelRow?.model || {};
  const discover = channelPrediction(model.discover, features, heuristics.discover || 50);
  const news = channelPrediction(model.news, features, heuristics.news || heuristics.editorial || 45);
  const editorial = model.editorial ? channelPrediction(model.editorial, features, heuristics.editorial || 45) : null;
  const matched = new Set([...discover.evidence, ...news.evidence, ...(editorial?.evidence || [])].map((row) => row.feature)).size;
  const samples = Number(modelRow?.sample_count || 0);
  const confidence = Math.round(clamp(30 + Math.min(38, samples / 8) + Math.min(24, matched * 4), 30, 92));
  const reasons = [
    ...discover.evidence.map((row) => ({ channel: 'discover', label: labels[row.feature] || row.feature, impact: Math.round(row.effect * 12) })),
    ...news.evidence.map((row) => ({ channel: 'news', label: labels[row.feature] || row.feature, impact: Math.round(row.effect * 10) })),
    ...(editorial?.evidence || []).map((row) => ({ channel: 'editorial', label: labels[row.feature] || row.feature, impact: Math.round(row.effect * 9) }))
  ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 7);
  const expected = Math.max(0, (Number(model.clicks?.discover_avg || 0) * discover.probability + Number(model.clicks?.news_avg || 0) * news.probability) * Number(model.clicks?.calibration || 1));
  return {
    model_version: modelRow?.model_version || 'heuristic-fallback',
    discover_probability: Math.round(discover.probability * 100),
    news_probability: Math.round(news.probability * 100),
    editorial_probability: editorial ? Math.round(editorial.probability * 100) : null,
    confidence, expected_clicks_low: Math.round(expected * .55), expected_clicks_high: Math.round(expected * 1.55), reasons, features
  };
}

export async function savePredictions(items = [], modelVersion = '') {
  const payload = items.filter((item) => item.url).slice(0, 300).map((item) => ({
    url: item.url, candidate_id: item.id ? String(item.id) : null, title: item.title || '', source_name: item.source_name || '', model_version: modelVersion,
    discover_probability: item.discover_probability || 0, news_probability: item.news_probability || 0, confidence: item.intelligence_confidence || 0,
    expected_clicks_low: item.expected_clicks_low || 0, expected_clicks_high: item.expected_clicks_high || 0,
    reasons: item.intelligence_reasons || [], features: item.intelligence_features || extractIntelligenceFeatures(item).features
  }));
  if (!payload.length) return 0;
  const result = await queryLocal(`INSERT INTO content_predictions(url,candidate_id,title,source_name,model_version,discover_probability,news_probability,confidence,expected_clicks_low,expected_clicks_high,reasons,features)
    SELECT x.url,x.candidate_id,x.title,x.source_name,x.model_version,x.discover_probability,x.news_probability,x.confidence,x.expected_clicks_low,x.expected_clicks_high,x.reasons,x.features
    FROM jsonb_to_recordset($1::jsonb) AS x(url text,candidate_id text,title text,source_name text,model_version text,discover_probability float,news_probability float,confidence int,expected_clicks_low int,expected_clicks_high int,reasons jsonb,features jsonb)
    ON CONFLICT(url,model_version) DO UPDATE SET candidate_id=EXCLUDED.candidate_id,title=EXCLUDED.title,source_name=EXCLUDED.source_name,
    discover_probability=EXCLUDED.discover_probability,news_probability=EXCLUDED.news_probability,confidence=EXCLUDED.confidence,
    expected_clicks_low=EXCLUDED.expected_clicks_low,expected_clicks_high=EXCLUDED.expected_clicks_high,reasons=EXCLUDED.reasons,features=EXCLUDED.features,predicted_at=NOW()`, [JSON.stringify(payload)]);
  return result.rowCount;
}
