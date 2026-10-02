import { json, queryLocal } from './_lib.js';
import { readSession } from '../lib/lock.js';
import { evaluateEditorialDecisions, summarizeReviewTimings } from '../lib/editorial-evaluation.js';
import { timingSafeEqual } from 'node:crypto';

function validCronToken(req) {
  const expected = Buffer.from(String(process.env.CRON_TOKEN || ''));
  const supplied = Buffer.from(String(req.headers?.['x-cron-token'] || ''));
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function loadEditorialInsights() {
  const [events, reviews, reviewEvents] = await Promise.all([
    queryLocal(`SELECT e.occurred_at AS detected_at,e.payload->>'score' AS score,
          (e.payload->>'published_at_detection')::boolean AS published_at_detection,
          p.published_at,p.observed_at,p.discover_clicks,p.ga4_views
        FROM editorial_story_events e
        JOIN editorial_story_clusters c ON c.id=e.story_id
        LEFT JOIN published_performance p ON p.url=(c.payload->'published_match'->>'url')
        WHERE e.event_type='detected' AND e.occurred_at>=NOW()-INTERVAL '90 days'
          AND e.payload ? 'score' ORDER BY e.occurred_at DESC LIMIT 3000`),
    queryLocal(`SELECT status,COUNT(*)::int AS count FROM editorial_story_reviews GROUP BY status`),
    queryLocal(`SELECT story_id,to_status,changed_at FROM editorial_review_events
      WHERE changed_at>=NOW()-INTERVAL '90 days' ORDER BY changed_at DESC LIMIT 3000`)
  ]);
  return { evaluation: evaluateEditorialDecisions(events.rows),
    review_counts: Object.fromEntries(reviews.rows.map((row) => [row.status, Number(row.count)])),
    review_timing: summarizeReviewTimings(reviewEvents.rows),
    generated_at: new Date().toISOString() };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    if (!readSession(req) && !validCronToken(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    return json(res, 200, await loadEditorialInsights());
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
