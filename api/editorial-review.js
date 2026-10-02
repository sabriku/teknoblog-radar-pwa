import { json, queryLocal } from './_lib.js';
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
    if (review.status === 'unreviewed') {
      await queryLocal('DELETE FROM editorial_story_reviews WHERE story_id=$1', [review.story_id]);
      return json(res, 200, { ...review, updated_at: null });
    }
    const result = await queryLocal(`INSERT INTO editorial_story_reviews(story_id,status)
      VALUES($1,$2) ON CONFLICT(story_id) DO UPDATE SET status=EXCLUDED.status,updated_at=NOW()
      RETURNING story_id,status,updated_at`, [review.story_id, review.status]);
    return json(res, 200, result.rows[0]);
  } catch (error) {
    const message = error?.message || String(error);
    return json(res, /Geçersiz|Unexpected token/.test(message) ? 400 : 500, { error: message });
  }
}
