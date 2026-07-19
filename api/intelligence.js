import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { json, queryLocal, safeText, nowIso } from './_lib.js';
import { getGoogleConfig, googleAccessToken } from './_google-auth.js';
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

function clamp(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }
function hash(value) { return createHash('sha1').update(String(value)).digest('hex'); }

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

async function syncTeknoblog() {
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
    totalPages = Math.min(20, Number(response.headers.get('x-wp-totalpages') || 1));
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
    const leadership = clamp((stat.first / Math.max(1, stat.samples)) * 65 + Math.min(35, avgLead / 3));
    const success = clamp((stat.successes / Math.max(1, stat.samples)) * 100);
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
  return !item.owned_coverage
    && Number(item.source_count) >= 2
    && Number(item.opportunity_minutes) > 0;
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
    const discoverStrength = Math.log1p(Number(item.discover_clicks) || 0) * 22 + Math.log1p(Number(item.discover_impressions) || 0) * 5 + (Number(item.discover_ctr) || 0) * 20;
    const newsStrength = Math.log1p(Number(item.google_news_clicks) || 0) * 20 + Math.log1p(Number(item.google_news_impressions) || 0) * 4;
    const webStrength = Math.log1p(Number(item.web_clicks) || 0) * 8 + Math.log1p(Number(item.web_impressions) || 0) * 1.5;
    const priority = discoverStrength * 0.58 + newsStrength * 0.32 + webStrength * 0.10 + Math.max(0, 1 - ageDays / 14) * 14;
    return { ...item, age_days: Math.round(ageDays * 10) / 10, discover_strength: Math.round(discoverStrength), news_strength: Math.round(newsStrength), performance_priority: Math.min(100, Math.round(priority)) };
  });
  const signaled = ranked.filter((item) => Number(item.discover_impressions) > 0 || Number(item.discover_clicks) > 0 || Number(item.google_news_impressions) > 0 || Number(item.google_news_clicks) > 0);
  const items = (signaled.length ? signaled : ranked).sort((a, b) => b.performance_priority - a.performance_priority || new Date(b.published_at) - new Date(a.published_at)).slice(0, 100);
  const discoverItems = ranked.filter((item) => Number(item.discover_impressions) > 0 || Number(item.discover_clicks) > 0).sort((a, b) => b.discover_strength - a.discover_strength || new Date(b.published_at) - new Date(a.published_at)).slice(0, 30);
  const newsItems = ranked.filter((item) => Number(item.google_news_impressions) > 0 || Number(item.google_news_clicks) > 0).sort((a, b) => b.news_strength - a.news_strength || new Date(b.published_at) - new Date(a.published_at)).slice(0, 30);
  const config = await getGoogleConfig();
  const activeModel = await loadIntelligenceModel();
  const configured = Boolean(config.site_url && config.client_id && config.client_secret && config.refresh_token);
  return {
    configured, items, discover_items: discoverItems, news_items: newsItems,
    window_days: 14,
    totals: {
      discover_clicks: ranked.reduce((sum, item) => sum + (Number(item.discover_clicks) || 0), 0),
      discover_impressions: ranked.reduce((sum, item) => sum + (Number(item.discover_impressions) || 0), 0),
      news_clicks: ranked.reduce((sum, item) => sum + (Number(item.google_news_clicks) || 0), 0),
      news_impressions: ranked.reduce((sum, item) => sum + (Number(item.google_news_impressions) || 0), 0)
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
  if (body.status === 'published') await reconcilePredictionOutcomes();
  return result.rows[0];
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

async function runAlerts() {
  const clusters = await clustersSection();
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
  const newAlerts = [];
  for (const alert of alerts) {
    const result = await queryLocal(`INSERT INTO smart_alerts(alert_key,alert_type,title,payload) VALUES($1,$2,$3,$4) ON CONFLICT(alert_key) DO NOTHING RETURNING id`, [alert.key, alert.type, alert.title, JSON.stringify(alert.payload)]);
    created += result.rowCount;
    if (result.rowCount) newAlerts.push({ id: result.rows[0].id, ...alert });
  }
  const webhook = process.env.SLACK_KAYNAK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || '';
  if (webhook && newAlerts.length) {
    const labels = { first_mover: '🚨 İlk yayın fırsatı', momentum: '📈 Hızlanıyor', deadline: '⏱️ Fırsat penceresi kapanıyor', watchlist: '🎯 İzleme listesi eşleşmesi', corroborated: '✅ İkinci kaynak doğruladı', queue_stale: '⏳ Görev bekliyor' };
    const lines = ['*Teknoblog Radar · Öncü Haber Uyarıları*', ...newAlerts.slice(0, 12).map((alert) => `• ${labels[alert.type] || 'Radar uyarısı'}: ${alert.title}${alert.type === 'first_mover' ? ` · Öncülük ${alert.payload.first_mover_score} · Rakip ${alert.payload.competitor_count}` : alert.type === 'deadline' ? ` · ${alert.payload.opportunity_minutes} dakika kaldı` : ''}`)];
    const response = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: lines.join('\n') }) });
    if (response.ok) {
      await queryLocal(`UPDATE smart_alerts SET status='sent',sent_at=NOW() WHERE id=ANY($1::bigint[])`, [newAlerts.map((alert) => alert.id)]);
    }
  }
  return { candidates: alerts.length, created, slack_sent: Boolean(webhook && newAlerts.length) };
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
      if (section === 'queue') return json(res, 200, { items: await queueSection() });
      if (section === 'sources') return json(res, 200, { items: await sourceHealthSection() });
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
    if (body.action === 'feedback_record') return json(res, 200, { item: await feedbackAction(body) });
    if (!authorized(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    if (body.action === 'watchlist_upsert') return json(res, 200, { item: await watchlistAction(body) });
    if (body.action === 'sync_teknoblog') return json(res, 200, { ok: true, stored: await syncTeknoblog() });
    if (body.action === 'sync_gsc') return json(res, 200, { ok: true, stored: await syncGsc() });
    if (body.action === 'train_model') return json(res, 200, { ok: true, model: await trainIntelligenceModel() });
    if (body.action === 'run_alerts') return json(res, 200, { ok: true, ...(await runAlerts()) });
    if (body.action === 'maintenance') return json(res, 200, { ok: true, ...(await maintenance()) });
    if (body.action === 'check_images') return json(res, 200, { ok: true, items: await checkImages() });
    return json(res, 400, { error: 'Bilinmeyen işlem' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), at: nowIso() });
  }
}
