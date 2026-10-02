import assert from 'node:assert/strict';
import { evaluateEditorialDecisions, summarizeReviewTimings } from '../lib/editorial-evaluation.js';
import insightsHandler from '../api/editorial-insights.js';

const now = Date.parse('2026-10-20T00:00:00Z');
const detectedAt = '2026-10-01T00:00:00Z';
const publishedAt = '2026-10-03T00:00:00Z';
const observedAt = '2026-10-10T00:00:00Z';
const rows = [
  ...Array.from({ length: 10 }, (_, i) => ({ score: 75, detected_at: detectedAt,
    published_at: i < 6 ? publishedAt : null, observed_at: observedAt,
    discover_clicks: i < 6 ? 100 : 0, ga4_views: i < 6 ? 300 : 0 })),
  ...Array.from({ length: 10 }, (_, i) => ({ score: 45, detected_at: detectedAt,
    published_at: i < 2 ? publishedAt : null, observed_at: observedAt,
    discover_clicks: i < 2 ? 20 : 0, ga4_views: i < 2 ? 60 : 0 })),
  { score: 90, detected_at: detectedAt, published_at_detection: true, published_at: publishedAt },
  { score: 80, detected_at: '2026-10-19T00:00:00Z', published_at: null }
];
const result = evaluateEditorialDecisions(rows, now);
assert.equal(result.status, 'active');
assert.equal(result.sample_count, 20);
assert.equal(result.high_priority.publication_rate, 60);
assert.equal(result.other.publication_rate, 20);
assert.equal(result.high_priority.median_discover_clicks, 100);
const zeroTraffic = evaluateEditorialDecisions([{ score: 75, detected_at: detectedAt,
  published_at: publishedAt, observed_at: observedAt, discover_clicks: 0, ga4_views: 0 }], now);
assert.equal(zeroTraffic.high_priority.performance_samples, 1);
assert.equal(zeroTraffic.high_priority.median_discover_clicks, 0);
assert.equal(evaluateEditorialDecisions([], now).status, 'collecting');
const timing = summarizeReviewTimings([
  { story_id: 'a', to_status: 'ready', changed_at: '2026-10-03T12:00:00Z' },
  { story_id: 'a', to_status: 'researching', changed_at: '2026-10-03T09:00:00Z' },
  { story_id: 'b', to_status: 'researching', changed_at: '2026-10-03T10:00:00Z' }
]);
assert.equal(timing.sample_count, 1);
assert.equal(timing.median_hours_to_ready, 3);

const res = { status(code) { this.statusCode = code; return this; }, setHeader() { return this; }, end(body) { this.body = JSON.parse(body); } };
await insightsHandler({ method: 'GET', headers: {} }, res);
assert.equal(res.statusCode, 401, 'özel performans ölçümleri oturum olmadan açılmamalı');
console.log('editorial evaluation tests passed');
