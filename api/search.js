import { json, queryLocal } from './_lib.js';

const TYPES = new Set(['all', 'news', 'teknoblog', 'trends', 'sources']);
const PERIODS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, all: 3650 };

function number(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clean(value = '', max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function resultRows(result, type) {
  return (result?.rows || []).map((row) => ({ ...row, result_type: type, relevance: Number(row.relevance || 0) }));
}

async function searchNews(q, days, source, take) {
  const result = await queryLocal(`
    WITH needle AS (SELECT websearch_to_tsquery('simple', $1) AS tsq, lower($1) AS plain)
    SELECT id::text, title, url, source_name, image_url, published_at,
      summary, discover_score, traffic_score, editorial_score,
      ROUND((
        ts_rank_cd(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source_name,'')), needle.tsq) * 80
        + CASE WHEN lower(title)=needle.plain THEN 45 WHEN lower(title) LIKE needle.plain || '%' THEN 26 WHEN lower(title) LIKE '%' || needle.plain || '%' THEN 16 ELSE 0 END
        + greatest(0, 16 - extract(epoch from (now()-coalesce(published_at,created_at)))/86400)
        + coalesce(discover_score,0) * .12 + coalesce(editorial_score,0) * .06
      )::numeric, 2)::float AS relevance
    FROM topic_candidates, needle
    WHERE coalesce(status,'active')='active'
      AND coalesce(published_at,created_at) >= now() - ($2::int * interval '1 day')
      AND ($3='' OR lower(coalesce(source_name,''))=lower($3))
      AND (
        to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source_name,'')) @@ needle.tsq
        OR lower(title) LIKE '%' || needle.plain || '%'
        OR lower(coalesce(summary,'')) LIKE '%' || needle.plain || '%'
      )
    ORDER BY relevance DESC, coalesce(published_at,created_at) DESC
    LIMIT $4`, [q, days, source, take]);
  return resultRows(result, 'news');
}

async function searchTeknoblog(q, days, take) {
  const result = await queryLocal(`
    WITH needle AS (SELECT websearch_to_tsquery('simple', $1) AS tsq, lower($1) AS plain), perf AS (
      SELECT url,
        sum(CASE WHEN search_type='discover' THEN clicks ELSE 0 END) discover_clicks,
        sum(CASE WHEN search_type='googleNews' THEN clicks ELSE 0 END) news_clicks
      FROM performance_snapshots WHERE snapshot_date >= current_date-30 GROUP BY url
    )
    SELECT t.id::text, t.title, t.url, 'Teknoblog'::text source_name, t.image_url, t.published_at,
      t.excerpt AS summary, coalesce(p.discover_clicks,0)::int discover_clicks, coalesce(p.news_clicks,0)::int news_clicks,
      ROUND((
        ts_rank_cd(to_tsvector('simple', coalesce(t.title,'') || ' ' || coalesce(t.excerpt,'')), needle.tsq) * 90
        + CASE WHEN lower(t.title)=needle.plain THEN 50 WHEN lower(t.title) LIKE needle.plain || '%' THEN 28 WHEN lower(t.title) LIKE '%' || needle.plain || '%' THEN 18 ELSE 0 END
        + greatest(0, 14 - extract(epoch from (now()-coalesce(t.published_at,t.updated_at)))/86400)
        + least(25, ln(1 + coalesce(p.discover_clicks,0)) * 3)
      )::numeric, 2)::float AS relevance
    FROM teknoblog_content t CROSS JOIN needle LEFT JOIN perf p ON p.url=t.url
    WHERE coalesce(t.published_at,t.updated_at) >= now() - ($2::int * interval '1 day')
      AND (
        to_tsvector('simple', coalesce(t.title,'') || ' ' || coalesce(t.excerpt,'')) @@ needle.tsq
        OR lower(t.title) LIKE '%' || needle.plain || '%'
        OR lower(coalesce(t.excerpt,'')) LIKE '%' || needle.plain || '%'
      )
    ORDER BY relevance DESC, coalesce(t.published_at,t.updated_at) DESC
    LIMIT $3`, [q, days, take]);
  return resultRows(result, 'teknoblog');
}

async function searchTrends(q, days, take) {
  const result = await queryLocal(`
    WITH needle AS (SELECT websearch_to_tsquery('simple', $1) AS tsq, lower($1) AS plain)
    SELECT id::text, cluster_name AS title, coalesce(payload->>'url','') AS url,
      array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce(payload->'sources','[]'::jsonb))), ', ') AS source_name,
      coalesce(payload->'items'->0->>'image_url','') AS image_url, last_seen_at AS published_at,
      payload->>'summary' AS summary, momentum_score, confidence_score, source_count,
      ROUND((
        ts_rank_cd(to_tsvector('simple', coalesce(cluster_name,'') || ' ' || coalesce(payload::text,'')), needle.tsq) * 80
        + CASE WHEN lower(cluster_name)=needle.plain THEN 45 WHEN lower(cluster_name) LIKE '%' || needle.plain || '%' THEN 20 ELSE 0 END
        + coalesce(momentum_score,0) * .18 + coalesce(confidence_score,0) * .08
      )::numeric, 2)::float AS relevance
    FROM content_clusters, needle
    WHERE coalesce(last_seen_at,updated_at) >= now() - ($2::int * interval '1 day')
      AND (
        to_tsvector('simple', coalesce(cluster_name,'') || ' ' || coalesce(payload::text,'')) @@ needle.tsq
        OR lower(cluster_name) LIKE '%' || needle.plain || '%'
      )
    ORDER BY relevance DESC, coalesce(last_seen_at,updated_at) DESC
    LIMIT $3`, [q, days, take]);
  return resultRows(result, 'trends');
}

async function searchSources(q, take) {
  const result = await queryLocal(`
    SELECT id::text, name AS title, site_url AS url, name AS source_name, ''::text image_url,
      updated_at AS published_at, description AS summary, priority_weight, trust_score,
      (CASE WHEN lower(name)=lower($1) THEN 80 WHEN lower(name) LIKE lower($1) || '%' THEN 55 ELSE 35 END
       + coalesce(priority_weight,0) * .12 + coalesce(trust_score,0) * .08)::float AS relevance
    FROM sources
    WHERE is_active=true AND (lower(name) LIKE '%' || lower($1) || '%' OR lower(coalesce(description,'')) LIKE '%' || lower($1) || '%')
    ORDER BY relevance DESC, name ASC LIMIT $2`, [q, take]);
  return resultRows(result, 'sources');
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const q = clean(req.query?.q);
  if (q.length < 2) return json(res, 400, { error: 'Arama için en az 2 karakter girin.' });

  const type = TYPES.has(req.query?.type) ? req.query.type : 'all';
  const period = PERIODS[req.query?.period] ? req.query.period : '30d';
  const days = PERIODS[period];
  const source = clean(req.query?.source, 80);
  const page = number(req.query?.page, 1, 1, 1000);
  const limit = number(req.query?.limit, 24, 6, 60);
  const take = Math.min(120, page * limit + limit);

  try {
    const jobs = [];
    if (type === 'all' || type === 'news') jobs.push(searchNews(q, days, source, take));
    if (type === 'all' || type === 'teknoblog') jobs.push(searchTeknoblog(q, days, take));
    if (type === 'all' || type === 'trends') jobs.push(searchTrends(q, days, take));
    if (type === 'all' || type === 'sources') jobs.push(searchSources(q, take));
    const settled = await Promise.allSettled(jobs);
    const errors = settled.filter((item) => item.status === 'rejected').map((item) => item.reason?.message || String(item.reason));
    const combined = settled.flatMap((item) => item.status === 'fulfilled' ? item.value : []);
    const unique = [...new Map(combined.sort((a, b) => b.relevance - a.relevance).map((item) => [`${item.result_type}:${item.url || item.id}`, item])).values()];
    const offset = (page - 1) * limit;
    const items = unique.slice(offset, offset + limit);
    const counts = unique.reduce((acc, item) => { acc[item.result_type] = (acc[item.result_type] || 0) + 1; return acc; }, {});
    return json(res, 200, { query: q, type, period, source: source || null, page, limit, total: unique.length, counts, items, partial_errors: errors });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
