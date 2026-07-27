import assert from 'node:assert/strict';
import { digestScore, editorialImportance, selectDiverse, storyScore } from '../api/instagram-radar.js';

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const important = {
  title: 'WhatsApp kritik güvenlik açığını kapatan güncellemeyi yayımladı',
  summary: 'Milyonlarca kullanıcıyı etkileyen güvenlik açığı için yeni sürüm yayımlandı ve kullanıcıların hemen güncelleme yapması gerekiyor.',
  published_at: hoursAgo(8), image_url: 'https://example.com/security.jpg', is_teknoblog: true
};
const merelyRecent = {
  title: 'Android uygulamasına küçük tasarım değişikliği geldi',
  summary: 'Uygulamadaki bir simgenin görünümü değiştirildi.',
  published_at: hoursAgo(.5), image_url: 'https://example.com/icon.jpg', is_teknoblog: true
};

assert.ok(editorialImportance(important) > editorialImportance(merelyRecent), 'kritik ve geniş etkili haber daha önemli sayılmalı');
assert.ok(storyScore(important) > storyScore(merelyRecent), 'Story seçimi yalnızca en yeni haberi öne çıkarmamalı');
assert.ok(digestScore(important) > digestScore(merelyRecent), 'Kanal özeti editoryal öneme göre sıralanmalı');

const diverse = selectDiverse([
  { title: 'Samsung Galaxy S27 duyuruldu', story_score: 96, topic_family: 'samsung' },
  { title: 'Samsung Galaxy Watch güncellendi', story_score: 94, topic_family: 'samsung' },
  { title: 'Apple iPhone güncellemesi yayımlandı', story_score: 90, topic_family: 'apple' },
  { title: 'WhatsApp güvenlik özelliği geldi', story_score: 88, topic_family: 'social' }
], 'story_score', 3, 1);
assert.deepEqual(diverse.map((item) => item.topic_family), ['samsung', 'apple', 'social'], 'ilk seçim turu marka ve konu çeşitliliği sağlamalı');

console.log('instagram ranking tests passed');
