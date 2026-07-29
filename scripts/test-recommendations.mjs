import assert from 'node:assert/strict';
import { buildPerformanceProfiles, compareItems, performanceAffinity } from '../api/recommendations.js';

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

console.log('recommendations scoring tests passed');
