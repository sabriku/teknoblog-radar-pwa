import assert from 'node:assert/strict';
import { canonicalArticleUrl, parseFeedItems } from '../api/_lib.js';

const rss = `<rss><channel><item><title>Yeni telefon &amp; kamera</title><link>https://example.com/news?a=1&amp;utm_source=rss</link><description><![CDATA[<p>Özet <img src="/images/phone.jpg"></p>]]></description><pubDate>Sat, 03 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
const [rssItem] = parseFeedItems(rss, 'https://example.com/feed.xml');
assert.equal(rssItem.title, 'Yeni telefon & kamera');
assert.equal(rssItem.image_url, 'https://example.com/images/phone.jpg');
assert.equal(canonicalArticleUrl(rssItem.url), 'https://example.com/news?a=1');

const atom = `<feed><entry><title>Yeni model</title><link href="https://example.com/feed/1" rel="self"/><link href="/news/model" rel="alternate"/><summary>Model ayrıntıları</summary><media:thumbnail url="/images/model.jpg"/></entry></feed>`;
const [atomItem] = parseFeedItems(atom, 'https://example.com/feed.xml');
assert.equal(atomItem.url, 'https://example.com/news/model');
assert.equal(atomItem.image_url, 'https://example.com/images/model.jpg');
assert.equal(parseFeedItems('<rss><channel><item><title>Kötü</title><link>javascript:alert(1)</link></item></channel></rss>').length, 0);
assert.equal(canonicalArticleUrl('https://example.com/a?utm_campaign=x&b=2&fbclid=1#section'), 'https://example.com/a?b=2');
console.log('feed ingest tests passed');
