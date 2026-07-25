import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { json, queryLocal, safeText, nowIso } from './_lib.js';
import { getGoogleConfig, googleAccessToken } from './_google-auth.js';
import { getAppSecret, saveAppSecret } from './_app-secrets.js';
import { extractIntelligenceFeatures, loadIntelligenceModel, trainIntelligenceModel } from './_intelligence-model.js';

const STOP = new Set('ve veya ile için bir bu şu daha yeni son ilk olan olarak göre sonra önce hakkında üzerinde geliyor geldi olacak oldu neden nasıl hangi ne zaman teknoloji tech says report reportedly could may its the and for from with that this have has will into over after before'.split(' '));

function bodyOf(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

function authorized(req) {
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
      source_name=EXCLUDED.source_n