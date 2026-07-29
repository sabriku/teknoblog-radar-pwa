import assert from 'node:assert/strict';
import { normalizeSourcePatch, sortSourcesByPriority } from '../api/sources.js';

const ordered = sortSourcesByPriority([
  { id: 'boosted-before', name: 'Engadget', priority_weight: 40, is_active: true },
  { id: 'manual-first', name: 'Yeni Kaynak', priority_weight: 95, is_active: true },
  { id: 'passive', name: 'Pasif Kaynak', priority_weight: 100, is_active: false },
  { id: 'manual-second', name: 'LOG', priority_weight: 80, is_active: true }
]);
assert.deepEqual(ordered.map((item) => item.id), ['manual-first', 'manual-second', 'boosted-before', 'passive']);

const zeroPatch = normalizeSourcePatch({ priority_weight: 0, trust_score: 0, is_active: false });
assert.equal(zeroPatch.priority_weight, 0);
assert.equal(zeroPatch.trust_score, 0);
assert.equal(zeroPatch.is_active, false);
assert.ok(zeroPatch.updated_at);
assert.equal(Object.hasOwn(zeroPatch, 'name'), false, 'Partial update must not erase missing fields');

const urlPatch = normalizeSourcePatch({
  name: '  Örnek Kaynak  ',
  rss_url: 'https://example.com/feed.xml',
  site_url: 'https://example.com'
});
assert.equal(urlPatch.name, 'Örnek Kaynak');
assert.equal(urlPatch.rss_url, 'https://example.com/feed.xml');
assert.equal(urlPatch.feed_url, 'https://example.com/feed.xml');

assert.throws(() => normalizeSourcePatch({ rss_url: 'javascript:alert(1)' }), /Geçerli bir RSS/);
assert.throws(() => normalizeSourcePatch({ name: '' }), /boş bırakılamaz/);

console.log('source management tests passed');
