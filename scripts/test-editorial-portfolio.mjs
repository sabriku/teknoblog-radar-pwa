import assert from 'node:assert/strict';
import { editorialBeat, portfolioSummary } from '../lib/editorial-portfolio.js';

assert.equal(editorialBeat('Apple iPhone için yeni kamera'), 'apple');
assert.equal(editorialBeat('Samsung Galaxy S27 tanıtıldı'), 'android_mobile');
assert.equal(editorialBeat('OpenAI yeni modeli duyurdu'), 'ai');
assert.equal(editorialBeat('PlayStation oyun güncellemesi'), 'gaming');
const lanes = { write_now: [
  ...Array.from({ length: 5 }, () => ({ beat: 'apple' })),
  ...Array.from({ length: 3 }, () => ({ beat: 'ai' }))
] };
const summary = portfolioSummary(lanes);
assert.equal(summary.total, 8);
assert.equal(summary.dominant_share, 63);
assert.equal(summary.concentrated, true);
assert.equal(portfolioSummary({ write_now: [] }).concentrated, false);
console.log('editorial portfolio tests passed');
