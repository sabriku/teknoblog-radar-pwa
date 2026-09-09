import assert from 'node:assert/strict';
import { buildPerformanceProfiles, calibrateDiscoverScores, collapseStoryDuplicates, compareItems, diversifyItems, performanceAffinity } from '../api/recommendations.js';

const profiles = buildPerformanceProfiles([
  { title: 'Garmin yeni akıllı saat modelini tanıttı', discover_clicks: 900, discover_impressions: 70000, discover_ctr: .013, ga4_views: 24000, ga4_active_users: 21000, ga4_engagement_rate: .72 },
  { title: 'Windows küçük bir hata düzeltmesi aldı', discover_clicks: 5, discover_impressions: 300, discover_ctr: .01, ga4_views: 250, ga4_active_users: 200, ga4_engagement_rate: .35 }
]);

const similar = performanceAffinity({ title: 'Garmin yeni spor saati ortaya çıktı', summary: 'Akıllı saat yeni özelliklerle geliyor.' }, profiles);
const unrelated = performanceAffinity({ title: 'Adobe Photoshop abonelik seçeneklerini yeniledi' }, profiles);
assert.ok(similar.discover > unrelated.discover, 'başarılı Teknoblog konusuna benzeyen haber daha güçlü Discover sinyali almalı');
assert.ok(similar.traffic > unrelated.traffic, 'yüksek hitli konu benzerliği trafik sinyaline yansımalı');
assert.deepEqual(
  performanceAffinity({ title: 'Garmin yeni spor saati ortaya çıktı', summary: 'Akıllı saat yeni özelliklerle geliyor.' }, [...profiles]),
  similar,
  'performans profili kelime indeksi tam taramayla aynı sonucu vermeli'
);

const sorted = [
  { title: 'Düşük', discover_score: 61, published_at: '2026-07-29T08:00:00Z' },
  { title: 'Yüksek', discover_score: 89, published_at: '2026-07-29T07:00:00Z' }
].sort((a, b) => compareItems(a, b, 'discover_score'));
assert.equal(sorted[0].title, 'Yüksek', 'Discover sırası kesin olarak yüksekten düşüğe olmalı');

const now = new Date().toISOString();
const calibrated = calibrateDiscoverScores(Array.from({ length: 100 }, (_, index) => ({
  title: `Aday ${index + 1}`,
  discover_score: 100 - index,
  discover_probability: 100 - index,
  published_at: now
}))).sort((a, b) => compareItems(a, b, 'discover_score'));
assert.ok(calibrated[0].discover_score >= 96 && calibrated[0].discover_score <= 100, 'çok güçlü aday yalnızca küçük bir sıra düzeltmesi almalı');
assert.ok(Math.abs(calibrated[5].discover_score - 95) <= 4, 'kalibrasyon gerçek intelligence puanını dört puandan fazla oynatmamalı');
assert.ok(Math.abs(calibrated[15].discover_score - 85) <= 4, 'orta dilimde yapay yüksek puan üretilmemeli');
assert.deepEqual(calibrated.map((item) => item.discover_score), [...calibrated].map((item) => item.discover_score).sort((a, b) => b - a), 'kalibrasyon Discover sırasını bozmamalı');
assert.equal(calibrated[0].precalibrated_discover_score, 100, 'kalibrasyon öncesi puan denetim için korunmalı');
const weakPool = calibrateDiscoverScores(Array.from({ length: 20 }, (_, index) => ({
  title: `Zayıf aday ${index}`, discover_score: 55 - index, discover_probability: 48 - index, score_confidence: 80, published_at: now
})));
assert.ok(Math.max(...weakPool.map((item) => item.discover_score)) <= 59, 'zayıf havuzun lideri yalnızca birinci olduğu için 90+ olmamalı');
const tied = [
  { title: 'Düşük ham puan', discover_score: 90, precalibrated_discover_score: 70, published_at: '2026-07-29T09:00:00Z' },
  { title: 'Yüksek ham puan', discover_score: 90, precalibrated_discover_score: 74, published_at: '2026-07-29T08:00:00Z' }
].sort((a, b) => compareItems(a, b, 'discover_score'));
assert.equal(tied[0].title, 'Yüksek ham puan', 'eşit kalibre puanlarda gerçek intelligence sırası korunmalı');

const samsungHeavy = [
  ...Array.from({ length: 20 }, (_, index) => ({ title: `Samsung Galaxy haberi ${index}`, brand_name: 'Samsung', source_name: `Samsung kaynak ${index % 4}`, discover_score: 100 - index * .2, published_at: now })),
  ...['Apple', 'Google', 'Xiaomi', 'Huawei', 'NVIDIA', 'AMD', 'Intel', 'Garmin'].flatMap((brand, brandIndex) => Array.from({ length: 3 }, (_, index) => ({ title: `${brand} haberi ${index}`, brand_name: brand, source_name: `${brand} kaynak`, discover_score: 94 - brandIndex - index * .2, published_at: now })))
];
const diversified = diversifyItems(samsungHeavy, 'discover_score').slice(0, 20);
const samsungCount = diversified.filter((item) => item.brand_name === 'Samsung').length;
assert.ok(samsungCount <= 4, `ilk 20 içinde Samsung kotası aşılmamalı (gelen: ${samsungCount})`);
assert.ok(new Set(diversified.map((item) => item.brand_name)).size >= 6, 'ilk 20 listesi farklı markaları görünür kılmalı');

const collapsed = collapseStoryDuplicates([
  { title: 'Garmin Venu 5 yeni uyku özellikleriyle tanıtıldı', summary: 'Garmin Venu 5 sağlık özellikleri', source_name: 'Kaynak A', url: 'https://a.test/garmin', published_at: now, image_url: 'https://a.test/a.jpg', source_trust_score: 90 },
  { title: 'Garmin Venu 5 uyku ve sağlık özellikleriyle tanıtıldı', summary: 'Garmin Venu 5 sağlık özellikleri', source_name: 'Kaynak B', url: 'https://b.test/garmin', published_at: now, source_trust_score: 85 },
  { title: 'Garmin yeni bisiklet bilgisayarını satışa sundu', source_name: 'Kaynak C', url: 'https://c.test/garmin-bike', published_at: now }
]);
assert.equal(collapsed.length, 2, 'aynı gelişmenin kuvvetli tekrarları tek fırsatta birleştirilmeli');
assert.equal(collapsed[0].corroborating_source_count, 2, 'birleştirilen fırsatta bağımsız kaynak sayısı korunmalı');
assert.equal(collapsed[0].alternative_sources.length, 1, 'alternatif kaynak bağlantısı kaybolmamalı');

console.log('recommendations scoring tests passed');
