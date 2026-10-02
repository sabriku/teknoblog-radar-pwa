import assert from 'node:assert/strict';
import { deriveStoryEvents } from '../lib/editorial-story-store.js';
import dashboardHandler from '../api/editorial-dashboard.js';

const card = { id: 'story-1', lane: 'rising', source_count: 2 };
assert.deepEqual(deriveStoryEvents([card], new Map()).map((event) => event.event_type), ['detected', 'corroborated']);
assert.equal(deriveStoryEvents([{ ...card, score: 73 }], new Map())[0].payload.score, 73,
  'ilk karar puanı sonraki ölçüm için olayda korunmalı');
assert.deepEqual(deriveStoryEvents([card], new Map([['story-1', { lane: 'rising', source_count: 2 }]])), [], 'aynı gözlem tekrar olay üretmemeli');
const changed = deriveStoryEvents([{ ...card, lane: 'write_now', source_count: 3 }], new Map([['story-1', { lane: 'rising', source_count: 2 }]]));
assert.deepEqual(changed.map((event) => event.event_type), ['lane_changed']);
assert.equal(changed[0].from_lane, 'rising');
const corroborated = deriveStoryEvents([card], new Map([['story-1', { lane: 'watch', source_count: 1 }]]));
assert.deepEqual(corroborated.map((event) => event.event_type), ['lane_changed', 'corroborated']);
const oldState = { lane: 'rising', source_count: 1, last_seen_at: '2026-10-02T08:00:00Z', payload: { research: { official_source_count: 0 } } };
const newWave = deriveStoryEvents([{ ...card, research: { official_source_count: 1 }, last_seen_at: '2026-10-02T12:00:00Z' }], new Map([['story-1', oldState]]));
assert.deepEqual(newWave.map((event) => event.event_type), ['corroborated', 'official_source_seen', 'second_wave']);
assert.deepEqual(deriveStoryEvents([{ ...card, last_seen_at: '2026-10-02T12:00:00Z' }], new Map([['story-1', { ...oldState, source_count: 2 }]])), [],
  'yeni kaynak veya resmî geçiş yoksa zaman tek başına ikinci dalga sayılmamalı');

const original = process.env.CRON_TOKEN;
process.env.CRON_TOKEN = 'test-only-token';
let status;
let payload;
const response = {
  status(value) { status = value; return this; },
  setHeader() { return this; },
  end(value) { payload = JSON.parse(value); }
};
await dashboardHandler({ method: 'POST', headers: { 'x-cron-token': 'wrong' }, query: {} }, response);
assert.equal(status, 401, 'snapshot yazımı cron anahtarı olmadan reddedilmeli');
assert.ok(payload.error);
if (original === undefined) delete process.env.CRON_TOKEN;
else process.env.CRON_TOKEN = original;
console.log('editorial story store tests passed');
