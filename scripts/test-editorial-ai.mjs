import assert from 'node:assert/strict';
import { aiRequestFor, generateAiDraft, parseAiResponse } from '../lib/editorial-ai.js';
import aiHandler from '../api/editorial-ai.js';

const story = { title: 'Yeni telefon iddiası', summary: 'Kaynak yalnızca yeni modelden söz ediyor.',
  research: { status: 'single_source', sources: [{ name: 'Kaynak', title: 'Yeni telefon iddiası', url: 'https://example.test/news', type: 'secondary' }] } };
const request = aiRequestFor(story);
assert.equal(request.store, false);
assert.equal(request.text.format.type, 'json_schema');
assert.ok(request.instructions.includes('İddia'));
const draft = { discover_titles: ['Başlık 1', 'Başlık 2', 'Başlık 3'], seo_title: 'SEO', intro_draft: 'Taslak giriş',
  slug: 'yeni-telefon-iddiasi', meta_description: 'Meta', social_text: 'Sosyal', verification_note: 'Doğrula' };
const apiResponse = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] };
assert.deepEqual(parseAiResponse(apiResponse), draft);
assert.throws(() => parseAiResponse({ status: 'incomplete', output: [] }), /tamamlanmadı/);
const generated = await generateAiDraft(story, { apiKey: 'test-only', fetchImpl: async (url, options) => {
  assert.equal(url, 'https://api.openai.com/v1/responses');
  assert.equal(JSON.parse(options.body).input.includes('Yeni telefon iddiası'), true);
  return { ok: true, json: async () => apiResponse };
} });
assert.deepEqual(generated, draft);
await assert.rejects(() => generateAiDraft(story, {}), /API_KEY/);
const res = { status(code) { this.statusCode = code; return this; }, setHeader() { return this; }, end(body) { this.body = JSON.parse(body); } };
await aiHandler({ method: 'GET', headers: {} }, res);
assert.equal(res.statusCode, 401);
console.log('editorial AI tests passed');
