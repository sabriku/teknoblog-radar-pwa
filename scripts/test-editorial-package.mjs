import assert from 'node:assert/strict';
import { editorialPackageFor } from '../lib/editorial-package.js';

const title = 'iPhone 18 Pro kamera iddiası: Türkiye fiyatı henüz açıklanmadı';
const result = editorialPackageFor({ title, image_url: 'https://example.test/image.jpg',
  research: { official_source_count: 0, checks: ['Resmî kaynağı bul.'] } });
assert.equal(result.status, 'editor_review_required');
assert.equal(result.headline_drafts.length, 3);
assert.equal(result.headline_drafts[0].text, title);
assert.ok(result.headline_drafts[1].text.includes('açık sorular'));
assert.ok(result.headline_drafts[1].text.includes('iddiası'), 'belirsizlik taslakta korunmalı');
assert.ok(result.slug_draft.includes('turkiye-fiyati'));
assert.equal(result.image.rights_verified, false);
assert.ok(result.before_publish.includes('Resmî kaynağı bul.'));
assert.ok(!JSON.stringify(result).includes('fiyatı açıklandı'), 'kanıtta olmayan kesin iddia üretilmemeli');
const update = editorialPackageFor({ title: 'Yeni güncelleme', published_match: { url: 'https://teknoblog.com/old' },
  research: { official_source_count: 1, possible_discrepancies: [{ unit: 'mah' }] } });
assert.ok(update.headline_drafts[2].text.includes('güncellendi'));
assert.equal(update.existing_article.url, 'https://teknoblog.com/old');
assert.ok(update.before_publish.some((check) => check.includes('farklı sayılar')));
console.log('editorial package tests passed');
