import assert from 'node:assert/strict';
import { clusterCompetitorRows, hasTurkeyContext, performanceProfile, promptFor } from '../api/competitor-radar.js';

const clusters = clusterCompetitorRows([
  { id: '1', source_name: 'DonanımHaber', title: 'Apple yeni iPhone modelini tanıttı', url: 'https://a.example/iphone', published_at: new Date().toISOString(), trust_score: 80 },
  { id: '2', source_name: 'LOG', title: 'Apple yeni iPhone modelini resmen tanıttı', url: 'https://b.example/iphone', published_at: new Date().toISOString(), trust_score: 75 },
  { id: '3', source_name: 'Webrazzi', title: 'OpenAI yeni yapay zeka modelini duyurdu', url: 'https://c.example/openai', published_at: new Date().toISOString(), trust_score: 78 }
]);
assert.equal(clusters.length, 2, 'benzer rakip haberleri tek konu kümesine alınmalı');
assert.equal(clusters.find((cluster) => cluster.rows.length === 2)?.rows.length, 2);

const profile = performanceProfile({ discover_clicks: 250, discover_impressions: 35000, discover_ctr: .007, google_news_clicks: 40, google_news_impressions: 9000, ga4_views: 80000, ga4_active_users: 50000, ga4_engagement_rate: .62 });
assert.ok(profile.discover > 60, 'gerçek Discover performansı güçlü sinyal üretmeli');
assert.ok(profile.audience > 60, 'GA4 hit geçmişi güçlü sinyal üretmeli');

const item = {
  title: 'Garmin yeni akıllı saatini duyurdu', summary: 'Küresel ürün duyurusu', opportunity_label: 'Kritik fırsat', discover_score: 86, news_score: 81, velocity_score: 72,
  reasons: ['Haber ilk 12 saatinde.', 'Üç rakip yayın aynı konu kümesinde.'],
  performance_match: { title: 'Garmin saat haberi', discover_score: 82, news_score: 60, audience_score: 88 },
  references: [{ source_name: 'LOG', title: 'Garmin yeni ürününü duyurdu', url: 'https://www.log.com.tr/garmin-urun' }]
};
assert.equal(hasTurkeyContext(item), false);
const prompt = promptFor(item);
assert.match(prompt, /Sabri Küstür gibi yazan Teknoblog editörü/);
assert.match(prompt, /SEO meta açıklaması: 150–160 karakter/);
assert.match(prompt, /Facebook özeti/);
assert.match(prompt, /X özeti/);
assert.match(prompt, /Yapay bir Türkiye bağlantısı kurma/);
assert.match(prompt, /https:\/\/www\.log\.com\.tr\/garmin-urun/);
assert.doesNotMatch(prompt, /3 Google Discover başlığı/);

console.log('competitor radar tests passed');
