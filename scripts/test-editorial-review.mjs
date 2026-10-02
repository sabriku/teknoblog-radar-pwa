import assert from 'node:assert/strict';
import { validateReview } from '../lib/editorial-review.js';
import reviewHandler from '../api/editorial-review.js';

const id = 'a1b2c3d4e5f60708';
assert.deepEqual(validateReview({ story_id: id, status: 'ready' }), { story_id: id, status: 'ready' });
assert.deepEqual(validateReview({ story_id: id, status: 'unreviewed' }), { story_id: id, status: 'unreviewed' });
assert.throws(() => validateReview({ story_id: '1;DELETE', status: 'ready' }), /Geçersiz konu/);
assert.throws(() => validateReview({ story_id: id, status: 'published' }), /Geçersiz inceleme/);

function response() {
  return { status(code) { this.statusCode = code; return this; }, setHeader() { return this; },
    end(body) { this.body = JSON.parse(body); } };
}
const unauthorized = response();
await reviewHandler({ method: 'POST', headers: {}, body: { story_id: id, status: 'ready' } }, unauthorized);
assert.equal(unauthorized.statusCode, 401, 'editör oturumu olmadan karar yazılamamalı');
console.log('editorial review tests passed');
