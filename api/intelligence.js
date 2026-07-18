import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { json, queryLocal, safeText, nowIso } from './_lib.js';
import { getGoogleConfig, googleAccessToken } from './_google-auth.js';

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
    totalPages = Math.min(5, Number(response.headers.get('x-wp-totalpages') || 1));
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
  return stored;
}

async function recentCandidates(limit = 600) {
  const result = await queryLocal(`SELECT id,title,url,source_name,image_url,published_at,created_at,
    total_score,discover_score,traffic_score,social_score,editorial_score,conversion_score
    FROM topic_candidates WHERE status='active' AND COALESCE(published_at,created_at) >= NOW()-INTERVAL '48 hours'
    ORDER BY COALESCE(published_at,created_at) DESC LIMIT $1`, [limit]);
  return result.rows;
}

function buildClusters(items = []) {
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
    const sources = [...new Set(sorted.map((item) => item.source_name).filter(Boolean))];
    const first = Math.min(...sorted.map((item) => new Date(item.published_at || item.created_at).getTime()));
    const last = Math.max(...sorted.map((item) => new Date(item.published_at || item.created_at).getTime()));
    const ageHours = Math.max(0, (Date.now() - last) / 3600000);
    const recentCount = sorted.filter((item) => Date.now() - new Date(item.published_at || item.created_at).getTime() <= 6 * 3600000).length;
    const momentum = clamp(25 + sources.length * 12 + recentCount * 9 - ageHours * 2);
    const confidence = clamp(30 + sources.length * 15 + (sorted[0]?.image_url ? 8 : 0) + (sorted.length > 2 ? 10 : 0));
    return {
      cluster_key: hash(group.tokens.slice(0, 6).sort().join('|')),
      cluster_name: sorted[0].title,
      source_count: sources.length,
      item_count: sorted.length,
      momentum_score: momentum,
      confidence_score: confidence,
      first_seen_at: new Date(first).toISOString(),
      last_seen_at: new Date(last).toISOString(),
      sources,
      items: sorted.slice(0, 8)
    };
  }).sort((a, b) => b.momentum_score - a.momentum_score || b.source_count - a.source_count);
}

async function clustersSection() {
  const clusters = buildClusters(await recentCandidates());
  for (const cluster of clusters.slice(0, 80)) {
    await queryLocal(`INSERT INTO content_clusters(cluster_key,cluster_name,source_count,item_count,momentum_score,confidence_score,first_seen_at,last_seen_at,payload,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT(cluster_key) DO UPDATE SET
      cluster_name=EXCLUDED.cluster_name,source_count=EXCLUDED.source_count,item_count=EXCLUDED.item_count,
      momentum_score=EXCLUDED.momentum_score,confidence_score=EXCLUDED.confidence_score,last_seen_at=EXCLUDED.last_seen_at,payload=EXCLUDED.payload,updated_at=NOW()`,
    [cluster.cluster_key, cluster.cluster_name, cluster.source_count, cluster.item_count, cluster.momentum_score, cluster.confidence_score, cluster.first_seen_at, cluster.last_seen_at, JSON.stringify({ sources: cluster.sources, items: cluster.items })]);
  }
  return clusters.slice(0, 60);
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
    h.last_attempt_at,h.last_success_at,h.last_error,h.consecutive_failures,h.fetched_count,h.image_count,h.avg_latency_ms,
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
  const rows = (await queryLocal(`SELECT * FROM published_performance ORDER BY observed_at DESC LIMIT 300`)).rows;
  const config = await getGoogleConfig();
  const configured = Boolean(config.site_url && config.client_id && config.client_secret && config.refresh_token);
  return { configured, items: rows, note: configured ? null : 'Google Search Console bağlantısını bu ekrandan güvenli biçimde kurabilirsiniz.' };
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
  return { ...counts.rows[0], queue_progress: { total: queue.length, completed: queue.filter((item) => item.status === 'published').length }, unhealthy_sources: health.filter((item) => Number(item.quality_score) < 45).slice(0, 10), rising_clusters: clusters.filter((item) => item.momentum_score >= 60).slice(0, 8), performance_configured: performance.configured, disk: diskStatus(), generated_at: nowIso() };
}

async function syncGsc() {
  const config = await getGoogleConfig();
  const site = config.site_url || '';
  const token = await googleAccessToken();
  if (!site || !token) throw new Error('Search Console bağlantı bilgileri eksik.');
  const end = new Date();
  const start = new Date(Date.now() - 7 * 86400000);
  const fmt = (date) => date.toISOString().slice(0, 10);
  const combined = new Map();
  for (const type of ['discover', 'googleNews', 'web']) {
    const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ['page'], type, dataState: 'all', rowLimit: 25000 }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `Search Console ${type} HTTP ${response.status}`);
    for (const row of data.rows || []) {
      const url = row.keys?.[0]; if (!url) continue;
      const current = combined.get(url) || { url };
      current[type] = { clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0 };
      combined.set(url, current);
    }
  }
  for (const item of combined.values()) {
    await queryLocal(`INSERT INTO published_performance(url,discover_clicks,discover_impressions,discover_ctr,google_news_clicks,google_news_impressions,web_clicks,web_impressions,observed_at,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9) ON CONFLICT(url) DO UPDATE SET
      discover_clicks=EXCLUDED.discover_clicks,discover_impressions=EXCLUDED.discover_impressions,discover_ctr=EXCLUDED.discover_ctr,
      google_news_clicks=EXCLUDED.google_news_clicks,google_news_impressions=EXCLUDED.google_news_impressions,web_clicks=EXCLUDED.web_clicks,web_impressions=EXCLUDED.web_impressions,observed_at=NOW(),payload=EXCLUDED.payload`,
    [item.url, item.discover?.clicks || 0, item.discover?.impressions || 0, item.discover?.ctr || 0, item.googleNews?.clicks || 0, item.googleNews?.impressions || 0, item.web?.clicks || 0, item.web?.impressions || 0, JSON.stringify(item)]);
  }
  await queryLocal(`UPDATE published_performance p SET title=t.title,published_at=t.published_at
    FROM teknoblog_content t WHERE p.url=t.url AND (p.title IS NULL OR p.title='')`);
  return combined.size;
}

async function queueAction(body) {
  const url = String(body.url || '').trim();
  if (!url) throw new Error('url gerekli');
  const result = await queryLocal(`INSERT INTO editorial_queue(candidate_id,title,url,source_name,image_url,status,priority,notes,assigned_to,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT(url) DO UPDATE SET
    title=EXCLUDED.title,source_name=EXCLUDED.source_name,image_url=EXCLUDED.image_url,status=EXCLUDED.status,
    priority=EXCLUDED.priority,notes=EXCLUDED.notes,assigned_to=EXCLUDED.assigned_to,updated_at=NOW(),
    completed_at=CASE WHEN EXCLUDED.status='published' THEN NOW() ELSE editorial_queue.completed_at END RETURNING *`,
  [body.candidate_id || null, body.title || 'Başlıksız', url, body.source_name || '', body.image_url || '', body.status || 'new', clamp(body.priority || 50), body.notes || '', body.assigned_to || '']);
  return result.rows[0];
}

async function runAlerts() {
  const clusters = await clustersSection();
  const stale = (await queryLocal(`SELECT * FROM editorial_queue WHERE status NOT IN ('published','skipped') AND created_at<NOW()-INTERVAL '2 hours' ORDER BY priority DESC LIMIT 10`)).rows;
  const alerts = [
    ...clusters.filter((item) => item.momentum_score >= 75 && item.source_count >= 2).slice(0, 8).map((item) => ({ type: 'momentum', key: `momentum:${item.cluster_key}:${new Date().toISOString().slice(0,13)}`, title: item.cluster_name, payload: item })),
    ...stale.map((item) => ({ type: 'queue_stale', key: `queue:${item.id}:${new Date().toISOString().slice(0,10)}`, title: item.title, payload: item }))
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
    const lines = ['*Teknoblog Radar · Akıllı Uyarılar*', ...newAlerts.slice(0, 12).map((alert) => `• ${alert.type === 'momentum' ? 'Hızlanıyor' : 'Bekliyor'}: ${alert.title}`)];
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
      if (section === 'clusters') return json(res, 200, { items: await clustersSection() });
      if (section === 'coverage') return json(res, 200, { items: await coverageSection() });
      if (section === 'queue') return json(res, 200, { items: await queueSection() });
      if (section === 'sources') return json(res, 200, { items: await sourceHealthSection() });
      if (section === 'performance') return json(res, 200, await performanceSection());
      if (section === 'scoring-lab') return json(res, 200, await scoringLabSection());
      if (section === 'system') return json(res, 200, { disk: diskStatus(), alerts: (await queryLocal(`SELECT * FROM smart_alerts ORDER BY created_at DESC LIMIT 50`)).rows, images: (await queryLocal(`SELECT * FROM image_checks ORDER BY checked_at DESC LIMIT 50`)).rows });
      return json(res, 404, { error: 'Bölüm bulunamadı' });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = bodyOf(req);
    if (body.action === 'queue_upsert') return json(res, 200, { item: await queueAction(body) });
    if (!authorized(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    if (body.action === 'sync_teknoblog') return json(res, 200, { ok: true, stored: await syncTeknoblog() });
    if (body.action === 'sync_gsc') return json(res, 200, { ok: true, stored: await syncGsc() });
    if (body.action === 'run_alerts') return json(res, 200, { ok: true, ...(await runAlerts()) });
    if (body.action === 'maintenance') return json(res, 200, { ok: true, ...(await maintenance()) });
    if (body.action === 'check_images') return json(res, 200, { ok: true, items: await checkImages() });
    return json(res, 400, { error: 'Bilinmeyen işlem' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), at: nowIso() });
  }
}
