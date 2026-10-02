import assert from 'node:assert/strict';
import { buildEditorialDashboard, clusterStories } from '../lib/editorial-decision.js';

const now = Date.parse('2026-10-03T09:00:00Z');
const base = { trust_score: 82, health_quality_score: 88, market_relevance: 'local', editorial_score: 75, discover_score: 82, created_at: '2026-10-03T08:00:00Z' };
const items = [
  { ...base, id: '1', source_id: 'a', source_name: 'Kaynak A', title: 'Samsung Galaxy S27 yeni kamera sensörünü tanıttı', url: 'https://a.test/s27', published_at: '2026-10-03T08:00:00Z' },
  { ...base, id: '2', source_id: 'b', source_name: 'Kaynak B', title: 'Samsung Galaxy S27 kamera sensörünü tanıttı', url: 'https://b.test/s27', published_at: '2026-10-03T08:30:00Z' },
  { ...base, id: '3', source_id: 'c', source_name: 'Kaynak C', title: 'Samsung Galaxy S27 yeni batarya kapasitesini açıkladı', url: 'https://c.test/battery', published_at: '2026-10-03T08:40:00Z' }
];
const clusters = clusterStories(items, now);
assert.equal(clusters.length, 2, 'ayrı ürün gelişmeleri birleşmemeli');
assert.equal(clusters[0].source_count, 2, 'aynı hikâye iki bağımsız kaynaktan oluşmalı');
const dashboard = buildEditorialDashboard(items, [], now);
assert.equal(dashboard.total, 2);
assert.ok(dashboard.lanes.write_now.some((item) => item.source_count === 2), 'güçlü ve doğrulanmış güncel haber Şimdi Yaz kuyruğunda olmalı');
const multiSource = Object.values(dashboard.lanes).flat().find((item) => item.source_count === 2);
const singleSource = Object.values(dashboard.lanes).flat().find((item) => item.source_count === 1);
assert.ok(multiSource.signals.spread_velocity > singleSource.signals.spread_velocity, 'kaynak yayılımı skora yansımalı');
const published = buildEditorialDashboard(items, [{ title: 'Samsung Galaxy S27 kamera sensörünü tanıttı', url: 'https://teknoblog.com/s27' }], now);
assert.equal(published.lanes.update.length, 1, 'yayınlanmış konu Güncelle kuyruğuna gitmeli');
const old = buildEditorialDashboard([{ ...items[0], published_at: '2026-09-30T09:00:00Z', created_at: '2026-09-30T09:00:00Z' }], [], now);
assert.ok(Object.values(old.lanes).flat()[0].signals.freshness < multiSource.signals.freshness, 'eski haberin güncelliği düşmeli');
console.log('editorial decision tests passed');
