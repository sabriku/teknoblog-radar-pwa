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
  'MG Ekim 2026 Fiyat Listesi',
  'Audi Ekim 2026 fiyat listesinde A3 3,6 milyon TL’den başlıyor'
).accepted, false, 'ortak ay ve fiyat sözcükleri farklı markaları eşleştirmemeli');

assert.equal(publicationMatch(
  'Google Pixel 11 için yeni kamera güncellemesi',
  'Google Pixel 10 için yeni kamera güncellemesi'
).accepted, false, 'farklı model sürümleri aynı haber sayılmamalı');

for (const [source, published] of [
  ['Huawei FreeBuds Neo inceleme: Bu fiyata efsane gürültü engelleme ve ses', 'Huawei FreeBuds Neo Türkiye fiyatıyla satışa çıktı: Pil ve gürültü engelleme ayrıntıları'],
  ['Galaxy S27 Ultra, S26 Ultra\'daki En Büyük Sorunlardan Birini Çözecek', 'Galaxy S27 Ultra, S26 Ultra’nın boyutlarını büyük ölçüde koruyabilir'],
  ['Huawei Mate 90 Pro Max Sınıfta Kaldı: Performansı Yetersiz Kaldı', 'Huawei Mate 90 Pro Max 1 inç kamera modülüyle fark yaratıyor'],
  ['RedMagic 12 Pro+ Test Sonuçları Ortaya Çıktı: Zirveyi Zorluyor', 'RedMagic 12 Pro+ tasarımı değişiyor, ilk detaylar ortaya çıktı'],
  ['Yazılım geliştirme ve bulut altyapısı girişimi Supabase, 150 milyon dolar yatırım aldı', 'Robotlara çip geliştiren SiMa.ai 150 milyon dolar aldı'],
  ['iOS 27.2 Beta 3 Yayınlandı', 'iOS 27 beta 7 çıktı, Apple Eylül sürümüne yaklaştı'],
  ['GTA 6\'nın Yaş Sınırı Ortaya Çıktı', 'Vivo X Fold 6 için beklenen tarih ortaya çıktı'],
  ['Honor’s Galaxy Z Fold 8 and iPhone Duo rival is reportedly launching in January', 'iPhone Duo tanıtıldıktan sonra Galaxy Z Fold 8 satışları hızlandı'],
  ['Google’s Fitbit Edge Could Slot Between The Fitbit Air And The Pixel Watch 5', 'Google Pixel Watch Ultra fikri Fitbit Air’dan güç alıyor'],
  ['Symmetry vs asymmetry: How the Galaxy Z Fold 8 beats the iPhone Duo', 'iPhone Duo tanıtıldıktan sonra Galaxy Z Fold 8 satışları hızlandı']
]) assert.equal(publicationMatch(source, published).accepted, false, `farklı olaylar karışmamalı: ${source}`);

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
