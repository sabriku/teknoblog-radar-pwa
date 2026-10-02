import assert from 'node:assert/strict';
import { buildPerformanceCalibration, calibrateFit } from '../lib/performance-calibration.js';

const sparse = buildPerformanceCalibration([{ title: 'Samsung Galaxy S27 kamera', discover_clicks: 100 }]);
assert.equal(sparse.status, 'insufficient_data');
assert.equal(calibrateFit('Samsung Galaxy S27 kamera', 60, sparse).adjustment, 0);

const samples = [
  ...Array.from({ length: 20 }, (_, index) => ({ title: `Adobe Photoshop abonelik seçenekleri ${index}`, discover_clicks: 5, ga4_views: 100 })),
  { title: 'Samsung Galaxy S27 kamera özellikleri açıklandı', discover_clicks: 2200, ga4_views: 40000 },
  { title: 'Samsung Galaxy S27 kamera sensörü tanıtıldı', discover_clicks: 1800, ga4_views: 32000 }
];
const model = buildPerformanceCalibration(samples);
assert.equal(model.status, 'active');
const strong = calibrateFit('Samsung Galaxy S27 yeni kamera sensörünü tanıttı', 60, model);
const unknown = calibrateFit('Garmin Venu 5 yeni sağlık özellikleri', 60, model);
assert.ok(strong.adjustment > 0 && strong.adjustment <= 8, 'benzer başarılı yayınlar uyumu sınırlı artırmalı');
assert.equal(strong.matched_samples, 2);
assert.equal(unknown.adjustment, 0, 'emsal olmayan konuya öğrenilmiş etki uygulanmamalı');
console.log('performance calibration tests passed');
