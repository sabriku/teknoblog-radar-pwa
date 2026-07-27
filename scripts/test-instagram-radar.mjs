import assert from 'node:assert/strict';
import {
  digestScore, editorialImportance, instagramChannelScore, selectChannelPair, selectDiverse, storyScore, whatsappChannelScore
} from '../api/instagram-radar.js';

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
assert.equal(editorialImportance({ title: 'Marvel yeni Ghost Rider oyuncusunu duyurdu', summary: 'Apple TV uygulamasında da izlenebilecek.' }), 0, 'eğlence haberi özetteki teknoloji kelimesi nedeniyle seçilmemeli');

const diverse = selectDiverse([
  { title: 'Samsung Galaxy S27 duyuruldu', story_score: 96, topic_family: 'samsung' },
  { title: 'Samsung Galaxy Watch güncellendi', story_score: 94, topic_family: 'samsung' },
  { title: 'Apple iPhone güncellemesi yayımlandı', story_score: 90, topic_family: 'apple' },
  { title: 'WhatsApp güvenlik özelliği geldi', story_score: 88, topic_family: 'social' }
], 'story_score', 3, 1);
assert.deepEqual(diverse.map((item) => item.topic_family), ['samsung', 'apple', 'social'], 'ilk seçim turu marka ve konu çeşitliliği sağlamalı');
assert.deepEqual(diverse.map((item) => item.story_score), [96, 90, 88], 'çeşitlilik seçiminden sonra nihai liste puana göre azalan kalmalı');

const urgentUtility = {
  title: 'WhatsApp çöktü: Milyonlarca kullanıcı erişim sorunu yaşıyor',
  summary: 'Kritik kesinti sürüyor ve kullanıcıların doğrudan bilmesi gereken güncel durum açıklandı.',
  published_at: hoursAgo(1), topic_family: 'social'
};
const visualLaunch = {
  title: 'Garmin yeni akıllı saat tasarımını ilk kez gösterdi',
  summary: 'Yeni model dikkat çekici ekranı, kamera benzeri sensör yapısı ve yeni özellikleriyle tanıtıldı.',
  published_at: hoursAgo(2), image_url: 'https://example.com/garmin.jpg', social_score: 92, discover_score: 88, topic_family: 'mobility'
};
assert.ok(whatsappChannelScore(urgentUtility) > instagramChannelScore(urgentUtility), 'acil ve faydalı haber WhatsApp dinamiğinde güçlenmeli');
assert.ok(instagramChannelScore(visualLaunch) > whatsappChannelScore(visualLaunch), 'görsel ve paylaşılabilir lansman Instagram dinamiğinde güçlenmeli');

const channelCandidates = [
  urgentUtility, visualLaunch,
  { title: 'Apple iOS kritik güvenlik güncellemesini yayımladı', summary: 'iPhone kullanıcıları hemen güncellemeli.', published_at: hoursAgo(3), topic_family: 'apple' },
  { title: 'Samsung katlanabilir telefon tasarımını gösterdi', summary: 'Yeni Galaxy modeli ilk kez görüntülendi.', published_at: hoursAgo(4), image_url: 'https://example.com/galaxy.jpg', social_score: 90, discover_score: 84, topic_family: 'samsung' },
  { title: 'Google Android fiyat ve güncelleme listesini açıkladı', summary: 'Hangi modellerin güncelleme alacağı belli oldu.', published_at: hoursAgo(5), topic_family: 'google-android' },
  { title: 'NASA uzay robotunun şaşırtıcı görüntülerini paylaştı', summary: 'Yeni araştırma görüntüleri ilk kez yayımlandı.', published_at: hoursAgo(6), image_url: 'https://example.com/nasa.jpg', social_score: 86, discover_score: 82, topic_family: 'science' },
  { title: 'Microsoft Windows için ücretsiz yeni özelliği duyurdu', summary: 'Kullanıcıların işini hızlandıracak özellik bugün çıktı.', published_at: hoursAgo(7), topic_family: 'microsoft' },
  { title: 'Xiaomi kamera karşılaştırması dikkat çekti', summary: 'Yeni telefonun kamera örnekleri ve tasarımı paylaşıldı.', published_at: hoursAgo(8), image_url: 'https://example.com/xiaomi.jpg', social_score: 88, discover_score: 80, topic_family: 'mobile' }
].map((item, index) => ({ ...item, url: `https://example.com/channel-${index}`, is_teknoblog: true }));
const pair = selectChannelPair(channelCandidates, 5);
assert.equal(pair.whatsappItems.length, 5, 'WhatsApp için beş aday seçilmeli');
assert.equal(pair.instagramItems.length, 5, 'Instagram için beş aday seçilmeli');
assert.ok(pair.overlapCount <= 2, 'iki kanal arasında en fazla iki ortak haber olmalı');
assert.notDeepEqual(pair.whatsappItems.map((item) => item.url), pair.instagramItems.map((item) => item.url), 'kanal listeleri aynı olmamalı');
assert.deepEqual(pair.whatsappItems.map((item) => item.whatsapp_channel_score), [...pair.whatsappItems].map((item) => item.whatsapp_channel_score).sort((a, b) => b - a), 'WhatsApp listesi kendi puanına göre sıralanmalı');
assert.deepEqual(pair.instagramItems.map((item) => item.instagram_selection_score), [...pair.instagramItems].map((item) => item.instagram_selection_score).sort((a, b) => b - a), 'Instagram listesi kendi puanına göre sıralanmalı');

console.log('instagram ranking tests passed');
