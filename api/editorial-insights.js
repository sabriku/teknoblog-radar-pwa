import { json, queryLocal } from './_lib.js';
import { readSession } from '../lib/lock.js';
import { evaluateEditorialDecisions } from '../lib/editorial-evaluation.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    if (!readSession(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    const [events, reviews] = await Promise.all([
      queryLocal(`SELECT e.occurred_at AS detected_at,e.payload->>'score' AS score,
          (e.payload->>'published_at_detection')::boolean AS published_at_detection,
          p.published_at,p.observed_at,p.discover_clicks,p.ga4_views
        FROM editorial_story_events e
        JOIN editorial_story_clusters c ON c.id=e.story_id
        LEFT JOIN published_performance p ON p.url=c.payload->'published_match'->>'url'
        WHERE e.event_type='detected' AND e.occurred_at>=NOW()-INTERVAL '90 days'
          AND e.payload ? 'score' ORDER BY e.occurred_at DESC LIMIT 3000`),
      queryLocal(`SELECT status,COUNT(*)::int AS count FROM editorial_story_reviews GROUP BY status`)
    ]);
    return json(res, 200, { evaluation: evaluateEditorialDecisions(events.rows),
      review_counts: Object.fromEntries(reviews.rows.map((row) => [row.status, Number(row.count)])),
      generated_at: new Date().toISOString() });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
