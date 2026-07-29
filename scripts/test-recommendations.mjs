import assert from 'node:assert/strict';
import { buildPerformanceProfiles, calibrateDiscoverScores, compareItems, performanceAffinity } from '../api/recommendations.js';

const profiles = buildPerformanceProfiles([
  { title: 'Garmin yeni akıllı saat modelini tanıttı', discover_clicks: 900, discover_impressions: 70000, discover_ctr: .013, ga4_views: 24000, ga4_active_users: 21000, ga4_engagement_rate: .72 },
  { title: 'Windows küçük bir hata düzeltmesi aldı', discover_clicks: 5, discover_impressions: 300, discover_ctr: .01, ga4_views: 250, ga4_active_users: 200, ga4_engagement_rate: .35 }
]);

const similar = performanceAffinity({ title: 'Garmin yeni spor saati ortaya çıktı', summary: 'Akıllı saat yeni özelliklerle geliyor.' }, profiles);
const unrelated = performanceAffinity({ title: 'Adobe Photoshop abonelik seçeneklerini yeniledi' }, profiles);
assert.ok(similar.discover > unrelated.discover, 'başarılı Teknoblog konusuna benzeyen haber daha güçlü Discover sinyali almalı');
assert.ok(similar.traffic > unrelated.traffic, 'yüksek hitli konu benzerliği trafik sinyaline yansımalı');

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
assert.ok(calibrated[0].discover_score >= 90 && calibrated[0].discover_score <= 96, 'ilk yüzde 2, 90–96 aralığına kalibre edilmeli');
assert.ok(calibrated[5].discover_score >= 82 && calibrated[5].discover_score <= 89, 'sonraki güçlü dilim 82–89 aralığında olmalı');
assert.ok(calibrated[15].discover_score >= 75 && calibrated[15].discover_score <= 81, 'takip eden dilim 75–81 aralığında olmalı');
assert.deepEqual(calibrated.map((item) => item.discover_score), [...calibrated].map((item) => item.discover_score).sort((a, b) => b - a), 'kalibrasyon Discover sırasını bozmamalı');
assert.equal(calibrated[0].precalibrated_discover_score, 100, 'kalibrasyon öncesi puan denetim için korunmalı');

console.log('recommendations scoring tests passed');
