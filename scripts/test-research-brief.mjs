import assert from 'node:assert/strict';
import { buildResearchBrief } from '../lib/research-brief.js';
import { buildEditorialDashboard } from '../lib/editorial-decision.js';

const first = { name: 'Yayın A', title: 'Telefon için yeni özellik iddiası', url: 'https://a.test/story',
  published_at: '2026-10-03T09:00:00Z', type: 'news' };
const official = { name: 'Üretici', title: 'Telefon için yeni özellik açıklandı', url: 'https://brand.test/news',
  published_at: '2026-10-03T10:00:00Z', type: 'official' };
const brief = buildResearchBrief({ title: first.title, sources: [official, first],
  signals: { turkey_interest: 70 }, published_match: { title: 'Eski yazı' },
  content_opportunities: [{ checks: ['Sürüm numarasını kontrol et.'] }] });
assert.equal(brief.status, 'official_source_seen');
assert.equal(brief.earliest_source.url, first.url);
assert.deepEqual(brief.sources.map((source) => source.url), [first.url, official.url]);
assert.ok(brief.checks.some((check) => check.includes('Türkiye')));
assert.ok(brief.checks.some((check) => check.includes('mevcut yayın')));
assert.ok(brief.checks.includes('Sürüm numarasını kontrol et.'));
assert.equal(brief.sources[0].title, first.title, 'kaynak başlığı iddia olarak ve bağlantısıyla taşınmalı');

const single = buildResearchBrief({ sources: [first] });
assert.equal(single.status, 'single_source');
assert.ok(single.checks.some((check) => check.includes('resmî')));
assert.ok(single.checks.some((check) => check.includes('ikinci')));
assert.equal(buildResearchBrief({ sources: [first, { ...first, url: 'javascript:alert(1)' }] }).source_count, 1,
  'güvensiz URL araştırma bağlantısına girmemeli');
const discrepant = buildResearchBrief({ sources: [
  { ...first, title: 'Telefon 7000 mAh pil ile geliyor' },
  { ...official, title: 'Telefon 6800 mAh pil ile geliyor' }
] });
assert.equal(discrepant.possible_discrepancies[0].unit, 'mah');
assert.deepEqual(discrepant.possible_discrepancies[0].mentions.map((item) => item.value), [7000, 6800]);
assert.ok(discrepant.checks.some((check) => check.includes('farklı rakamların')));
assert.equal(buildResearchBrief({ sources: [
  { ...first, title: 'Telefon 6 GB ve 8 GB seçenekleri' },
  { ...official, title: 'Telefon 8 GB seçenekleri' }
] }).possible_discrepancies.length, 0, 'tek başlıkta birden fazla konfigürasyon varsa uyarı verme');

const now = Date.parse('2026-10-03T11:00:00Z');
const row = { id: '1', source_id: 'official', source_name: 'Üretici', source_type: 'official',
  title: official.title, url: official.url, published_at: official.published_at,
  created_at: official.published_at, trust_score: 80, health_quality_score: 80,
  market_relevance: 'mixed', discover_score: 75, editorial_score: 75 };
const dashboard = buildEditorialDashboard([row], [], now);
assert.equal(dashboard.model.version, 'editorial_v5');
assert.equal(dashboard.observed_cards[0].research.status, 'official_source_seen');
assert.equal(dashboard.observed_cards[0].research.sources[0].title, official.title);
console.log('research brief tests passed');
