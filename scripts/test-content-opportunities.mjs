import assert from 'node:assert/strict';
import { contentOpportunitiesFor } from '../lib/content-opportunities.js';
import { buildEditorialDashboard } from '../lib/editorial-decision.js';

const signals = { freshness: 90, source_quality: 82, turkey_interest: 72 };
const guide = contentOpportunitiesFor({ title: 'WhatsApp yeni gizlilik özelliği kullanıma açıldı', score: 63, source_count: 2, signals });
assert.ok(guide.some((format) => format.key === 'guide'));
assert.ok(guide.some((format) => format.key === 'news'));
assert.ok(!guide.some((format) => format.key === 'affiliate'));
assert.ok(!guide.some((format) => format.key === 'short_video'));
assert.ok(guide.find((format) => format.key === 'guide').checks.length > 0, 'rehber için erişim doğrulaması istenmeli');
const misleadingSummary = contentOpportunitiesFor({ title: 'Telefon fiyatı yükseldi', summary: 'Uygulama özellikleri ve kamera görselleri önceki haberlerde yer alıyor.',
  image_url: 'https://example.com/image.jpg', score: 63, source_count: 2, signals });
assert.ok(!misleadingSummary.some((format) => ['guide', 'short_video'].includes(format.key)), 'yalnızca özetteki genel kelimeler format önerisi doğurmamalı');

const product = contentOpportunitiesFor({ title: 'Samsung yeni telefonun kamera ve ekran tasarımını gösterdi', image_url: 'https://example.com/image.jpg', score: 62, source_count: 2, signals });
assert.ok(product.some((format) => format.key === 'short_video'));
const noImage = contentOpportunitiesFor({ title: 'Samsung yeni telefonun kamera ve ekran tasarımını gösterdi', score: 62, source_count: 2, signals });
assert.ok(!noImage.some((format) => format.key === 'short_video'), 'görselsiz konuda video önerilmemeli');

const localDeal = contentOpportunitiesFor({ title: 'Akıllı saat Türkiye fiyatı ve indirim kampanyası açıklandı', score: 65, source_count: 2, signals });
assert.ok(localDeal.some((format) => format.key === 'affiliate'));
const globalDeal = contentOpportunitiesFor({ title: 'Akıllı saat fiyatı ve indirim kampanyası açıklandı', score: 65, source_count: 2, signals: { ...signals, turkey_interest: 24 } });
assert.ok(!globalDeal.some((format) => format.key === 'affiliate'), 'Türkiye fiyatı olmadan satın alma önerisi yapılmamalı');

const update = contentOpportunitiesFor({ title: 'Android yeni sürüm çıktı', score: 65, source_count: 2, signals,
  published_match: { title: 'Android yeni sürüm', url: 'https://teknoblog.com/android' } });
assert.equal(update[0].key, 'update');
assert.ok(!update.some((format) => format.key === 'news'), 'yayınlanmış konu için ikinci haber otomatik önerilmemeli');

const now = Date.parse('2026-10-03T09:00:00Z');
const result = buildEditorialDashboard([{ id: '1', title: 'WhatsApp yeni gizlilik özelliği kullanıma açıldı', url: 'https://example.com/a', source_id: 'a', source_name: 'Kaynak A',
  created_at: '2026-10-03T08:00:00Z', published_at: '2026-10-03T08:00:00Z', trust_score: 80, health_quality_score: 80, market_relevance: 'local', discover_score: 45, editorial_score: 70 }], [], now);
assert.equal(result.lanes.produce.length, 1, 'haber kuyruğuna girmeyen güçlü rehber fırsatı Üret bölümüne düşmeli');
assert.ok(result.lanes.produce[0].content_opportunities.some((format) => format.key === 'guide'));
const weak = buildEditorialDashboard([{ id: '2', title: 'WhatsApp yeni gizlilik özelliği kullanıma açıldı', url: 'https://example.com/b', source_id: 'b', source_name: 'Kaynak B',
  created_at: '2026-10-03T08:00:00Z', published_at: '2026-10-03T08:00:00Z', trust_score: 30, health_quality_score: 25, market_relevance: 'global', discover_score: 40, editorial_score: 40 }], [], now);
assert.equal(weak.lanes.produce.length, 0, 'zayıf kaynak tek başına üretim kuyruğunu doldurmamalı');
console.log('content opportunity tests passed');
