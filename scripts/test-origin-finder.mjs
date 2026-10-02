import assert from 'node:assert/strict';
import { fetchArticleLinks, isAllowedArticleUrl, officialLinksInHtml } from '../lib/origin-finder.js';
import originHandler from '../api/editorial-origin.js';

const article = 'https://www.macrumors.com/2026/10/example/';
const source = { url: article, site_url: 'https://www.macrumors.com', name: 'MacRumors' };
const official = [{ name: 'Apple Newsroom', site_url: 'https://www.apple.com/newsroom/' }];
assert.equal(isAllowedArticleUrl(article, source.site_url), true);
assert.equal(isAllowedArticleUrl('http://127.0.0.1/admin', source.site_url), false);
assert.equal(isAllowedArticleUrl('https://evil.test/story', source.site_url), false);
const html = '<a href="https://podcasts.apple.com/show"><svg></svg></a><a href="https://www.apple.com/newsroom/2026/10/update/">Apple açıklaması</a><a href="https://other.test/x">Diğer</a>';
const links = officialLinksInHtml(html, article, official);
assert.equal(links.length, 1);
assert.equal(links[0].official_name, 'Apple Newsroom');
assert.equal(links[0].status, 'candidate_only');
const fetched = await fetchArticleLinks(source, official, { lookupImpl: async () => [{ address: '8.8.8.8' }],
  fetchImpl: async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/html' }),
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(html)); controller.close(); } }) }) });
assert.equal(fetched.length, 1);
assert.deepEqual(await fetchArticleLinks(source, official, { lookupImpl: async () => [{ address: '127.0.0.1' }],
  fetchImpl: async () => { throw new Error('private address must not be fetched'); } }), []);
const res = { status(code) { this.statusCode = code; return this; }, setHeader() { return this; }, end(body) { this.body = JSON.parse(body); } };
await originHandler({ method: 'POST', headers: {} }, res);
assert.equal(res.statusCode, 401);
console.log('origin finder tests passed');
