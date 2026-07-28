import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { json, queryLocal, safeText, nowIso } from './_lib.js';
import { getGoogleConfig, googleAccessToken } from './_google-auth.js';
import { getAppSecret, saveAppSecret } from './_app-secrets.js';
import { extractIntelligenceFeatures, loadIntelligenceModel, trainIntelligenceModel } from './_intelligence-model.js';
import { readSession } from '../lib/lock.js';

const STOP = new Set('ve veya ile için bir bu şu daha yeni son ilk olan olarak göre sonra önce hakkında üzerinde geliyor geldi olacak oldu neden nasıl hangi ne zaman teknoloji tech says report reportedly could may its the and for from with that this have has will into over after before'.split(' '));

function bodyOf(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

function authorized(req) {
  if (readSession(req)) return true;
  const expected = process.env.CRON_TOKEN || '';
  const supplied = req.query?.token || req.headers['x-cron-token'] || bodyOf(req).token || '';
  return Boolean(expected && supplied === expected);
}

function tokens(value = '') {
  return [...new Set(String(value).toLocaleLowerCase('tr-TR')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ').split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word)))];
}

function overlap(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const right = new Set(b);
  const common = a.filter((word) => right.has(word)).length;
  return common / Math.max(1, Math.min(a.length, b.length));
}

function canonicalUrl(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    url.search = '';
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch { return ''; }
}

function publicationTokens(value = '') {
  return [...new Set(String(value).toLocaleLowerCase('tr-TR')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ').split(/\s+/)
    .filter((word) => (word.length >= 3 || /^\d{1,4}$/.test(word)) && !STOP.has(word)))];
}

export function publicationMatch(leftTitle = '', rightTitle = '', leftUrl = '', rightUrl = '') {
  const direct = canonicalUrl(leftUrl) && canonicalUrl(leftUrl) === canonicalUrl(rightUrl);
  if (direct) return { accepted: true, score: 1, common: 99, reason: 'url' };
  const left = publicationTokens(leftTitle);
  const right = publicationTokens(rightTitle);
  if (!left.length || !right.length) return { accepted: false, score: 0, common: 0, reason: 'empty' };
  const rightSet = new Set(right);
  const commonTokens = left.filter((word) => rightSet.has(word));
  const common = commonTokens.length;
  const containment = common / Math.max(1, Math.min(left.length, right.length));
  const jaccard = common / Math.max(1, new Set([...left, ...right]).size);
  let score = containment * .72 + jaccard * .28;
  const modelLike = (word) => /\d/.test(word);
  const leftModels = left.filter(modelLike);
  const rightModels = right.filter(modelLike);
  if (leftModels.length && rightModels.length && !leftModels.some((word) => rightModels.includes(word))) {
    return { accepted: false, score: score * .2, common, reason: 'model_mismatch' };
  }
  const sharedModel = leftModels.some((word) => rightModels.includes(word));
  if ((leftModels.length || rightModels.length) && !sharedModel) score *= .78;
  const exactTitle = left.join(' ') === right.join(' ');
  const shortStrong = Math.min(left.length, right.length) <= 4 && common >= 2 && score >= .86;
  const translatedModelMatch = sharedModel && common >= 3 && containment >= .45;
  const genericEntities = new Set(['samsung', 'galaxy', 'apple', 'google', 'microsoft', 'xiaomi', 'huawei', 'garmin', 'openai', 'android', 'iphone', 'ipad', 'watch', 'update']);
  const distinctiveEntityMatch = common >= 2 && containment >= .3 && commonTokens.some((word) => word.length >= 5 && !genericEntities.has(word));
  const accepted = exactTitle || translatedModelMatch || distinctiveEntityMatch || (common >= 3 && score >= .72) || shortStrong;
  return { accepted, score: exactTitle ? 1 : score, common, reason: accepted ? 'title' : 'weak' };
}

function clamp(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }
function hash(value) { return createHash('sha1').update(String(value)).digest('hex'); }

const STRATEGY_MODES = {
  balanced: { label: 'Dengeli', description: 'Hız, kanıt, yenilik ve yayın potansiyelini birlikte dengeler.', weights: { first: .22, burst: .20, novelty: .15, momentum: .15, confidence: .13, gap: .15 } },
  speed: { label: 'İlk veren ol', description: 'Rakiplerden önce yakalanan ve fırsat penceresi açık konuları yükseltir.', weights: { first: .34, burst: .22, novelty: .18, momentum: .10, confidence: .06, gap: .10 } },
  discover: { label: 'Discover', description: 'Görsel, merak ve kullanıcı etkisi güçlü konuları öne alır.', weights: { first: .15, burst: .21, novelty: .19, momentum: .15, confidence: .13, gap: .17 } },
  news: { label: 'Google News', description: 'Çok kaynaklı, hızlı doğrulanan ve haber değeri yüksek gelişmeleri öne alır.', weights: { first: .14, burst: .18, novelty: .12, momentum: .22, confidence: .24, gap: .10 } },
  launch: { label: 'Ürün lansmanı', description: 'Yeni ürün ve hizmet duyurularını önceliklendirir.', weights: { first: .22, burst: .18, novelty: .25, momentum: .12, confidence: .13, gap: .10 }, beats: ['hardware', 'android', 'apple', 'mobility'] },
  ai: { label: 'Yapay zekâ', description: 'Yapay zekâ ürünleri, modelleri ve kullanıcı etkisini öne çıkarır.', weights: { first: .20, burst: .20, novelty: .22, momentum: .13, confidence: .13, gap: .12 }, beats: ['ai'] },
  deals: { label: 'Fırsat', description: 'Fiyat, satış ve erişim değeri bulunan teknoloji fırsatlarına odaklanır.', weights: { first: .16, burst: .18, novelty: .13, momentum: .14, confidence: .20, gap: .19 }, beats: ['deals'] },
  weekend: { label: 'Hafta sonu', description: 'Rehber, kullanıcı faydası ve sosyal paylaşım ömrü uzun konuları yükseltir.', weights: { first: .10, burst: .16, novelty: .18, momentum: .11, confidence: .20, gap: .25 }, beats: ['software', 'general-tech', 'science-space'] }
};

export function evidenceLevelFor(cluster = {}) {
  const official = Number(cluster.official_source_count || 0);
  const sources = Number(cluster.source_count || 0);
  if (official > 0 && sources >= 2) return { level: 'official_confirmed', label: 'Resmî + bağımsız doğrulama', score: 96, caution: '' };
  if (official > 0) return { level: 'official', label: 'Resmî kaynak', score: 88, caution: '' };
  if (sources >= 3) return { level: 'multi_source', label: `${sources} bağımsız kaynak`, score: 82, caution: '' };
  if (sources >= 2) return { level: 'corroborated', label: 'İki kaynakla doğrulandı', score: 72, caution: '' };
  return { level: 'single_claim', label: 'Tek kaynak iddiası', score: 42, caution: 'Yayımdan önce ikinci kaynak veya resmî açıklama aranmalı.' };
}

export function burstForecastFor(cluster = {}) {
  const sourceGrowth = Math.min(28, Math.max(0, Number(cluster.source_count || 1) - 1) * 11);
  const acceleration = Number(cluster.acceleration_score || 0) * .22;
  const momentum = Number(cluster.momentum_score || 0) * .24;
  const novelty = Number(cluster.novelty_score || 0) * .16;
  const official = Number(cluster.official_source_count || 0) ? 9 : 0;
  const probability = clamp(Number(cluster.breakout_probability || 0) * .35 + sourceGrowth + acceleration + momentum + novelty + official);
  const horizon_minutes = probability >= 80 ? 45 : probability >= 65 ? 90 : probability >= 50 ? 180 : 360;
  return { probability, horizon_minutes, label: probability >= 80 ? 'Patlamak üzere' : probability >= 65 ? 'Hızla büyüyebilir' : probability >= 50 ? 'Yükselme ihtimali var' : 'İzleme aşamasında' };
}

export function alertLevelFor(cluster = {}) {
  const burst = burstForecastFor(cluster).probability;
  const first = Number(cluster.first_mover_score || 0);
  const opportunity = Number(cluster.opportunity_minutes || 0);
  if (!cluster.owned_coverage && opportunity > 0 && (burst >= 80 || first >= 86)) return { key: 'red', label: 'Kırmızı · Hemen karar ver', rank: 5 };
  if (!cluster.owned_coverage && opportunity > 0 && (burst >= 65 || first >= 72)) return { key: 'orange', label: 'Turuncu · Hızlı doğrula', rank: 4 };
  if (burst >= 50 || Number(cluster.momentum_score || 0) >= 55) return { key: 'yellow', label: 'Sarı · Yakından izle', rank: 3 };
  if (Number(cluster.source_count || 0) >= 2) return { key: 'blue', label: 'Mavi · Doğrulanıyor', rank: 2 };
  return { key: 'gray', label: 'Gri · Erken sinyal', rank: 1 };
}

export function strategyScoreFor(cluster = {}, strategyKey = 'balanced') {
  const strategy = STRATEGY_MODES[strategyKey] || STRATEGY_MODES.balanced;
  const burst = burstForecastFor(cluster).probability;
  const gap = clamp(100 - Number(cluster.competitor_count || 0) * 22 - (cluster.owned_coverage ? 55 : 0));
  const w = strategy.weights;
  let score = Number(cluster.first_mover_score || 0) * w.first + burst * w.burst + Number(cluster.novelty_score || 0) * w.novelty + Number(cluster.momentum_score || 0) * w.momentum + Number(cluster.confidence_score || 0) * w.confidence + gap * w.gap;
  if (strategy.beats?.includes(cluster.beat)) score += 10;
  return clamp(score);
}

function beatFor(title = '') {
  const value = String(title).toLocaleLowerCase('tr-TR');
  if (/openai|chatgpt|gemini|claude|copilot|yapay zeka|\bai\b/.test(value)) return 'ai';
  if (/iphone|ipad|macbook|macos|\bios\b|apple|vision pro/.test(value)) return 'apple';
  if (/android|samsung|galaxy|pixel|xiaomi|one ui|snapdragon|telefon|tablet/.test(value)) return 'android';
  if (/güvenlik|siber|malware|ransomware|zero.day|veri ihlali|vulnerability/.test(value)) return 'security';
  if (/nvidia|amd|intel|işlemci|ekran kartı|gpu|cpu|çip|chip/.test(value)) return 'hardware';
  if (/windows|microsoft|linux|uygulama|software|yazılım|güncelleme/.test(value)) return 'software';
  if (/fiyat|indirim|kampanya|satış|ön sipariş|deal|discount/.test(value)) return 'deals';
  if (/otomobil|elektrikli araç|tesla|otomotiv|vehicle|car/.test(value)) return 'mobility';
  if (/uzay|nasa|spacex|roket|space|astronomi/.test(value)) return 'science-space';
  return 'general-tech';
}

function storyTypeFor(title = '', officialCount = 0) {
  const value = String(title).toLocaleLowerCase('tr-TR');
  if (/sızıntı|iddia|rumor|leak|reportedly|could|may |bekleniyor/.test(value)) return 'rumor';
  if (/inceleme|review|rehber|nasıl|liste|karşılaştırma|tavsiy/.test(value)) return 'explainer';
  if (/fiyat|indirim|kampanya|satış|ön sipariş|deal|discount/.test(value)) return 'deal';
  if (/güncelleme|update|beta|rollout|yama|patch/.test(value)) return 'update';
  if (/tanıttı|duyurdu|lansman|launch|announc|unveil|introduc/.test(value)) return officialCount ? 'official_launch' : 'launch';
  if (officialCount) return 'official_news';
  return 'news';
}

function marketFor(meta = {}) {
  const value = String(meta.market_relevance || '').toLowerCase();
  return /turkey|local|türkiye/.test(value) || meta.source_type === 'competitor' || meta.source_type === 'owned' ? 'TR' : 'GLOBAL';
}

function opportunityWindow({ sourceCount = 1, competitorCount = 0, officialCount = 0, novelty = 0 }) {
  if (competitorCount >= 3) return 0;
  if (competitorCount === 2) return 25;
  if (competitorCount === 1) return 60;
  const base = officialCount ? 480 : sourceCount >= 2 ? 210 : 360;
  return Math.round(base * (novelty >= 70 ? 1 : novelty >= 45 ? .8 : .55));
}

function editorialPackageFor(cluster) {
  const references = (cluster.items || []).slice(0, 6).map((item) => ({ title: item.title, source: item.source_name, url: item.url, published_at: item.published_at || item.created_at }));
  const angleByBeat = {
    ai: 'Kullanıcıya etkisini, erişim durumunu ve rakip modellerden farkını öne çıkar.',
    apple: 'Desteklenen cihazlar, kullanıcı etkisi ve Türkiye erişimini netleştir.',
    android: 'Model listesi, dağıtım takvimi ve kullanıcıya gelen yenilikleri öne çıkar.',
    security: 'Kimlerin etkilendiğini, risk seviyesini ve alınması gereken önlemi açıkla.',
    deals: 'Güncel fiyatı, geçmiş fiyatı ve fırsatın gerçekten avantajlı olup olmadığını doğrula.',
    hardware: 'Performans farkını, hedef kullanıcıyı ve fiyat/erişim bilgisini öne çıkar.'
  };
  return {
    decision: cluster.opportunity_minutes > 30 && cluster.novelty_score >= 55 ? 'write_now' : cluster.opportunity_minutes > 0 ? 'verify_first' : 'monitor',
    angle: angleByBeat[cluster.beat] || 'Gelişmenin kullanıcıya etkisini, Türkiye bağlantısını ve yeni olan kısmını öne çıkar.',
    source_claims: references.slice(0, 4).map((item) => `${item.source}: ${item.title}`),
    open_questions: ['Ana iddia bağımsız bir kaynakla doğrulandı mı?', 'Türkiye erişimi, fiyatı veya takvimi belli mi?', 'Önceki habere göre gerçekten yeni olan ayrıntı ne?'],
    headline_options: [`${cluster.cluster_name}`, `${cluster.cluster_name}: Bilinenler ve öne çıkan ayrıntılar`, `${cluster.cluster_name} hakkında yeni gelişme`],
    references
  };
}

async function syncTeknoblog(maxPages = 20) {
  let page = 1;
  let totalPages = 1;
  let stored = 0;
  do {
    const url = new URL('https://www.teknoblog.com/wp-json/wp/v2/posts');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('_fields', 'id,link,date,title,excerpt,_embedded');
    url.searchParams.set('_embed', '1');
    const response = await fetch(url, { headers: { 'user-agent': 'TeknoblogRadarBot/2.0' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Teknoblog API HTTP ${response.status}`);
    totalPages = Math.min(Math.max(1, Number(maxPages) || 20), Number(response.headers.get('x-wp-totalpages') || 1));
    const posts = await response.json();
    for (const post of posts || []) {
      const image = post?._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
      await queryLocal(`INSERT INTO teknoblog_content(wp_id,title,url,excerpt,image_url,published_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(url) DO UPDATE SET
        wp_id=EXCLUDED.wp_id,title=EXCLUDED.title,excerpt=EXCLUDED.excerpt,image_url=EXCLUDED.image_url,published_at=EXCLUDED.published_at,updated_at=NOW()`,
      [post.id, safeText(post?.title?.rendered || ''), post.link, safeText(post?.excerpt?.rendered || ''), image, post.date || null]);
      stored += 1;
    }
    page += 1;
  } while (page <= totalPages);
  await reconcilePredictionOutcomes();
  return stored;
}

async function reconcilePredictionOutcomes() {
  const [predictions, posts, directQueue] = await Promise.all([
    queryLocal(`SELECT DISTINCT ON(url) url,title,model_version,discover_probability,news_probability,expected_clicks_low,expected_clicks_high,predicted_at
      FROM content_predictions WHERE title IS NOT NULL AND title<>'' AND predicted_at>=NOW()-INTERVAL '30 days'
      ORDER BY url,predicted_at DESC`),
    queryLocal(`SELECT title,url,published_at FROM teknoblog_content WHERE published_at>=NOW()-INTERVAL '35 days' ORDER BY published_at DESC`),
    queryLocal(`SELECT url,published_url FROM editorial_queue WHERE published_url IS NOT NULL AND published_url<>''`)
  ]);
  const directMap = new Map(directQueue.rows.map((row) => [row.url, row.published_url]));
  let matched = 0;
  for (const prediction of predictions.rows) {
    let best = null;
    let bestScore = 0;
    const directUrl = directMap.get(prediction.url);
    for (const post of posts.rows) {
      const score = directUrl && directUrl.replace(/\/+$/, '') === post.url.replace(/\/+$/, '') ? 1 : overlap(tokens(prediction.title), tokens(post.title));
      const predictedAt = new Date(prediction.predicted_at).getTime();
      const publishedAt = new Date(post.published_at).getTime();
      if (publishedAt < predictedAt - 12 * 3600000 || publishedAt > predictedAt + 21 * 86400000) continue;
      if (score > bestScore) { best = post; bestScore = score; }
    }
    if (!best || bestScore < .48) continue;
    await queryLocal(`INSERT INTO prediction_outcomes(prediction_url,published_url,model_version,match_score,discover_probability,news_probability,expected_clicks_low,expected_clicks_high,matched_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT(prediction_url,published_url) DO UPDATE SET
      model_version=EXCLUDED.model_version,match_score=GREATEST(prediction_outcomes.match_score,EXCLUDED.match_score),
      discover_probability=EXCLUDED.discover_probability,news_probability=EXCLUDED.news_probability,
      expected_clicks_low=EXCLUDED.expected_clicks_low,expected_clicks_high=EXCLUDED.expected_clicks_high`,
    [prediction.url, best.url, prediction.model_version, bestScore, prediction.discover_probability, prediction.news_probability, prediction.expected_clicks_low, prediction.expected_clicks_high]);
    matched += 1;
  }
  await queryLocal(`UPDATE prediction_outcomes o SET
    discover_clicks=p.discover_clicks,discover_impressions=p.discover_impressions,
    news_clicks=p.google_news_clicks,news_impressions=p.google_news_impressions,observed_at=p.observed_at
    FROM published_performance p WHERE regexp_replace(o.published_url,'/+$','')=regexp_replace(p.url,'/+$','')`);
  return { matched };
}

async function reconcileQueuePublications() {
  const started = await queryLocal(`INSERT INTO pipeline_runs(status,notes) VALUES('running','queue_publication_check:running') RETURNING id,started_at`);
  const runId = started.rows[0]?.id;
  try {
    const [queue, posts] = await Promise.all([
      queryLocal(`SELECT id,candidate_id,title,url,source_name,status,published_url,created_at FROM editorial_queue
        WHERE status NOT IN ('published','skipped') AND created_at>=NOW()-INTERVAL '45 days'
        ORDER BY priority DESC,created_at DESC LIMIT 500`),
      queryLocal(`SELECT title,url,published_at FROM teknoblog_content
        WHERE published_at>=NOW()-INTERVAL '45 days' ORDER BY published_at DESC LIMIT 3000`)
    ]);
    const matches = [];
    for (const item of queue.rows) {
      const createdAt = new Date(item.created_at).getTime();
      let best = null;
      let bestMatch = null;
      for (const post of posts.rows) {
        const publishedAt = new Date(post.published_at).getTime();
        if (!Number.isFinite(publishedAt) || publishedAt < createdAt - 7 * 86400000) continue;
        const match = publicationMatch(item.title, post.title, item.published_url || item.url, post.url);
        if (!match.accepted || (bestMatch && match.score <= bestMatch.score)) continue;
        best = post;
        bestMatch = match;
      }
      if (!best || !bestMatch) continue;
      const score = Math.round(bestMatch.score * 100);
      const updated = await queryLocal(`UPDATE editorial_queue SET status='published',published_url=$2,
        completed_at=COALESCE(completed_at,NOW()),updated_at=NOW(),
        notes=TRIM(CONCAT_WS(E'\n',NULLIF(notes,''),$3))
        WHERE id=$1 AND status NOT IN ('published','skipped') RETURNING *`,
      [item.id, best.url, `Radar otomatik yayın teyidi: %${score} başlık eşleşmesi · ${new Date().toISOString()}`]);
      if (!updated.rowCount) continue;
      matches.push({ queue_id: item.id, title: item.title, published_title: best.title, published_url: best.url, match_score: score });
      await queryLocal(`INSERT INTO editorial_feedback(url,title,source_name,decision,reason_code,notes,features)
        VALUES($1,$2,$3,'published','auto_teknoblog_match',$4,'{}'::jsonb)`,
      [item.url, item.title, item.source_name || '', `Teknoblog yayını otomatik eşleştirildi: ${best.url} (%${score})`]);
    }
    const details = { checked: queue.rows.length, matched: matches.length, matches };
    await queryLocal(`UPDATE pipeline_runs SET status='completed',finished_at=NOW(),processed_count=$2,notes=$3 WHERE id=$1`,
      [runId, queue.rows.length, `queue_publication_check:${JSON.stringify({ checked: details.checked, matched: details.matched })}`]);
    if (matches.length) Promise.resolve().then(() => reconcilePredictionOutcomes()).catch(() => {});
    return details;
  } catch (error) {
    if (runId) await queryLocal(`UPDATE pipeline_runs SET status='failed',finished_at=NOW(),notes=$2 WHERE id=$1`, [runId, `queue_publication_check:${JSON.stringify({ error: error?.message || String(error) })}`]).catch(() => {});
    throw error;
  }
}

async function queueAutomationStatus() {
  const row = (await queryLocal(`SELECT status,started_at,finished_at,processed_count,notes FROM pipeline_runs
    WHERE notes LIKE 'queue_publication_check:%' ORDER BY started_at DESC LIMIT 1`)).rows[0] || null;
  if (!row) return { interval_minutes: 15, last_checked_at: null, checked: 0, matched: 0 };
  let details = {};
  try { details = JSON.parse(String(row.notes || '').replace(/^queue_publication_check:/, '')); } catch {}
  return { interval_minutes: 15, status: row.status, last_checked_at: row.finished_at || row.started_at, checked: details.checked || row.processed_count || 0, matched: details.matched || 0 };
}

async function recentCandidates(limit = 600) {
  const result = await queryLocal(`SELECT id,source_id,title,url,source_name,image_url,published_at,created_at,
    total_score,discover_score,traffic_score,social_score,editorial_score,conversion_score
    FROM topic_candidates WHERE status='active' AND COALESCE(published_at,created_at) >= NOW()-INTERVAL '48 hours'
    ORDER BY COALESCE(published_at,created_at) DESC LIMIT $1`, [limit]);
  return result.rows;
}

function buildClusters(items = [], sourceMeta = new Map(), ownedPosts = [], context = {}) {
  const groups = [];
  for (const item of items) {
    const itemTokens = tokens(item.title);
    if (itemTokens.length < 2) continue;
    let best = null;
    let bestScore = 0;
    for (const group of groups) {
      const value = overlap(itemTokens, group.tokens);
      if (value > bestScore) { best = group; bestScore = value; }
    }
    if (!best || bestScore < 0.52) {
      groups.push({ tokens: itemTokens, items: [item] });
    } else {
      best.items.push(item);
      best.tokens = [...new Set([...best.tokens, ...itemTokens])].slice(0, 14);
    }
  }
  return groups.map((group) => {
    const sorted = group.items.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
    const timeline = [...sorted].sort((a, b) => new Date(a.published_at || a.created_at) - new Date(b.published_at || b.created_at));
    const sources = [...new Set(sorted.map((item) => item.source_name).filter(Boolean))];
    const first = Math.min(...sorted.map((item) => new Date(item.published_at || item.created_at).getTime()));
    const last = Math.max(...sorted.map((item) => new Date(item.published_at || item.created_at).getTime()));
    const ageHours = Math.max(0, (Date.now() - last) / 3600000);
    const recentCount = sorted.filter((item) => Date.now() - new Date(item.published_at || item.created_at).getTime() <= 6 * 3600000).length;
    const last90 = sorted.filter((item) => Date.now() - new Date(item.published_at || item.created_at).getTime() <= 90 * 60000).length;
    const previous90 = sorted.filter((item) => { const age = Date.now() - new Date(item.published_at || item.created_at).getTime(); return age > 90 * 60000 && age <= 180 * 60000; }).length;
    const metas = timeline.map((item) => sourceMeta.get(String(item.source_id || '')) || { source_type: 'news', trust_score: 70, market_relevance: 'global' });
    const officialCount = new Set(timeline.filter((item, index) => metas[index].source_type === 'official').map((item) => item.source_name)).size;
    const competitorItems = timeline.filter((item, index) => metas[index].source_type === 'competitor');
    const competitorCount = new Set(competitorItems.map((item) => item.source_name)).size;
    const firstSource = timeline[0]?.source_name || '';
    const firstCompetitorAt = competitorItems[0] ? new Date(competitorItems[0].published_at || competitorItems[0].created_at).getTime() : null;
    const firstSignalAt = first;
    const leadWindowMinutes = Math.max(0, Math.round(((firstCompetitorAt || Date.now()) - firstSignalAt) / 60000));
    const titleTokens = tokens(sorted[0]?.title);
    let ownedMatch = 0;
    let matchedPost = null;
    for (const post of ownedPosts) { const value = overlap(titleTokens, tokens(post.title)); if (value > ownedMatch) { ownedMatch = value; matchedPost = post; } }
    const ownedCoverage = ownedMatch >= .68 && matchedPost && Date.now() - new Date(matchedPost.published_at || 0).getTime() <= 14 * 86400000;
    const acceleration = clamp(42 + (last90 - previous90) * 14 + Math.min(3, sources.length) * 5);
    const freshness = clamp(100 - ageHours * 8);
    const avgTrust = metas.reduce((sum, meta) => sum + Number(meta.trust_score || 70), 0) / Math.max(1, metas.length);
    const avgDiscover = sorted.reduce((sum, item) => sum + Number(item.discover_score || 0), 0) / Math.max(1, sorted.length);
    const authority = officialCount ? Math.max(92, avgTrust) : avgTrust;
    const corroboration = sources.length >= 4 ? 94 : sources.length === 3 ? 82 : sources.length === 2 ? 62 : 30;
    const whitespace = competitorCount === 0 ? 100 : competitorCount === 1 ? 52 : competitorCount === 2 ? 25 : 8;
    const earlySignal = clamp(freshness * .30 + authority * .24 + corroboration * .16 + acceleration * .18 + avgDiscover * .12 - competitorCount * 5 - (ownedCoverage ? 45 : 0));
    const breakout = clamp(authority * .25 + corroboration * .25 + acceleration * .30 + avgDiscover * .20 - Math.min(15, ageHours * 1.5));
    const firstMover = clamp(earlySignal * .55 + breakout * .25 + whitespace * .20 + (officialCount ? 3 : 0) - (ownedCoverage ? 45 : 0));
    const stage = ownedCoverage ? 'covered' : firstMover >= 78 ? 'act_now' : firstMover >= 62 ? 'emerging' : 'watch';
    const reasons = [
      officialCount ? `${officialCount} resmî kaynak` : null,
      competitorCount === 0 ? 'Türkiye rakiplerinde henüz görünmüyor' : `${competitorCount} Türkiye rakibi yazdı`,
      last90 > previous90 ? 'yayılma hızı artıyor' : null,
      sources.length >= 2 ? `${sources.length} kaynakla doğrulandı` : 'tek kaynaklı erken sinyal',
      leadWindowMinutes ? `${leadWindowMinutes} dakikalık öncülük penceresi` : null
    ].filter(Boolean);
    const momentum = clamp(25 + sources.length * 12 + recentCount * 9 - ageHours * 2);
    const confidence = clamp(30 + sources.length * 15 + (sorted[0]?.image_url ? 8 : 0) + (sorted.length > 2 ? 10 : 0));
    const clusterKey = hash(group.tokens.slice(0, 6).sort().join('|'));
    const beat = beatFor(sorted[0]?.title || '');
    const storyType = storyTypeFor(sorted[0]?.title || '', officialCount);
    let historicalOverlap = ownedMatch;
    for (const historical of context.previousClusters || []) {
      if (historical.cluster_key === clusterKey) continue;
      historicalOverlap = Math.max(historicalOverlap, overlap(titleTokens, tokens(historical.cluster_name)));
    }
    const novelty = clamp(100 - historicalOverlap * 100 + (officialCount ? 8 : 0) - (storyType === 'explainer' ? 18 : 0));
    const markets = [...new Set(metas.map(marketFor))];
    const spread = clamp(sources.length * 14 + markets.length * 18 + recentCount * 8 + Math.max(0, last90 - previous90) * 12);
    const windowMinutes = opportunityWindow({ sourceCount: sources.length, competitorCount, officialCount, novelty });
    const opportunityExpiresAt = new Date(first + windowMinutes * 60000);
    const opportunityMinutes = Math.max(0, Math.round((opportunityExpiresAt.getTime() - Date.now()) / 60000));
    const queueMatch = sorted.some((item) => context.queueUrls?.has(String(item.url || '').replace(/\/+$/, '')));
    const lifecycleStage = ownedCoverage ? 'published' : queueMatch ? 'queued' : opportunityMinutes <= 0 ? 'expired' : sources.length >= 2 && momentum >= 55 ? 'accelerating' : sources.length >= 2 ? 'corroborated' : 'detected';
    const seenTimelineSources = new Set();
    const sourceTimeline = timeline.flatMap((item, index) => {
      const key = String(item.source_id || item.source_name || '');
      if (seenTimelineSources.has(key)) return [];
      seenTimelineSources.add(key);
      return [{ source_id: item.source_id, source_name: item.source_name, source_type: metas[index].source_type, market: marketFor(metas[index]), published_at: item.published_at || item.created_at, url: item.url }];
    });
    const watchlists = (context.watchlists || []).filter((watch) => {
      const words = Array.isArray(watch.keywords) ? watch.keywords : [];
      const beats = Array.isArray(watch.beats) ? watch.beats : [];
      const text = String(sorted[0]?.title || '').toLocaleLowerCase('tr-TR');
      return beats.includes(beat) || words.some((word) => text.includes(String(word).toLocaleLowerCase('tr-TR')));
    }).map((watch) => watch.name);
    const cluster = {
      cluster_key: clusterKey,
      cluster_name: sorted[0].title,
      source_count: sources.length,
      item_count: sorted.length,
      momentum_score: momentum,
      confidence_score: confidence,
      early_signal_score: earlySignal,
      first_mover_score: firstMover,
      breakout_probability: breakout,
      competitor_count: competitorCount,
      official_source_count: officialCount,
      owned_coverage: Boolean(ownedCoverage),
      matched_post: ownedCoverage ? matchedPost : null,
      lead_window_minutes: leadWindowMinutes,
      signal_stage: stage,
      first_source_name: firstSource,
      acceleration_score: acceleration,
      novelty_score: novelty,
      spread_score: spread,
      story_type: storyType,
      beat,
      markets,
      country_count: markets.length,
      propagation_stage: markets.includes('TR') && markets.includes('GLOBAL') ? 'entering_turkey' : markets.includes('TR') ? 'turkey_only' : 'global_only',
      opportunity_window_minutes: windowMinutes,
      opportunity_minutes: opportunityMinutes,
      opportunity_expires_at: opportunityExpiresAt.toISOString(),
      lifecycle_stage: lifecycleStage,
      source_timeline: sourceTimeline,
      watchlists,
      reasons,
      first_seen_at: new Date(first).toISOString(),
      last_seen_at: new Date(last).toISOString(),
      sources,
      items: sorted.slice(0, 8)
    };
    cluster.editorial_package = editorialPackageFor(cluster);
    return cluster;
  }).sort((a, b) => b.first_mover_score - a.first_mover_score || b.momentum_score - a.momentum_score || b.source_count - a.source_count);
}

async function updateSourceLeadership(clusters = []) {
  const stats = new Map();
  for (const cluster of clusters) {
    const timeline = cluster.source_timeline || [];
    const firstAt = timeline[0]?.published_at ? new Date(timeline[0].published_at).getTime() : 0;
    const secondAt = timeline[1]?.published_at ? new Date(timeline[1].published_at).getTime() : firstAt;
    for (let index = 0; index < timeline.length; index += 1) {
      const item = timeline[index];
      if (!item.source_id) continue;
      const key = `${item.source_id}|${cluster.beat}`;
      const stat = stats.get(key) || { source_id: String(item.source_id), source_name: item.source_name || '', beat: cluster.beat, samples: 0, first: 0, corroborations: 0, lead_total: 0, successes: 0 };
      stat.samples += 1;
      if (index === 0) { stat.first += 1; stat.lead_total += Math.max(0, Math.round((secondAt - firstAt) / 60000)); }
      else stat.corroborations += 1;
      if (cluster.owned_coverage || cluster.lifecycle_stage === 'queued') stat.successes += 1;
      stats.set(key, stat);
    }
  }
  for (const stat of stats.values()) {
    const avgLead = stat.first ? Math.round(stat.lead_total / stat.first) : 0;
    const rawLeadership = (stat.first / Math.max(1, stat.samples)) * 65 + Math.min(35, avgLead / 3);
    const sampleConfidence = Math.min(1, stat.samples / 12);
    const leadership = clamp(50 + (rawLeadership - 50) * sampleConfidence);
    const rawSuccess = (stat.successes / Math.max(1, stat.samples)) * 100;
    const success = clamp(50 + (rawSuccess - 50) * sampleConfidence);
    await queryLocal(`INSERT INTO source_leadership_stats(source_id,source_name,beat,sample_count,first_break_count,corroboration_count,avg_lead_minutes,leadership_score,success_score,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT(source_id,beat) DO UPDATE SET
      source_name=EXCLUDED.source_name,sample_count=EXCLUDED.sample_count,first_break_count=EXCLUDED.first_break_count,
      corroboration_count=EXCLUDED.corroboration_count,avg_lead_minutes=EXCLUDED.avg_lead_minutes,
      leadership_score=EXCLUDED.leadership_score,success_score=EXCLUDED.success_score,updated_at=NOW()`,
    [stat.source_id, stat.source_name, stat.beat, stat.samples, stat.first, stat.corroborations, avgLead, leadership, success]);
  }
}

async function clustersSection() {
  const [candidates, sources, owned, previous, queue, watchlists] = await Promise.all([
    recentCandidates(),
    queryLocal(`SELECT id,source_type,trust_score,priority_weight,market_relevance FROM sources`),
    queryLocal(`SELECT title,url,published_at FROM teknoblog_content WHERE published_at>=NOW()-INTERVAL '14 days' ORDER BY published_at DESC LIMIT 500`),
    queryLocal(`SELECT cluster_key,cluster_name,lifecycle_stage,last_seen_at FROM content_clusters WHERE last_seen_at>=NOW()-INTERVAL '30 days' ORDER BY last_seen_at DESC LIMIT 500`),
    queryLocal(`SELECT url FROM editorial_queue WHERE status NOT IN ('published','skipped')`),
    queryLocal(`SELECT name,keywords,beats,source_ids,alert_threshold FROM radar_watchlists WHERE is_active=true ORDER BY name`)
  ]);
  const sourceMeta = new Map(sources.rows.map((source) => [String(source.id), source]));
  const previousMap = new Map(previous.rows.map((item) => [item.cluster_key, item]));
  const queueUrls = new Set(queue.rows.map((item) => String(item.url || '').replace(/\/+$/, '')));
  const clusters = buildClusters(candidates, sourceMeta, owned.rows, { previousClusters: previous.rows, queueUrls, watchlists: watchlists.rows });
  for (const cluster of clusters.slice(0, 80)) {
    await queryLocal(`INSERT INTO content_clusters(cluster_key,cluster_name,source_count,item_count,momentum_score,confidence_score,first_seen_at,last_seen_at,payload,
      early_signal_score,first_mover_score,breakout_probability,competitor_count,official_source_count,owned_coverage,lead_window_minutes,signal_stage,first_source_name,
      lifecycle_stage,novelty_score,spread_score,opportunity_minutes,opportunity_expires_at,story_type,beat,country_count,countries,source_timeline,editorial_package,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,NOW()) ON CONFLICT(cluster_key) DO UPDATE SET
      cluster_name=EXCLUDED.cluster_name,source_count=EXCLUDED.source_count,item_count=EXCLUDED.item_count,
      momentum_score=EXCLUDED.momentum_score,confidence_score=EXCLUDED.confidence_score,last_seen_at=EXCLUDED.last_seen_at,payload=EXCLUDED.payload,
      early_signal_score=EXCLUDED.early_signal_score,first_mover_score=EXCLUDED.first_mover_score,breakout_probability=EXCLUDED.breakout_probability,
      competitor_count=EXCLUDED.competitor_count,official_source_count=EXCLUDED.official_source_count,owned_coverage=EXCLUDED.owned_coverage,
      lead_window_minutes=EXCLUDED.lead_window_minutes,signal_stage=EXCLUDED.signal_stage,first_source_name=EXCLUDED.first_source_name,
      lifecycle_stage=EXCLUDED.lifecycle_stage,novelty_score=EXCLUDED.novelty_score,spread_score=EXCLUDED.spread_score,
      opportunity_minutes=EXCLUDED.opportunity_minutes,opportunity_expires_at=EXCLUDED.opportunity_expires_at,story_type=EXCLUDED.story_type,
      beat=EXCLUDED.beat,country_count=EXCLUDED.country_count,countries=EXCLUDED.countries,source_timeline=EXCLUDED.source_timeline,
      editorial_package=EXCLUDED.editorial_package,updated_at=NOW()`,
    [cluster.cluster_key, cluster.cluster_name, cluster.source_count, cluster.item_count, cluster.momentum_score, cluster.confidence_score, cluster.first_seen_at, cluster.last_seen_at,
      JSON.stringify({ sources: cluster.sources, items: cluster.items, reasons: cluster.reasons, acceleration_score: cluster.acceleration_score, matched_post: cluster.matched_post, propagation_stage: cluster.propagation_stage, watchlists: cluster.watchlists }),
      cluster.early_signal_score, cluster.first_mover_score, cluster.breakout_probability, cluster.competitor_count, cluster.official_source_count,
      cluster.owned_coverage, cluster.lead_window_minutes, cluster.signal_stage, cluster.first_source_name, cluster.lifecycle_stage, cluster.novelty_score,
      cluster.spread_score, cluster.opportunity_minutes, cluster.opportunity_expires_at, cluster.story_type, cluster.beat, cluster.country_count,
      JSON.stringify(cluster.markets), JSON.stringify(cluster.source_timeline), JSON.stringify(cluster.editorial_package)]);
    const previousStage = previousMap.get(cluster.cluster_key)?.lifecycle_stage || null;
    if (previousStage !== cluster.lifecycle_stage) {
      await queryLocal(`INSERT INTO cluster_lifecycle_events(cluster_key,event_type,from_stage,to_stage,source_name,occurred_at,payload)
        VALUES($1,$2,$3,$4,$5,NOW(),$6)`, [cluster.cluster_key, 'stage_changed', previousStage, cluster.lifecycle_stage, cluster.first_source_name, JSON.stringify({ title: cluster.cluster_name, opportunity_minutes: cluster.opportunity_minutes, source_count: cluster.source_count, competitor_count: cluster.competitor_count })]);
    }
    await queryLocal(`INSERT INTO early_signal_snapshots(cluster_key,capture_bucket,early_signal_score,first_mover_score,breakout_probability,source_count,competitor_count,payload)
      VALUES($1,date_trunc('hour',NOW()) + floor(extract(minute from NOW())/15)*interval '15 minutes',$2,$3,$4,$5,$6,$7)
      ON CONFLICT(cluster_key,capture_bucket) DO UPDATE SET early_signal_score=EXCLUDED.early_signal_score,first_mover_score=EXCLUDED.first_mover_score,
      breakout_probability=EXCLUDED.breakout_probability,source_count=EXCLUDED.source_count,competitor_count=EXCLUDED.competitor_count,payload=EXCLUDED.payload`,
    [cluster.cluster_key, cluster.early_signal_score, cluster.first_mover_score, cluster.breakout_probability, cluster.source_count, cluster.competitor_count, JSON.stringify({ stage: cluster.signal_stage, title: cluster.cluster_name })]);
  }
  await updateSourceLeadership(clusters.slice(0, 80));
  return clusters.slice(0, 60);
}

function isEarlySignal(item) {
  return !item.owned_coverage
    && Number(item.source_count) === 1
    && Number(item.competitor_count) === 0
    && Number(item.first_mover_score) >= 52
    && Number(item.novelty_score) >= 45
    && Number(item.opportunity_minutes) > 0;
}

function isRisingCluster(item) {
  const lastSeen = new Date(item.last_seen_at || 0).getTime();
  const ageHours = Number.isFinite(lastSeen) ? (Date.now() - lastSeen) / 3600000 : 999;
  return !item.owned_coverage
    && Number(item.source_count) >= 2
    && Number(item.momentum_score) >= 20
    && ageHours <= 12;
}

function risingClusters(items = []) {
  return items.filter(isRisingCluster)
    .sort((a, b) => b.momentum_score - a.momentum_score
      || b.source_count - a.source_count
      || b.confidence_score - a.confidence_score);
}

async function lifecycleSection() {
  const clusters = await clustersSection();
  const stages = ['detected', 'corroborated', 'accelerating', 'queued', 'published', 'expired'];
  const counts = Object.fromEntries(stages.map((stage) => [stage, clusters.filter((item) => item.lifecycle_stage === stage).length]));
  const events = (await queryLocal(`SELECT * FROM cluster_lifecycle_events WHERE occurred_at>=NOW()-INTERVAL '48 hours' ORDER BY occurred_at DESC LIMIT 120`)).rows;
  return {
    generated_at: nowIso(), counts, events,
    urgent: clusters.filter((item) => item.opportunity_minutes > 0 && item.opportunity_minutes <= 60 && !item.owned_coverage).sort((a, b) => a.opportunity_minutes - b.opportunity_minutes).slice(0, 20),
    items: clusters.sort((a, b) => b.opportunity_minutes - a.opportunity_minutes || b.first_mover_score - a.first_mover_score).slice(0, 60)
  };
}

async function leadershipSection() {
  const rows = (await queryLocal(`SELECT l.*,s.source_type,s.market_relevance,s.trust_score FROM source_leadership_stats l
    LEFT JOIN sources s ON s.id=l.source_id ORDER BY l.leadership_score DESC,l.sample_count DESC,l.source_name LIMIT 150`)).rows;
  return { generated_at: nowIso(), items: rows };
}

async function watchlistsSection() {
  const [lists, clusters] = await Promise.all([
    queryLocal(`SELECT * FROM radar_watchlists ORDER BY is_active DESC,name`),
    clustersSection()
  ]);
  return {
    items: lists.rows.map((watch) => ({ ...watch, matches: clusters.filter((cluster) => cluster.watchlists?.includes(watch.name)).slice(0, 12) })),
    generated_at: nowIso()
  };
}

async function pioneerMetricsSection() {
  const [clusters, outcomes, decisions, leaders] = await Promise.all([
    queryLocal(`SELECT
      COUNT(*)::int AS tracked,
      COUNT(*) FILTER(WHERE lifecycle_stage='published' OR owned_coverage=true)::int AS published,
      COUNT(*) FILTER(WHERE opportunity_minutes>0 AND owned_coverage=false)::int AS open_windows,
      COUNT(*) FILTER(WHERE novelty_score>=70)::int AS novel_topics,
      ROUND(AVG(novelty_score))::int AS avg_novelty,
      ROUND(AVG(spread_score))::int AS avg_spread,
      ROUND(AVG(lead_window_minutes))::int AS avg_lead_minutes
      FROM content_clusters WHERE updated_at>=NOW()-INTERVAL '30 days'`),
    queryLocal(`SELECT COUNT(*)::int AS observed,
      COUNT(*) FILTER(WHERE discover_clicks>=3 OR discover_impressions>=100)::int AS discover_wins,
      COUNT(*) FILTER(WHERE news_clicks>=3 OR news_impressions>=100)::int AS news_wins,
      ROUND(AVG(discover_clicks+news_clicks))::int AS avg_clicks
      FROM prediction_outcomes WHERE matched_at>=NOW()-INTERVAL '30 days'`),
    queryLocal(`SELECT decision,COALESCE(reason_code,'unspecified') AS reason_code,COUNT(*)::int AS count FROM editorial_feedback WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY decision,COALESCE(reason_code,'unspecified') ORDER BY count DESC`),
    queryLocal(`SELECT source_name,beat,leadership_score,sample_count,avg_lead_minutes,success_score FROM source_leadership_stats ORDER BY leadership_score DESC,sample_count DESC LIMIT 15`)
  ]);
  const outcome = outcomes.rows[0] || {};
  return { summary: { ...(clusters.rows[0] || {}), ...outcome, discover_success_rate: outcome.observed ? Math.round(outcome.discover_wins / outcome.observed * 100) : 0, news_success_rate: outcome.observed ? Math.round(outcome.news_wins / outcome.observed * 100) : 0 }, decisions: decisions.rows, leaders: leaders.rows, generated_at: nowIso() };
}

async function earlySignalsSection() {
  const clusters = await clustersSection();
  const items = clusters.filter(isEarlySignal)
    .sort((a, b) => b.first_mover_score - a.first_mover_score || b.breakout_probability - a.breakout_probability);
  return {
    generated_at: nowIso(),
    scan_interval_minutes: 15,
    criteria: 'Tek kaynaklı, rakiplerde henüz görünmeyen ilk yayın fırsatları',
    act_now: items.filter((item) => item.signal_stage === 'act_now').length,
    emerging: items.filter((item) => item.signal_stage === 'emerging').length,
    watch: items.filter((item) => item.signal_stage === 'watch').length,
    items: items.slice(0, 30)
  };
}

async function coverageSection() {
  const [candidates, owned] = await Promise.all([
    recentCandidates(300),
    queryLocal(`SELECT title,url,published_at FROM teknoblog_content ORDER BY published_at DESC NULLS LAST LIMIT 500`)
  ]);
  return candidates.slice(0, 120).map((item) => {
    const left = tokens(item.title);
    let best = null;
    let score = 0;
    for (const post of owned.rows) {
      const value = overlap(left, tokens(post.title));
      if (value > score) { score = value; best = post; }
    }
    const ageDays = best?.published_at ? (Date.now() - new Date(best.published_at).getTime()) / 86400000 : 999;
    const recommendation = score >= 0.72 && ageDays <= 7 ? 'already_covered' : score >= 0.58 ? 'update_existing' : 'new_article';
    return { ...item, match_score: Math.round(score * 100), matched_post: best, recommendation };
  }).sort((a, b) => b.discover_score - a.discover_score);
}

async function sourceHealthSection() {
  const result = await queryLocal(`SELECT s.id,s.name,s.is_active,s.priority_weight,s.trust_score,
    h.last_attempt_at,h.last_success_at,h.last_error,h.last_status,h.consecutive_failures,h.fetched_count,h.inserted_count,h.updated_count,h.duplicate_count,h.image_count,h.avg_latency_ms,
    COALESCE(h.quality_score, CASE WHEN MAX(r.created_at)>NOW()-INTERVAL '24 hours' THEN 75 ELSE 35 END) AS quality_score,
    MAX(r.created_at) AS last_item_at, COUNT(r.id)::int AS stored_items,
    COUNT(r.id) FILTER (WHERE r.image_url IS NOT NULL AND r.image_url<>'')::int AS stored_images
    FROM sources s LEFT JOIN source_health h ON h.source_id=s.id LEFT JOIN raw_feed_items r ON r.source_id=s.id
    GROUP BY s.id,s.name,s.is_active,s.priority_weight,s.trust_score,h.source_id
    ORDER BY quality_score ASC,s.name ASC`);
  return result.rows;
}

async function sourceCoverageGuaranteeSection() {
  const result = await queryLocal(`SELECT s.id,s.name,s.source_type,s.is_active,
    COUNT(DISTINCT r.id) FILTER(WHERE r.created_at>=NOW()-INTERVAL '24 hours')::int AS captured_24h,
    COUNT(DISTINCT c.id) FILTER(WHERE COALESCE(c.published_at,c.created_at)>=NOW()-INTERVAL '24 hours')::int AS candidates_24h,
    COUNT(DISTINCT c.id) FILTER(WHERE COALESCE(c.published_at,c.created_at)>=NOW()-INTERVAL '24 hours' AND GREATEST(c.discover_score,c.traffic_score,c.editorial_score)>=65)::int AS visible_24h,
    MAX(r.created_at) AS last_item_at,MAX(h.last_success_at) AS last_success_at,MAX(h.last_status) AS last_status,
    MAX(h.last_error) AS last_error,MAX(COALESCE(h.quality_score,50))::int AS quality_score
    FROM sources s LEFT JOIN raw_feed_items r ON r.source_id=s.id
    LEFT JOIN topic_candidates c ON c.raw_feed_item_id=r.id
    LEFT JOIN source_health h ON h.source_id=s.id
    WHERE s.is_active=true GROUP BY s.id,s.name,s.source_type,s.is_active ORDER BY s.name`);
  const items = result.rows.map((item) => {
    const captured = Number(item.captured_24h || 0);
    const candidates = Number(item.candidates_24h || 0);
    const visible = Number(item.visible_24h || 0);
    const candidateRate = captured ? Math.round(candidates / captured * 100) : 0;
    const visibilityRate = candidates ? Math.round(visible / candidates * 100) : 0;
    const status = captured === 0 ? 'silent' : candidates === 0 ? 'filtered' : visible === 0 ? 'low_score' : 'covered';
    const reason = status === 'silent' ? (item.last_error || 'Son 24 saatte kaynak akışından içerik alınamadı.') : status === 'filtered' ? 'İçerik alındı ancak aday filtresini geçemedi.' : status === 'low_score' ? 'Adaylar var; üst görünürlük puanını geçemedi.' : `${visible} içerik karar havuzunda görünür.`;
    return { ...item, candidate_rate: candidateRate, visibility_rate: visibilityRate, coverage_status: status, coverage_reason: reason };
  });
  return { generated_at: nowIso(), summary: { active: items.length, covered: items.filter((item) => item.coverage_status === 'covered').length, silent: items.filter((item) => item.coverage_status === 'silent').length, filtered: items.filter((item) => item.coverage_status === 'filtered').length }, items };
}

async function missedOpportunitySection() {
  const result = await queryLocal(`SELECT DISTINCT ON(p.url) p.url,p.title,p.source_name,p.discover_probability,p.news_probability,p.confidence,p.expected_clicks_low,p.expected_clicks_high,p.predicted_at,
    CASE WHEN q.url IS NOT NULL THEN q.status ELSE 'not_queued' END AS queue_status
    FROM content_predictions p LEFT JOIN prediction_outcomes o ON o.prediction_url=p.url
    LEFT JOIN editorial_queue q ON q.url=p.url
    WHERE p.predicted_at>=NOW()-INTERVAL '7 days' AND o.id IS NULL
      AND GREATEST(p.discover_probability,p.news_probability)>=65
      AND (q.url IS NULL OR q.status IN ('skipped','waiting'))
    ORDER BY p.url,p.predicted_at DESC`);
  const items = result.rows.map((item) => ({ ...item, opportunity_score: clamp(Math.max(Number(item.discover_probability || 0), Number(item.news_probability || 0)) * .7 + Number(item.confidence || 0) * .3), reason: item.queue_status === 'skipped' ? 'Yüksek tahmine rağmen geçildi.' : item.queue_status === 'waiting' ? 'Bekletildi; fırsat penceresi yeniden değerlendirilmeli.' : 'Yüksek potansiyel taşıdı ancak Yazılacaklara alınmadı.' }))
    .sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 25);
  return { generated_at: nowIso(), items };
}

function decorateCommandCluster(cluster, strategyKey) {
  const evidence = evidenceLevelFor(cluster);
  const burst = burstForecastFor(cluster);
  const alert = alertLevelFor(cluster);
  const strategyScore = strategyScoreFor(cluster, strategyKey);
  const editorialGap = { score: clamp(100 - Number(cluster.competitor_count || 0) * 22 - (cluster.owned_coverage ? 60 : 0)), label: cluster.owned_coverage ? 'Teknoblog’da kapsandı' : Number(cluster.competitor_count || 0) === 0 ? 'Editoryal boşluk açık' : `${cluster.competitor_count} rakip yazdı` };
  const advantage = Number(cluster.opportunity_minutes || 0) > 0 ? { open: true, minutes: Number(cluster.opportunity_minutes), label: `${cluster.opportunity_minutes} dakikalık ilk yayın penceresi` } : { open: false, minutes: 0, label: 'İlk yayın penceresi kapandı' };
  const pack = editorialPackageFor(cluster);
  return { ...cluster, strategy_score: strategyScore, evidence, burst_forecast: burst, alert_level: alert, editorial_gap: editorialGap, first_publish_advantage: advantage, editorial_package: { ...pack, evidence_note: evidence.label, risk_note: evidence.caution, urgency: alert.label, strategy: (STRATEGY_MODES[strategyKey] || STRATEGY_MODES.balanced).label } };
}

async function commandSection(strategyKey = 'balanced') {
  const strategy = STRATEGY_MODES[strategyKey] ? strategyKey : 'balanced';
  const [clusters, sourceCoverage, missed, queue, today] = await Promise.all([
    clustersSection(), sourceCoverageGuaranteeSection(), missedOpportunitySection(), queueSection(),
    queryLocal(`SELECT COUNT(*)::int AS published FROM teknoblog_content WHERE published_at>=date_trunc('day',NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'`)
  ]);
  const items = clusters.map((cluster) => decorateCommandCluster(cluster, strategy))
    .filter((item) => !item.owned_coverage || item.lifecycle_stage === 'published')
    .sort((a, b) => b.alert_level.rank - a.alert_level.rank || b.strategy_score - a.strategy_score || b.burst_forecast.probability - a.burst_forecast.probability)
    .slice(0, 40);
  const urgent = items.filter((item) => ['red', 'orange'].includes(item.alert_level.key) && item.first_publish_advantage.open);
  const published = Number(today.rows[0]?.published || 0);
  const openQueue = queue.filter((item) => !['published', 'skipped'].includes(item.status)).length;
  const dailySummary = `Bugün Radar ${items.length} güncel konuyu değerlendirdi. ${urgent.length} konu hızlı karar, ${items.filter((item) => item.burst_forecast.probability >= 65).length} konu patlama takibi istiyor. ${sourceCoverage.summary.covered}/${sourceCoverage.summary.active} aktif kaynak karar havuzuna içerik taşıdı. Yazılacaklarda ${openQueue} açık görev, Teknoblog'da bugün ${published} yayın var. ${missed.items.length} yüksek potansiyelli fırsat yeniden incelenmeli.`;
  return { generated_at: nowIso(), strategy: { key: strategy, ...STRATEGY_MODES[strategy] }, strategies: Object.entries(STRATEGY_MODES).map(([key, value]) => ({ key, label: value.label, description: value.description })), summary: { urgent: urgent.length, burst_watch: items.filter((item) => item.burst_forecast.probability >= 65).length, open_advantages: items.filter((item) => item.first_publish_advantage.open).length, sources_covered: sourceCoverage.summary.covered, sources_active: sourceCoverage.summary.active, missed: missed.items.length, queue_open: openQueue, published_today: published }, daily_summary: dailySummary, items, source_coverage: sourceCoverage, missed_opportunities: missed.items };
}

async function queueSection() {
  return (await queryLocal(`SELECT * FROM editorial_queue ORDER BY
    CASE status WHEN 'writing' THEN 1 WHEN 'approved' THEN 2 WHEN 'new' THEN 3 WHEN 'waiting' THEN 4 ELSE 5 END,
    priority DESC,created_at DESC LIMIT 300`)).rows;
}

async function performanceSection() {
  const stored = (await queryLocal(`SELECT * FROM published_performance
    WHERE published_at>=NOW()-INTERVAL '14 days'
    ORDER BY published_at DESC LIMIT 500`)).rows;
  const ranked = stored.map((item) => {
    const ageDays = Math.max(0, (Date.now() - new Date(item.published_at).getTime()) / 86400000);
    const discoverStrength = clamp(Math.log1p(Number(item.discover_clicks) || 0) * 18 + Math.log1p(Number(item.discover_impressions) || 0) * 4 + (Number(item.discover_ctr) || 0) * 18);
    const newsStrength = clamp(Math.log1p(Number(item.google_news_clicks) || 0) * 18 + Math.log1p(Number(item.google_news_impressions) || 0) * 4);
    const webStrength = clamp(Math.log1p(Number(item.web_clicks) || 0) * 11 + Math.log1p(Number(item.web_impressions) || 0) * 2);
    const ga4Strength = clamp(Math.log1p(Number(item.ga4_views) || 0) * 11 + Math.log1p(Number(item.ga4_active_users) || 0) * 8
      + Math.log1p(Number(item.ga4_engagement_seconds) || 0) * 3 + (Number(item.ga4_engagement_rate) || 0) * 18);
    const priority = discoverStrength * 0.42 + newsStrength * 0.24 + ga4Strength * 0.20 + webStrength * 0.06 + Math.max(0, 1 - ageDays / 14) * 8;
    return { ...item, age_days: Math.round(ageDays * 10) / 10, discover_strength: Math.round(discoverStrength), news_strength: Math.round(newsStrength), ga4_strength: Math.round(ga4Strength), performance_priority: Math.min(100, Math.round(priority)) };
  });
  const signaled = ranked.filter((item) => Number(item.discover_impressions) > 0 || Number(item.discover_clicks) > 0 || Number(item.google_news_impressions) > 0 || Number(item.google_news_clicks) > 0 || Number(item.ga4_views) > 0);
  const items = (signaled.length ? signaled : ranked).sort((a, b) => b.performance_priority - a.performance_priority || new Date(b.published_at) - new Date(a.published_at)).slice(0, 100);
  const discoverItems = ranked.filter((item) => Number(item.discover_impressions) > 0 || Number(item.discover_clicks) > 0).sort((a, b) => b.discover_strength - a.discover_strength || new Date(b.published_at) - new Date(a.published_at)).slice(0, 30);
  const newsItems = ranked.filter((item) => Number(item.google_news_impressions) > 0 || Number(item.google_news_clicks) > 0).sort((a, b) => b.news_strength - a.news_strength || new Date(b.published_at) - new Date(a.published_at)).slice(0, 30);
  const analyticsItems = ranked.filter((item) => Number(item.ga4_views) > 0).sort((a, b) => b.ga4_strength - a.ga4_strength || new Date(b.published_at) - new Date(a.published_at)).slice(0, 30);
  const config = await getGoogleConfig();
  const activeModel = await loadIntelligenceModel();
  const configured = Boolean(config.site_url && config.client_id && config.client_secret && config.refresh_token);
  const analyticsConfigured = Boolean(config.analytics_property_id && config.refresh_token);
  return {
    configured, analytics_configured: analyticsConfigured, analytics_property_id: config.analytics_property_id || '', items, discover_items: discoverItems, news_items: newsItems, analytics_items: analyticsItems,
    window_days: 14,
    totals: {
      discover_clicks: ranked.reduce((sum, item) => sum + (Number(item.discover_clicks) || 0), 0),
      discover_impressions: ranked.reduce((sum, item) => sum + (Number(item.discover_impressions) || 0), 0),
      news_clicks: ranked.reduce((sum, item) => sum + (Number(item.google_news_clicks) || 0), 0),
      news_impressions: ranked.reduce((sum, item) => sum + (Number(item.google_news_impressions) || 0), 0),
      ga4_views: ranked.reduce((sum, item) => sum + (Number(item.ga4_views) || 0), 0),
      ga4_active_users: ranked.reduce((sum, item) => sum + (Number(item.ga4_active_users) || 0), 0),
      ga4_engagement_seconds: ranked.reduce((sum, item) => sum + (Number(item.ga4_engagement_seconds) || 0), 0)
    },
    model: activeModel ? { model_version: activeModel.model_version, trained_at: activeModel.trained_at, sample_count: activeModel.sample_count, discover_positive_rate: activeModel.discover_positive_rate, news_positive_rate: activeModel.news_positive_rate, metrics: activeModel.metrics } : null,
    note: configured ? null : 'Google Search Console bağlantısını bu ekrandan güvenli biçimde kurabilirsiniz.'
  };
}

async function accuracySection() {
  await reconcilePredictionOutcomes();
  const [summary, discoverBuckets, newsBuckets, recent, model, feedback] = await Promise.all([
    queryLocal(`SELECT COUNT(*)::int AS matched,
      COUNT(*) FILTER(WHERE observed_at IS NOT NULL)::int AS observed,
      COUNT(*) FILTER(WHERE discover_impressions>=100 OR discover_clicks>=3)::int AS discover_success,
      COUNT(*) FILTER(WHERE news_impressions>=50 OR news_clicks>=2)::int AS news_success,
      ROUND(AVG(discover_probability))::int AS avg_discover_probability,
      ROUND(AVG(news_probability))::int AS avg_news_probability,
      ROUND(AVG(discover_clicks+news_clicks))::int AS avg_actual_clicks,
      ROUND(AVG((expected_clicks_low+expected_clicks_high)/2.0))::int AS avg_expected_clicks
      FROM prediction_outcomes`),
    queryLocal(`SELECT LEAST(90,FLOOR(discover_probability/10)*10)::int AS bucket,COUNT(*)::int AS samples,
      COUNT(*) FILTER(WHERE discover_impressions>=100 OR discover_clicks>=3)::int AS successes,
      ROUND(AVG(discover_clicks))::int AS avg_clicks FROM prediction_outcomes WHERE observed_at IS NOT NULL GROUP BY 1 ORDER BY 1`),
    queryLocal(`SELECT LEAST(90,FLOOR(news_probability/10)*10)::int AS bucket,COUNT(*)::int AS samples,
      COUNT(*) FILTER(WHERE news_impressions>=50 OR news_clicks>=2)::int AS successes,
      ROUND(AVG(news_clicks))::int AS avg_clicks FROM prediction_outcomes WHERE observed_at IS NOT NULL GROUP BY 1 ORDER BY 1`),
    queryLocal(`SELECT o.*,p.title FROM prediction_outcomes o LEFT JOIN teknoblog_content p ON regexp_replace(o.published_url,'/+$','')=regexp_replace(p.url,'/+$','') ORDER BY o.matched_at DESC LIMIT 40`),
    loadIntelligenceModel(),
    queryLocal(`SELECT decision,COUNT(*)::int AS count FROM editorial_feedback GROUP BY decision ORDER BY count DESC`)
  ]);
  const challenger = (await queryLocal(`SELECT model_version,trained_at,sample_count,metrics FROM intelligence_models WHERE status='challenger' ORDER BY trained_at DESC LIMIT 1`)).rows[0] || null;
  return {
    summary: summary.rows[0] || {}, discover_buckets: discoverBuckets.rows, news_buckets: newsBuckets.rows,
    recent: recent.rows, feedback: feedback.rows,
    model: model ? { model_version: model.model_version, trained_at: model.trained_at, sample_count: model.sample_count, metrics: model.metrics } : null,
    challenger
  };
}

async function weeklyReportSection() {
  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [channels, topPosts, outcomes, sources, missed, model] = await Promise.all([
    queryLocal(`SELECT search_type,SUM(clicks)::int AS clicks,SUM(impressions)::int AS impressions FROM performance_snapshots WHERE snapshot_date>=CURRENT_DATE-6 GROUP BY search_type`),
    queryLocal(`SELECT title,url,published_at,discover_clicks,discover_impressions,google_news_clicks,google_news_impressions FROM published_performance WHERE published_at>=NOW()-INTERVAL '7 days' ORDER BY discover_clicks+google_news_clicks DESC LIMIT 20`),
    queryLocal(`SELECT COUNT(*)::int AS matched,COUNT(*) FILTER(WHERE observed_at IS NOT NULL)::int AS observed,ROUND(AVG(discover_clicks+news_clicks))::int AS actual_clicks,ROUND(AVG((expected_clicks_low+expected_clicks_high)/2.0))::int AS expected_clicks FROM prediction_outcomes WHERE matched_at>=NOW()-INTERVAL '7 days'`),
    sourceHealthSection(),
    queryLocal(`SELECT title,url,source_name,discover_probability,news_probability FROM content_predictions p WHERE predicted_at>=NOW()-INTERVAL '7 days' AND discover_probability>=70 AND NOT EXISTS(SELECT 1 FROM prediction_outcomes o WHERE o.prediction_url=p.url) ORDER BY discover_probability DESC LIMIT 20`),
    loadIntelligenceModel()
  ]);
  const words = new Map();
  for (const post of topPosts.rows) for (const word of tokens(post.title).filter((item) => item.length >= 4)) words.set(word, (words.get(word) || 0) + Number(post.discover_clicks || 0) + Number(post.google_news_clicks || 0) + 1);
  const report = {
    week_start: weekStart, channels: channels.rows, top_posts: topPosts.rows, outcomes: outcomes.rows[0] || {},
    best_sources: sources.filter((item) => Number(item.quality_score) >= 60).sort((a, b) => b.quality_score - a.quality_score).slice(0, 10),
    weak_sources: sources.filter((item) => Number(item.quality_score) < 45).slice(0, 10), missed_opportunities: missed.rows,
    winning_topics: [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([topic, score]) => ({ topic, score })),
    model: model ? { model_version: model.model_version, metrics: model.metrics } : null, generated_at: nowIso()
  };
  await queryLocal(`INSERT INTO weekly_intelligence_reports(week_start,report,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(week_start) DO UPDATE SET report=EXCLUDED.report,updated_at=NOW()`, [weekStart, JSON.stringify(report)]);
  return report;
}

async function recalculateSourceQuality() {
  await queryLocal(`WITH stats AS (
    SELECT s.id,COUNT(r.id) FILTER(WHERE r.created_at>=NOW()-INTERVAL '7 days')::float AS items,
      COUNT(r.id) FILTER(WHERE r.created_at>=NOW()-INTERVAL '7 days' AND r.image_url IS NOT NULL AND r.image_url<>'')::float AS images,
      COALESCE(h.consecutive_failures,0) AS failures,COALESCE(h.last_status,'unknown') AS last_status
    FROM sources s LEFT JOIN raw_feed_items r ON r.source_id=s.id LEFT JOIN source_health h ON h.source_id=s.id GROUP BY s.id,h.source_id
  ), quality AS (
    SELECT id,GREATEST(15,LEAST(98,ROUND(35+LEAST(35,items*2)+CASE WHEN items>0 THEN images/items*18 ELSE 0 END-failures*6-CASE WHEN last_status='blocked' THEN 15 ELSE 0 END)))::int AS score FROM stats
  ) UPDATE source_health h SET quality_score=q.score,updated_at=NOW() FROM quality q WHERE h.source_id=q.id`);
  await queryLocal(`UPDATE sources s SET
    trust_score=GREATEST(30,LEAST(100,ROUND(s.trust_score*.8+h.quality_score*.2)))::int,
    priority_weight=GREATEST(35,LEAST(100,ROUND(s.priority_weight*.9+h.quality_score*.1)))::int,
    updated_at=NOW() FROM source_health h WHERE h.source_id=s.id`);
  return { updated: (await queryLocal(`SELECT COUNT(*)::int AS count FROM source_health`)).rows[0]?.count || 0 };
}

async function scoringLabSection() {
  const distribution = await queryLocal(`SELECT
    COUNT(*)::int AS count,
    ROUND(AVG(discover_score))::int AS discover_avg,MIN(discover_score)::int AS discover_min,MAX(discover_score)::int AS discover_max,
    COUNT(DISTINCT discover_score)::int AS discover_distinct,
    ROUND(AVG(traffic_score))::int AS traffic_avg,MIN(traffic_score)::int AS traffic_min,MAX(traffic_score)::int AS traffic_max,
    COUNT(DISTINCT traffic_score)::int AS traffic_distinct,
    COUNT(*) FILTER(WHERE discover_score=100)::int AS discover_100,
    COUNT(*) FILTER(WHERE traffic_score=100)::int AS traffic_100
    FROM topic_candidates WHERE status='active' AND COALESCE(published_at,created_at)>=NOW()-INTERVAL '7 days'`);
  const sources = await queryLocal(`SELECT source_name,COUNT(*)::int AS items,ROUND(AVG(discover_score))::int AS discover_avg,
    ROUND(AVG(traffic_score))::int AS traffic_avg FROM topic_candidates
    WHERE status='active' AND COALESCE(published_at,created_at)>=NOW()-INTERVAL '7 days'
    GROUP BY source_name ORDER BY items DESC LIMIT 30`);
  return { distribution: distribution.rows[0], sources: sources.rows, model: 'calibrated_v2' };
}

function diskStatus() {
  try {
    const stat = fs.statfsSync('/');
    const total = Number(stat.blocks) * Number(stat.bsize);
    const available = Number(stat.bavail) * Number(stat.bsize);
    return { total_bytes: total, available_bytes: available, used_percent: Math.round((1 - available / total) * 100) };
  } catch { return null; }
}

async function summarySection() {
  const [counts, queue, health, clusters, performance] = await Promise.all([
    queryLocal(`SELECT
      (SELECT COUNT(*) FROM topic_candidates WHERE status='active' AND COALESCE(published_at,created_at)>=NOW()-INTERVAL '24 hours')::int AS fresh_candidates,
      (SELECT COUNT(*) FROM sources WHERE is_active=true)::int AS active_sources,
      (SELECT COUNT(*) FROM editorial_queue WHERE status NOT IN ('published','skipped'))::int AS queue_open,
      (SELECT COUNT(*) FROM raw_feed_items WHERE image_url IS NOT NULL AND image_url<>'' AND created_at>=NOW()-INTERVAL '24 hours')::int AS images_24h,
      (SELECT COUNT(*) FROM teknoblog_content WHERE published_at>=date_trunc('day',NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')::int AS published_today`),
    queueSection(), sourceHealthSection(), clustersSection(), performanceSection()
  ]);
  return { ...counts.rows[0], queue_progress: { total: queue.length, completed: queue.filter((item) => item.status === 'published').length }, unhealthy_sources: health.filter((item) => Number(item.quality_score) < 45).slice(0, 10), rising_clusters: risingClusters(clusters).slice(0, 8), first_mover_opportunities: clusters.filter(isEarlySignal).slice(0, 8), performance_configured: performance.configured, disk: diskStatus(), generated_at: nowIso() };
}

async function syncGsc() {
  const config = await getGoogleConfig();
  const site = config.site_url || '';
  const token = await googleAccessToken();
  if (!site || !token) throw new Error('Search Console bağlantı bilgileri eksik.');
  const end = new Date();
  const existing = await queryLocal(`SELECT MAX(snapshot_date) AS latest FROM performance_snapshots`);
  const historyDays = existing.rows[0]?.latest ? 8 : 90;
  const start = new Date(Date.now() - historyDays * 86400000);
  const fmt = (date) => date.toISOString().slice(0, 10);
  const combined = new Map();
  const snapshots = [];
  for (const type of ['discover', 'googleNews', 'web']) {
    const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ['date','page'], type, dataState: 'all', rowLimit: 25000 }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `Search Console ${type} HTTP ${response.status}`);
    for (const row of data.rows || []) {
      const snapshotDate = row.keys?.[0]; const url = row.keys?.[1]; if (!url || !snapshotDate) continue;
      snapshots.push({ url, snapshot_date: snapshotDate, search_type: type, clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0, position: row.position || 0 });
      const current = combined.get(url) || { url };
      const aggregate = current[type] || { clicks: 0, impressions: 0, ctr: 0 };
      aggregate.clicks += row.clicks || 0; aggregate.impressions += row.impressions || 0;
      aggregate.ctr = aggregate.impressions ? aggregate.clicks / aggregate.impressions : 0;
      current[type] = aggregate;
      combined.set(url, current);
    }
  }
  for (let offset = 0; offset < snapshots.length; offset += 1000) {
    const chunk = snapshots.slice(offset, offset + 1000);
    await queryLocal(`INSERT INTO performance_snapshots(url,snapshot_date,search_type,clicks,impressions,ctr,position,synced_at)
      SELECT x.url,x.snapshot_date,x.search_type,x.clicks,x.impressions,x.ctr,x.position,NOW()
      FROM jsonb_to_recordset($1::jsonb) AS x(url text,snapshot_date date,search_type text,clicks float,impressions float,ctr float,position float)
      ON CONFLICT(url,snapshot_date,search_type) DO UPDATE SET clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,ctr=EXCLUDED.ctr,position=EXCLUDED.position,synced_at=NOW()`, [JSON.stringify(chunk)]);
  }
  for (const item of combined.values()) {
    await queryLocal(`INSERT INTO published_performance(url,discover_clicks,discover_impressions,discover_ctr,google_news_clicks,google_news_impressions,web_clicks,web_impressions,observed_at,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9) ON CONFLICT(url) DO UPDATE SET
      discover_clicks=EXCLUDED.discover_clicks,discover_impressions=EXCLUDED.discover_impressions,discover_ctr=EXCLUDED.discover_ctr,
      google_news_clicks=EXCLUDED.google_news_clicks,google_news_impressions=EXCLUDED.google_news_impressions,web_clicks=EXCLUDED.web_clicks,web_impressions=EXCLUDED.web_impressions,observed_at=NOW(),payload=EXCLUDED.payload`,
    [item.url, item.discover?.clicks || 0, item.discover?.impressions || 0, item.discover?.ctr || 0, item.googleNews?.clicks || 0, item.googleNews?.impressions || 0, item.web?.clicks || 0, item.web?.impressions || 0, JSON.stringify(item)]);
  }
  await queryLocal(`UPDATE published_performance p SET title=t.title,published_at=t.published_at
    FROM teknoblog_content t
    WHERE regexp_replace(p.url,'/+$','')=regexp_replace(t.url,'/+$','')
      AND (p.title IS NULL OR p.title='' OR p.published_at IS NULL)`);
  const outcomes = await reconcilePredictionOutcomes();
  const trained = await trainIntelligenceModel();
  return { urls: combined.size, snapshots: snapshots.length, history_days: historyDays, outcomes, trained };
}

function ga4Date(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : '';
}

function istanbulDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

async function ga4Report(propertyId, token, body) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Google Analytics Data API HTTP ${response.status}`);
  return data;
}

async function syncGa4Impl(options = {}) {
  const config = await getGoogleConfig();
  const propertyId = String(config.analytics_property_id || '').replace(/^properties\//, '').trim();
  if (!propertyId) throw new Error('Google Analytics bağlantısı veya GA4 Mülk Kimliği eksik.');
  const todayOnly = Boolean(options.todayOnly);
  const endDate = istanbulDate();
  if (todayOnly) {
    const latest = await queryLocal(`SELECT synced_at FROM analytics_daily_totals WHERE snapshot_date=$1::date LIMIT 1`, [endDate]);
    const syncedAt = latest.rows[0]?.synced_at ? new Date(latest.rows[0].synced_at).getTime() : 0;
    if (syncedAt && Date.now() - syncedAt < 4 * 60 * 1000) return { skipped: true, reason: 'GA4 verisi zaten güncel.', today_only: true, property_id: propertyId };
  }
  const token = await googleAccessToken();
  if (!token) throw new Error('Google Analytics bağlantısı veya GA4 Mülk Kimliği eksik.');
  const known = await queryLocal(`SELECT url,title,published_at FROM teknoblog_content WHERE published_at>=NOW()-INTERVAL '120 days' ORDER BY published_at DESC LIMIT 15000`);
  const knownByCanonical = new Map(known.rows.map((item) => [canonicalUrl(item.url), item]));
  const existing = await queryLocal(`SELECT MAX(snapshot_date) AS latest FROM analytics_performance_snapshots`);
  const historyDays = todayOnly ? 1 : (existing.rows[0]?.latest ? 8 : 90);
  const startBase = new Date(`${endDate}T12:00:00Z`);
  startBase.setUTCDate(startBase.getUTCDate() - Math.max(0, historyDays - 1));
  const startDate = istanbulDate(startBase);
  const data = await ga4Report(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }, { name: 'pagePathPlusQueryString' }, { name: 'pageTitle' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'sessions' }, { name: 'engagedSessions' }, { name: 'userEngagementDuration' }, { name: 'engagementRate' }],
    limit: '100000', keepEmptyRows: false
  });
  const dailyData = await ga4Report(propertyId, token, {
    dateRanges: [{ startDate, endDate }], dimensions: [{ name: 'date' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'sessions' }, { name: 'engagedSessions' }, { name: 'userEngagementDuration' }, { name: 'engagementRate' }],
    limit: '1000', keepEmptyRows: false
  });
  const snapshots = new Map();
  const totals = new Map();
  for (const row of data.rows || []) {
    const date = ga4Date(row.dimensionValues?.[0]?.value);
    const path = String(row.dimensionValues?.[1]?.value || '').split('?')[0];
    const pageTitle = String(row.dimensionValues?.[2]?.value || '');
    const canonical = canonicalUrl(`https://www.teknoblog.com${path.startsWith('/') ? path : `/${path}`}`);
    const post = knownByCanonical.get(canonical);
    if (!date || !post) continue;
    const values = (row.metricValues || []).map((entry) => Number(entry.value) || 0);
    const record = { url: post.url, snapshot_date: date, page_title: pageTitle || post.title || '', views: values[0], active_users: values[1], sessions: values[2], engaged_sessions: values[3], engagement_seconds: values[4], engagement_rate: values[5] };
    const key = `${post.url}\n${date}`;
    const day = snapshots.get(key) || { ...record, views: 0, active_users: 0, sessions: 0, engaged_sessions: 0, engagement_seconds: 0, engagement_rate: 0 };
    day.views += record.views; day.active_users += record.active_users; day.sessions += record.sessions; day.engaged_sessions += record.engaged_sessions; day.engagement_seconds += record.engagement_seconds;
    day.engagement_rate = day.sessions ? day.engaged_sessions / day.sessions : record.engagement_rate;
    snapshots.set(key, day);
  }
  for (const record of snapshots.values()) {
    const total = totals.get(record.url) || { url: record.url, views: 0, active_users: 0, sessions: 0, engaged_sessions: 0, engagement_seconds: 0, engagement_rate: 0 };
    total.views += record.views; total.active_users += record.active_users; total.sessions += record.sessions; total.engaged_sessions += record.engaged_sessions; total.engagement_seconds += record.engagement_seconds;
    total.engagement_rate = total.sessions ? total.engaged_sessions / total.sessions : 0;
    totals.set(record.url, total);
  }
  const snapshotRows = [...snapshots.values()];
  for (let offset = 0; offset < snapshotRows.length; offset += 1000) {
    const chunk = snapshotRows.slice(offset, offset + 1000);
    await queryLocal(`INSERT INTO analytics_performance_snapshots(url,snapshot_date,page_title,views,active_users,sessions,engaged_sessions,engagement_seconds,engagement_rate,synced_at)
      SELECT x.url,x.snapshot_date,x.page_title,x.views,x.active_users,x.sessions,x.engaged_sessions,x.engagement_seconds,x.engagement_rate,NOW()
      FROM jsonb_to_recordset($1::jsonb) AS x(url text,snapshot_date date,page_title text,views float,active_users float,sessions float,engaged_sessions float,engagement_seconds float,engagement_rate float)
      ON CONFLICT(url,snapshot_date) DO UPDATE SET page_title=EXCLUDED.page_title,views=EXCLUDED.views,active_users=EXCLUDED.active_users,sessions=EXCLUDED.sessions,engaged_sessions=EXCLUDED.engaged_sessions,engagement_seconds=EXCLUDED.engagement_seconds,engagement_rate=EXCLUDED.engagement_rate,synced_at=NOW()`, [JSON.stringify(chunk)]);
  }
  for (const row of dailyData.rows || []) {
    const date = ga4Date(row.dimensionValues?.[0]?.value);
    if (!date) continue;
    const values = (row.metricValues || []).map((entry) => Number(entry.value) || 0);
    await queryLocal(`INSERT INTO analytics_daily_totals(snapshot_date,views,active_users,sessions,engaged_sessions,engagement_seconds,engagement_rate,synced_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(snapshot_date) DO UPDATE SET
      views=EXCLUDED.views,active_users=EXCLUDED.active_users,sessions=EXCLUDED.sessions,engaged_sessions=EXCLUDED.engaged_sessions,
      engagement_seconds=EXCLUDED.engagement_seconds,engagement_rate=EXCLUDED.engagement_rate,synced_at=NOW()`,
    [date, values[0], values[1], values[2], values[3], values[4], values[5]]);
  }
  let performanceTotals = totals;
  if (todayOnly && totals.size) {
    const affectedUrls = [...totals.keys()];
    const aggregate = await queryLocal(`SELECT url,SUM(views) AS views,SUM(active_users) AS active_users,SUM(sessions) AS sessions,
      SUM(engaged_sessions) AS engaged_sessions,SUM(engagement_seconds) AS engagement_seconds,
      CASE WHEN SUM(sessions)>0 THEN SUM(engaged_sessions)/SUM(sessions) ELSE 0 END AS engagement_rate
      FROM analytics_performance_snapshots WHERE snapshot_date>=$2::date-INTERVAL '7 days' AND url=ANY($1::text[]) GROUP BY url`, [affectedUrls, endDate]);
    performanceTotals = new Map(aggregate.rows.map((item) => [item.url, item]));
  }
  for (const item of performanceTotals.values()) {
    await queryLocal(`INSERT INTO published_performance(url,ga4_views,ga4_active_users,ga4_sessions,ga4_engaged_sessions,ga4_engagement_seconds,ga4_engagement_rate,observed_at,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),jsonb_build_object('ga4',$8::jsonb)) ON CONFLICT(url) DO UPDATE SET
      ga4_views=EXCLUDED.ga4_views,ga4_active_users=EXCLUDED.ga4_active_users,ga4_sessions=EXCLUDED.ga4_sessions,
      ga4_engaged_sessions=EXCLUDED.ga4_engaged_sessions,ga4_engagement_seconds=EXCLUDED.ga4_engagement_seconds,
      ga4_engagement_rate=EXCLUDED.ga4_engagement_rate,observed_at=NOW(),payload=COALESCE(published_performance.payload,'{}'::jsonb)||EXCLUDED.payload`,
    [item.url, item.views, item.active_users, item.sessions, item.engaged_sessions, item.engagement_seconds, item.engagement_rate, JSON.stringify(item)]);
  }
  await queryLocal(`UPDATE published_performance p SET title=t.title,published_at=t.published_at FROM teknoblog_content t
    WHERE regexp_replace(p.url,'/+$','')=regexp_replace(t.url,'/+$','') AND (p.title IS NULL OR p.title='' OR p.published_at IS NULL)`);
  return { urls: totals.size, snapshots: snapshotRows.length, daily_totals: dailyData.rows?.length || 0, history_days: historyDays, today_only: todayOnly, property_id: propertyId };
}

let ga4SyncPromise = null;
async function syncGa4(options = {}) {
  if (ga4SyncPromise) return ga4SyncPromise;
  ga4SyncPromise = syncGa4Impl(options);
  try { return await ga4SyncPromise; }
  finally { ga4SyncPromise = null; }
}

async function queueAction(body) {
  const url = String(body.url || '').trim();
  if (!url) throw new Error('url gerekli');
  const result = await queryLocal(`INSERT INTO editorial_queue(candidate_id,title,url,source_name,image_url,status,priority,notes,assigned_to,published_url,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) ON CONFLICT(url) DO UPDATE SET
    title=EXCLUDED.title,source_name=EXCLUDED.source_name,image_url=EXCLUDED.image_url,status=EXCLUDED.status,
    priority=EXCLUDED.priority,notes=EXCLUDED.notes,assigned_to=EXCLUDED.assigned_to,published_url=COALESCE(EXCLUDED.published_url,editorial_queue.published_url),updated_at=NOW(),
    completed_at=CASE WHEN EXCLUDED.status='published' THEN NOW() ELSE editorial_queue.completed_at END RETURNING *`,
  [body.candidate_id || null, body.title || 'Başlıksız', url, body.source_name || '', body.image_url || '', body.status || 'new', clamp(body.priority || 50), body.notes || '', body.assigned_to || '', body.published_url || null]);
  const features = extractIntelligenceFeatures({ title: body.title, source_name: body.source_name, image_url: body.image_url }).features;
  await queryLocal(`INSERT INTO editorial_feedback(url,title,source_name,decision,reason_code,cluster_key,notes,features) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [url, body.title || 'Başlıksız', body.source_name || '', body.status || 'new', body.reason_code || null, body.cluster_key || null, body.notes || '', JSON.stringify(features)]);
  if (body.status === 'published') Promise.resolve().then(() => reconcilePredictionOutcomes()).catch(() => {});
  return result.rows[0];
}

async function queueBulkStatusAction(body) {
  const allowed = new Set(['approved', 'writing', 'published', 'waiting', 'skipped']);
  const status = String(body.status || '').trim();
  if (!allowed.has(status)) throw new Error('Geçersiz toplu durum');
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : []).map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 300);
  if (!urls.length) throw new Error('En az bir görev seçilmeli');
  const result = await queryLocal(`UPDATE editorial_queue SET status=$1,updated_at=NOW(),
    completed_at=CASE WHEN $1='published' THEN COALESCE(completed_at,NOW()) ELSE NULL END
    WHERE url=ANY($2::text[]) RETURNING *`, [status, urls]);
  if (result.rows.length) {
    await queryLocal(`INSERT INTO editorial_feedback(url,title,source_name,decision,reason_code,notes,features)
      SELECT q.url,q.title,COALESCE(q.source_name,''),$1,$2,'Hızlı/toplu Yazılacaklar işlemi','{}'::jsonb
      FROM editorial_queue q WHERE q.url=ANY($3::text[])`, [status, `queue_bulk_${status}`, urls]);
  }
  if (status === 'published') Promise.resolve().then(() => reconcilePredictionOutcomes()).catch(() => {});
  return { status, updated: result.rows.length, items: result.rows };
}

async function feedbackAction(body) {
  const url = String(body.url || '').trim();
  if (!url) throw new Error('url gerekli');
  const decision = String(body.decision || '').trim();
  if (!['useful', 'waiting', 'skipped', 'duplicate', 'unreliable'].includes(decision)) throw new Error('Geçersiz değerlendirme');
  const features = extractIntelligenceFeatures({ title: body.title, source_name: body.source_name, image_url: body.image_url }).features;
  const result = await queryLocal(`INSERT INTO editorial_feedback(url,title,source_name,decision,reason_code,cluster_key,notes,features)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [url, body.title || '', body.source_name || '', decision, body.reason_code || decision, body.cluster_key || null, body.notes || '', JSON.stringify(features)]);
  return result.rows[0];
}

async function watchlistAction(body) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('İzleme listesi adı gerekli');
  const keywords = Array.isArray(body.keywords) ? body.keywords : String(body.keywords || '').split(',').map((item) => item.trim()).filter(Boolean);
  const beats = Array.isArray(body.beats) ? body.beats : [];
  const result = await queryLocal(`INSERT INTO radar_watchlists(name,keywords,beats,source_ids,alert_threshold,is_active,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(name) DO UPDATE SET keywords=EXCLUDED.keywords,beats=EXCLUDED.beats,
    source_ids=EXCLUDED.source_ids,alert_threshold=EXCLUDED.alert_threshold,is_active=EXCLUDED.is_active,updated_at=NOW() RETURNING *`,
  [name, JSON.stringify(keywords), JSON.stringify(beats), JSON.stringify(body.source_ids || []), clamp(body.alert_threshold || 65), body.is_active !== false]);
  return result.rows[0];
}

function slackReferenceUrl(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function slackReferenceLabel(value = '') {
  return String(value || '')
    .replace(/[<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

function alertReferences(alert) {
  const payload = alert?.payload || {};
  const candidates = [
    ...(Array.isArray(payload.editorial_package?.references) ? payload.editorial_package.references : []),
    ...(Array.isArray(payload.source_timeline) ? payload.source_timeline : []),
    ...(Array.isArray(payload.references) ? payload.references : []),
    ...(Array.isArray(payload.items) ? payload.items : []),
    ...(payload.url ? [payload] : [])
  ];
  const seen = new Set();
  const references = [];
  for (const candidate of candidates) {
    const url = slackReferenceUrl(candidate?.url || candidate?.link || candidate?.canonical_url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    references.push({
      url,
      source: slackReferenceLabel(candidate?.source_name || candidate?.source || candidate?.publisher || 'Kaynak'),
      title: slackReferenceLabel(candidate?.title || '')
    });
    if (references.length >= 6) break;
  }
  return references;
}

export function buildSlackAlertText(alerts = []) {
  const labels = { first_mover: '🚨 İlk yayın fırsatı', momentum: '📈 Hızlanıyor', deadline: '⏱️ Fırsat penceresi kapanıyor', watchlist: '🎯 İzleme listesi eşleşmesi', corroborated: '✅ İkinci kaynak doğruladı', queue_stale: '⏳ Görev bekliyor' };
  const blocks = alerts.slice(0, 12).map((alert) => {
    const detail = alert.type === 'first_mover'
      ? ` · Öncülük ${alert.payload?.first_mover_score ?? '—'} · Rakip ${alert.payload?.competitor_count ?? '—'}`
      : alert.type === 'deadline'
        ? ` · ${alert.payload?.opportunity_minutes ?? '—'} dakika kaldı`
        : '';
    const references = alertReferences(alert);
    const referenceLines = references.map((reference, index) => {
      const label = [reference.source, reference.title].filter(Boolean).join(' — ') || `Referans ${index + 1}`;
      return `   ${index + 1}. <${reference.url}|${label}>`;
    });
    return [
      `• ${alert.payload?.alert_level?.label ? `[${alert.payload.alert_level.label}] ` : ''}${labels[alert.type] || 'Radar uyarısı'}: ${slackReferenceLabel(alert.title)}${detail}`,
      ...(referenceLines.length ? ['  *Referans haberler:*', ...referenceLines] : [])
    ].join('\n');
  });
  return ['*Teknoblog Radar · Öncü Haber Uyarıları*', ...blocks].join('\n\n');
}

const DEFAULT_SIGNAL_CHANNEL_ID = 'C0BJDQXRFA6';

async function slackApi(method, token, body) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || `Slack API HTTP ${response.status}`);
    error.slackCode = data.error || '';
    throw error;
  }
  return data;
}

async function sendSignalAlertMessage(text) {
  const stored = process.env.SLACK_SINYAL_WEBHOOK_URL ? {} : await getAppSecret('slack_signal');
  const webhook = String(process.env.SLACK_SINYAL_WEBHOOK_URL || stored.webhook_url || '').trim();
  if (webhook) {
    const response = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!response.ok) throw new Error((await response.text().catch(() => '')) || `Slack webhook HTTP ${response.status}`);
    return { sent: true, route: '#sinyal', mode: 'signal_webhook' };
  }

  const token = String(process.env.SLACK_BOT_TOKEN || '').trim();
  const channel = String(process.env.SLACK_SINYAL_CHANNEL_ID || DEFAULT_SIGNAL_CHANNEL_ID).trim();
  if (!token) return { sent: false, route: '#sinyal', mode: 'not_configured', error: 'SLACK_SINYAL_WEBHOOK_URL veya SLACK_BOT_TOKEN tanımlı değil' };
  try {
    await slackApi('chat.postMessage', token, { channel, text });
  } catch (error) {
    if (error.slackCode !== 'not_in_channel') throw error;
    await slackApi('conversations.join', token, { channel });
    await slackApi('chat.postMessage', token, { channel, text });
  }
  return { sent: true, route: '#sinyal', mode: 'bot' };
}

async function configureSignalSlack(body) {
  const webhookUrl = String(body.webhook_url || '').trim();
  if (!/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(webhookUrl)) {
    throw new Error('Geçersiz Slack incoming webhook adresi.');
  }
  await saveAppSecret('slack_signal', {
    webhook_url: webhookUrl,
    channel_id: DEFAULT_SIGNAL_CHANNEL_ID,
    channel_name: '#sinyal',
    configured_at: nowIso()
  });
  return { configured: true, route: '#sinyal', mode: 'encrypted_database_secret' };
}

async function runAlerts() {
  const clusters = (await clustersSection()).map((item) => ({ ...item, alert_level: alertLevelFor(item), burst_forecast: burstForecastFor(item), evidence: evidenceLevelFor(item) }));
  const stale = (await queryLocal(`SELECT * FROM editorial_queue WHERE status NOT IN ('published','skipped') AND created_at<NOW()-INTERVAL '2 hours' ORDER BY priority DESC LIMIT 10`)).rows;
  const recentEvents = (await queryLocal(`SELECT * FROM cluster_lifecycle_events WHERE occurred_at>=NOW()-INTERVAL '30 minutes' ORDER BY occurred_at DESC LIMIT 50`)).rows;
  const drift = (await queryLocal(`SELECT COUNT(*)::int AS observed,AVG(discover_probability)/100.0 AS predicted,
    AVG(CASE WHEN discover_impressions>=100 OR discover_clicks>=3 THEN 1 ELSE 0 END) AS actual FROM prediction_outcomes WHERE observed_at>=NOW()-INTERVAL '30 days'`)).rows[0] || {};
  const driftGap = Math.abs(Number(drift.predicted || 0) - Number(drift.actual || 0));
  const alerts = [
    ...clusters.filter((item) => isEarlySignal(item) && item.first_mover_score >= 70).slice(0, 8).map((item) => ({ type: 'first_mover', key: `first-mover:${item.cluster_key}:${new Date().toISOString().slice(0,13)}`, title: item.cluster_name, payload: item })),
    ...risingClusters(clusters).filter((item) => item.momentum_score >= 55).slice(0, 8).map((item) => ({ type: 'momentum', key: `momentum:${item.cluster_key}:${new Date().toISOString().slice(0,13)}`, title: item.cluster_name, payload: item })),
    ...clusters.filter((item) => item.opportunity_minutes > 0 && item.opportunity_minutes <= 30 && !item.owned_coverage).slice(0, 8).map((item) => ({ type: 'deadline', key: `deadline:${item.cluster_key}:${new Date().toISOString().slice(0,13)}`, title: item.cluster_name, payload: item })),
    ...clusters.filter((item) => item.watchlists?.length && item.first_mover_score >= 65 && item.opportunity_minutes > 0).slice(0, 8).map((item) => ({ type: 'watchlist', key: `watchlist:${item.cluster_key}:${new Date().toISOString().slice(0,13)}`, title: item.cluster_name, payload: item })),
    ...recentEvents.filter((item) => ['corroborated', 'accelerating'].includes(item.to_stage)).map((item) => ({ type: 'corroborated', key: `corroborated:${item.cluster_key}:${new Date(item.occurred_at).toISOString().slice(0,13)}`, title: item.payload?.title || item.cluster_key, payload: item.payload || item })),
    ...stale.map((item) => ({ type: 'queue_stale', key: `queue:${item.id}:${new Date().toISOString().slice(0,10)}`, title: item.title, payload: item })),
    ...(Number(drift.observed || 0) >= 20 && driftGap >= .2 ? [{ type: 'model_drift', key: `drift:${new Date().toISOString().slice(0,10)}`, title: `Discover tahmin sapması %${Math.round(driftGap * 100)}`, payload: drift }] : [])
  ];
  let created = 0;
  for (const alert of alerts) {
    const result = await queryLocal(`INSERT INTO smart_alerts(alert_key,alert_type,title,payload) VALUES($1,$2,$3,$4) ON CONFLICT(alert_key) DO NOTHING RETURNING id`, [alert.key, alert.type, alert.title, JSON.stringify(alert.payload)]);
    created += result.rowCount;
  }
  const pending = (await queryLocal(`SELECT id,alert_type AS type,title,payload FROM smart_alerts
    WHERE COALESCE(status,'pending')<>'sent' AND created_at>=NOW()-INTERVAL '6 hours'
    ORDER BY created_at ASC LIMIT 12`)).rows;
  let delivery = { sent: false, route: '#sinyal', mode: 'no_pending_alerts' };
  if (pending.length) {
    try {
      delivery = await sendSignalAlertMessage(buildSlackAlertText(pending));
      if (delivery.sent) await queryLocal(`UPDATE smart_alerts SET status='sent',sent_at=NOW() WHERE id=ANY($1::bigint[])`, [pending.map((alert) => alert.id)]);
    } catch (error) {
      delivery = { sent: false, route: '#sinyal', mode: 'delivery_error', error: error?.message || String(error) };
    }
  }
  return { candidates: alerts.length, created, pending: pending.length, slack_sent: delivery.sent, slack_route: delivery.route, slack_mode: delivery.mode, slack_error: delivery.error || null };
}

async function maintenance() {
  const result = {};
  result.raw = (await queryLocal(`DELETE FROM raw_feed_items WHERE created_at<NOW()-INTERVAL '45 days' RETURNING id`)).rowCount;
  result.candidates = (await queryLocal(`DELETE FROM topic_candidates WHERE created_at<NOW()-INTERVAL '45 days' RETURNING id`)).rowCount;
  result.pipeline_runs = (await queryLocal(`DELETE FROM pipeline_runs WHERE created_at<NOW()-INTERVAL '30 days' AND status<>'running' RETURNING id`)).rowCount;
  result.alerts = (await queryLocal(`DELETE FROM smart_alerts WHERE created_at<NOW()-INTERVAL '30 days' RETURNING id`)).rowCount;
  result.early_signal_snapshots = (await queryLocal(`DELETE FROM early_signal_snapshots WHERE capture_bucket<NOW()-INTERVAL '14 days' RETURNING id`)).rowCount;
  result.lifecycle_events = (await queryLocal(`DELETE FROM cluster_lifecycle_events WHERE occurred_at<NOW()-INTERVAL '60 days' RETURNING id`)).rowCount;
  result.source_quality = await recalculateSourceQuality();
  result.weekly_report = await weeklyReportSection();
  result.disk = diskStatus();
  return result;
}

async function checkImages() {
  const rows = (await queryLocal(`SELECT DISTINCT image_url FROM topic_candidates WHERE image_url IS NOT NULL AND image_url<>'' ORDER BY image_url LIMIT 20`)).rows;
  const results = [];
  for (const row of rows) {
    let status = 'failed', type = '', length = 0;
    try {
      const response = await fetch(row.image_url, { method: 'HEAD', signal: AbortSignal.timeout(5000), redirect: 'follow' });
      type = response.headers.get('content-type') || '';
      length = Number(response.headers.get('content-length') || 0);
      status = response.ok && type.startsWith('image/') ? 'ready' : 'invalid';
    } catch {}
    await queryLocal(`INSERT INTO image_checks(url,status,content_type,content_length,checked_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(url) DO UPDATE SET status=EXCLUDED.status,content_type=EXCLUDED.content_type,content_length=EXCLUDED.content_length,checked_at=NOW()`, [row.image_url, status, type, length]);
    results.push({ url: row.image_url, status, content_type: type, content_length: length });
  }
  return results;
}

export default async function handler(req, res) {
  try {
    const section = String(req.query?.section || 'summary');
    if (req.method === 'GET') {
      if (section === 'summary') return json(res, 200, { data: await summarySection() });
      if (section === 'command') return json(res, 200, await commandSection(String(req.query?.strategy || 'balanced')));
      if (section === 'early-signals') return json(res, 200, await earlySignalsSection());
      if (section === 'clusters') {
        const items = risingClusters(await clustersSection());
        return json(res, 200, { criteria: 'En az iki bağımsız kaynakla doğrulanan, ivmesine göre sıralanan konu kümeleri', items: items.slice(0, 40) });
      }
      if (section === 'lifecycle') return json(res, 200, await lifecycleSection());
      if (section === 'leadership') return json(res, 200, await leadershipSection());
      if (section === 'watchlists') return json(res, 200, await watchlistsSection());
      if (section === 'pioneer-metrics') return json(res, 200, await pioneerMetricsSection());
      if (section === 'coverage') return json(res, 200, { items: await coverageSection() });
      if (section === 'queue') {
        const [items, automation] = await Promise.all([queueSection(), queueAutomationStatus()]);
        return json(res, 200, { items, automation });
      }
      if (section === 'sources') return json(res, 200, { items: await sourceHealthSection() });
      if (section === 'source-coverage') return json(res, 200, await sourceCoverageGuaranteeSection());
      if (section === 'missed-opportunities') return json(res, 200, await missedOpportunitySection());
      if (section === 'performance') return json(res, 200, await performanceSection());
      if (section === 'accuracy') return json(res, 200, await accuracySection());
      if (section === 'weekly-report') return json(res, 200, await weeklyReportSection());
      if (section === 'scoring-lab') return json(res, 200, await scoringLabSection());
      if (section === 'system') return json(res, 200, { disk: diskStatus(), alerts: (await queryLocal(`SELECT * FROM smart_alerts ORDER BY created_at DESC LIMIT 50`)).rows, images: (await queryLocal(`SELECT * FROM image_checks ORDER BY checked_at DESC LIMIT 50`)).rows });
      return json(res, 404, { error: 'Bölüm bulunamadı' });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = bodyOf(req);
    if (body.action === 'queue_upsert') return json(res, 200, { item: await queueAction(body) });
    if (body.action === 'queue_bulk_status') return json(res, 200, await queueBulkStatusAction(body));
    if (body.action === 'feedback_record') return json(res, 200, { item: await feedbackAction(body) });
    if (!authorized(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    if (body.action === 'watchlist_upsert') return json(res, 200, { item: await watchlistAction(body) });
    if (body.action === 'sync_teknoblog') {
      const maxPages = Math.max(1, Math.min(20, Number(body.max_pages) || 20));
      return json(res, 200, { ok: true, stored: await syncTeknoblog(maxPages), pages: maxPages });
    }
    if (body.action === 'reconcile_queue_publications') return json(res, 200, { ok: true, ...(await reconcileQueuePublications()) });
    if (body.action === 'sync_gsc') return json(res, 200, { ok: true, stored: await syncGsc() });
    if (body.action === 'sync_ga4') return json(res, 200, { ok: true, stored: await syncGa4() });
    if (body.action === 'sync_ga4_live') return json(res, 200, { ok: true, stored: await syncGa4({ todayOnly: true }) });
    if (body.action === 'sync_performance') {
      const [gsc, ga4] = await Promise.all([syncGsc(), syncGa4()]);
      return json(res, 200, { ok: true, gsc, ga4 });
    }
    if (body.action === 'train_model') return json(res, 200, { ok: true, model: await trainIntelligenceModel() });
    if (body.action === 'configure_signal_slack') return json(res, 200, { ok: true, ...(await configureSignalSlack(body)) });
    if (body.action === 'run_alerts') return json(res, 200, { ok: true, ...(await runAlerts()) });
    if (body.action === 'maintenance') return json(res, 200, { ok: true, ...(await maintenance()) });
    if (body.action === 'check_images') return json(res, 200, { ok: true, items: await checkImages() });
    return json(res, 400, { error: 'Bilinmeyen işlem' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), at: nowIso() });
  }
}
