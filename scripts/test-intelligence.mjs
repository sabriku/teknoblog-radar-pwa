import assert from 'node:assert/strict';
import { publicationMatch, evidenceLevelFor, burstForecastFor, alertLevelFor, strategyScoreFor } from '../api/intelligence.js';
import { intelligenceFeatureWeight } from '../api/_intelligence-model.js';

assert.equal(publicationMatch(
  'Second iOS 27 and iPadOS 27 Public Betas Now Available',
  'iOS 27 ve iPadOS 27 beta sürümleri kullanıma sunuldu'
).accepted, true, 'aynı ürün ve sürüm numarasıyla çevrilmiş başlık eşleşmeli');

assert.equal(publicationMatch(
  'Xiaomi 17 Pro receives a major camera update',
  'Xiaomi 18 Pro için büyük kamera güncellemesi yayımlandı'
).accepted, false, 'farklı model numaraları eşleşmemeli');

assert.equal(publicationMatch(
  'Garmin CIRQA smart sleep system announced',
  'Garmin CIRQA akıllı uyku sistemi tanıtıldı'
).accepted, true, 'aynı ayırt edici ürün başlığı eşleşmeli');

assert.equal(publicationMatch(
  'Samsung launches a new Galaxy phone',
  'Samsung Galaxy Watch için yeni güncelleme geldi'
).accepted, false, 'yalnızca marka ortaklığı yayın teyidi sayılmamalı');

assert.equal(publicationMatch(
  'Başlık tamamen farklı',
  'Teknoblog yayını',
  'https://www.teknoblog.com/ornek-haber/?utm_source=radar',
  'https://teknoblog.com/ornek-haber/'
).accepted, true, 'aynı kanonik Teknoblog URL adresi kesin eşleşmeli');

assert.equal(evidenceLevelFor({ official_source_count: 1, source_count: 2 }).level, 'official_confirmed');
assert.equal(evidenceLevelFor({ official_source_count: 0, source_count: 1 }).level, 'single_claim');
assert.equal(alertLevelFor({ first_mover_score: 90, breakout_probability: 82, opportunity_minutes: 120, owned_coverage: false }).key, 'red');
assert.ok(burstForecastFor({ breakout_probability: 70, source_count: 3, momentum_score: 70, novelty_score: 70 }).probability >= 65);
assert.ok(strategyScoreFor({ first_mover_score: 90, breakout_probability: 80, novelty_score: 80, momentum_score: 70, confidence_score: 70, competitor_count: 0 }, 'speed') >= 70);
assert.ok(intelligenceFeatureWeight('type:launch') > intelligenceFeatureWeight('entity:samsung'), 'öğrenmede hikâye tipi marka kimliğinden daha güçlü olmalı');

console.log('intelligence publication matching tests passed');
