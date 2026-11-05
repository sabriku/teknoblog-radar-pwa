import assert from 'node:assert/strict';
import { buildDotPrompt, normalizeSourceUrl } from '../api/dot-dispatch.js';

assert.equal(normalizeSourceUrl('javascript:alert(1)'), '');
assert.equal(normalizeSourceUrl('https://example.com/a#x'), 'https://example.com/a');
const prompt = buildDotPrompt({ title: 'Yeni ürün duyuruldu', source_name: 'Örnek', source_url: 'https://example.com/news' });
assert.match(prompt, /Sabri Küstür/);
assert.match(prompt, /önümüzdeki 60 dakika/);
assert.match(prompt, /https:\/\/example\.com\/news/);
assert.match(prompt, /doğrudan çeviri olmayan/);
console.log('dot dispatch tests passed');
