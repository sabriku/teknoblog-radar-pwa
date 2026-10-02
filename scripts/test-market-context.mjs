import assert from 'node:assert/strict';
import { marketContextFor } from '../lib/market-context.js';

const base = { source_count: 2, turkey_interest: 70, freshness: 85, source_quality: 80 };
const gap = marketContextFor({ ...base, sources: [{ type: 'news' }, { type: 'official' }] });
assert.equal(gap.monitored_competitor_gap, true);
assert.equal(gap.monitored_saturation, 'low');
assert.equal(gap.official_source_count, 1);
assert.match(gap.scope_note, /izlediği/);
const crowded = marketContextFor({ ...base, sources: Array.from({ length: 4 }, () => ({ type: 'competitor' })) });
assert.equal(crowded.monitored_saturation, 'high');
assert.equal(crowded.monitored_competitor_gap, false);
assert.equal(marketContextFor({ ...base, freshness: 20, sources: [{ type: 'news' }] }).monitored_competitor_gap, false);
console.log('market context tests passed');
