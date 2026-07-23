import assert from 'node:assert/strict';
import { publicationMatch } from '../api/intelligence.js';

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

console.log('intelligence publication matching tests passed');
