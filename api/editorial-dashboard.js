import { timingSafeEqual } from 'node:crypto';
import { json, queryLocal } from './_lib.js';
import { buildEditorialDashboard } from '../lib/editorial-decision.js';
import { attachStoryHistory, saveEditorialSnapshot } from '../lib/editorial-story-store.js';

let cached = null;
let cachedAt = 0;

export default async function handler(req, res) {
  try {
    const method = req.method || 'GET';
    if (!['GET', 'POST'].includes(method)) return json(res, 405, { error: 'Method not allowed' });
    const snapshot = method === 'POST';
    if (snapshot) {
      const expected = String(process.env.CRON_TOKEN || '');
      const provided = String(req.headers?.['x-cron-token'] || req.query?.token || '');
      const suppliedBytes = Buffer.from(provided);
      const expectedBytes = Buffer.from(expected);
      if (!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
        return json(res, 401, { error: 'Yetkisiz istek' });
      }
    }
    if (!snapshot && cached && Date.now() - cachedAt < 120000 && req.query?.refresh !== '1') {
      return json(res, 200, { ...cached, cache: 'fresh' });
    }
    const [items, publications, performance] = await Promise.all([
      queryLocal(`SELECT r.id,r.source_id,r.source_name,r.title,r.url,r.summary,r.image_url,r.published_at,r.created_at,
          s.source_type,s.site_url,s.market_relevance,s.trust_score,h.quality_score AS health_quality_score,
          c.discover_score,c.editorial_score,c.content_type_hint
        FROM raw_feed_items r
        LEFT JOIN sources s ON s.id=r.source_id
        LEFT JOIN source_health h ON h.source_id=r.source_id
        LEFT JOIN LATERAL (
          SELECT discover_score,editorial_score,content_type_hint FROM topic_candidates
          WHERE raw_feed_item_id=r.id AND status='active' ORDER BY updated_at DESC LIMIT 1
        ) c ON TRUE
        WHERE COALESCE(r.published_at,r.created_at)>=NOW()-INTERVAL '72 hours'
          AND COALESCE(s.source_type,'')<>'owned'
          AND COALESCE(r.source_name,'') NOT ILIKE 'Teknoblog%'
        ORDER BY r.created_at DESC LIMIT 1200`),
      queryLocal(`SELECT title,url,published_at,updated_at FROM teknoblog_content
        WHERE published_at>=NOW()-INTERVAL '45 days' ORDER BY published_at DESC LIMIT 1000`),
      queryLocal(`SELECT title,discover_clicks,ga4_views FROM published_performance
        WHERE title IS NOT NULL AND published_at>=NOW()-INTERVAL '180 days'
          AND (discover_clicks>0 OR ga4_views>0)
        ORDER BY published_at DESC LIMIT 800`)
    ]);
    const publicationChecked = publications.rows.some((post) => Date.parse(post.updated_at || '') >= Date.now() - 48 * 3600000);
    const { observed_cards: observedCards, ...result } = buildEditorialDashboard(items.rows,
      publicationChecked ? publications.rows : [], Date.now(), performance.rows, publicationChecked);
    const storage = snapshot ? await saveEditorialSnapshot(observedCards) : null;
    const history = await attachStoryHistory(result.lanes);
    cached = { ...result, lanes: history.lanes, recorded_count: history.recorded_count,
      ...(storage ? { snapshot: storage } : {}), generated_at: new Date().toISOString(), data_window_hours: 72, cache: 'miss' };
    cachedAt = Date.now();
    return json(res, 200, cached);
  } catch (error) {
    if (req.method !== 'POST' && cached && Date.now() - cachedAt < 20 * 60000) {
      return json(res, 200, { ...cached, cache: 'stale', warning: error?.message || String(error) });
    }
    return json(res, 500, { error: error?.message || String(error) });
  }
}
