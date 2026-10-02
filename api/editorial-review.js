import { json, queryLocal, withLocalTransaction } from './_lib.js';
import { readSession } from '../lib/lock.js';
import { validateReview } from '../lib/editorial-review.js';

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
    if (!readSession(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    if (req.method === 'GET') {
      const result = await queryLocal(`SELECT story_id,status,updated_at FROM editorial_story_reviews
        WHERE updated_at>=NOW()-INTERVAL '90 days' ORDER BY updated_at DESC LIMIT 1000`);
      return json(res, 200, { reviews: result.rows });
    }
    const input = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const review = validateReview(input);
    const saved = await withLocalTransaction(async (query) => {
      await query(`SELECT pg_advisory_xact_lock(hashtext('editorial_review:' || $1))`, [review.story_id]);
      const before = (await query('SELECT status,updated_at FROM editorial_story_reviews WHERE story_id=$1 FOR UPDATE', [review.story_id])).rows[0];
      const oldStatus = before?.status || 'unreviewed';
      if (oldStatus === review.status) return { ...review, updated_at: before?.updated_at || null };
      let result;
      if (review.status === 'unreviewed') {
        await query('DELETE FROM editorial_story_reviews WHERE story_id=$1', [review.story_id]);
        result = { ...review, updated_at: null };
      } else {
        result = (await query(`INSERT INTO editorial_story_reviews(story_id,status)
          VALUES($1,$2) ON CONFLICT(story_id) DO UPDATE SET status=EXCLUDED.status,updated_at=NOW()
          RETURNING story_id,status,updated_at`, [review.story_id, review.status])).rows[0];
      }
      await query(`INSERT INTO editorial_review_events(story_id,from_status,to_status)
        VALUES($1,$2,$3)`, [review.story_id, oldStatus, review.status]);
      return result;
    });
    return json(res, 200, saved);
  } catch (error) {
    const message = error?.message || String(error);
    return json(res, /Geçersiz|Unexpected token/.test(message) ? 400 : 500, { error: message });
  }
}
