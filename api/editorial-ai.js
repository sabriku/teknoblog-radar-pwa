import { json, queryLocal } from './_lib.js';
import { readSession } from '../lib/lock.js';
import { generateAiDraft } from '../lib/editorial-ai.js';

const cache = new Map();

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
    if (!readSession(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    const configured = Boolean(process.env.OPENAI_API_KEY);
    if (req.method === 'GET') return json(res, 200, { configured, model: configured ? (process.env.RADAR_OPENAI_MODEL || 'gpt-6-astra') : null });
    if (!configured) return json(res, 503, { error: 'Yapay zekâ taslak üretimi için API anahtarı yapılandırılmadı' });
    const input = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const storyId = String(input.story_id || '');
    if (!/^[a-f0-9]{16}$/.test(storyId)) return json(res, 400, { error: 'Geçersiz konu kimliği' });
    const result = await queryLocal('SELECT id,title,payload FROM editorial_story_clusters WHERE id=$1', [storyId]);
    const row = result.rows[0];
    if (!row) return json(res, 404, { error: 'Konu henüz kayıtlı değil; bir sonraki Radar taramasından sonra tekrar dene' });
    const sourceHash = JSON.stringify((row.payload?.research?.sources || []).map((source) => [source.url, source.title]));
    const cached = cache.get(storyId);
    if (cached && cached.sourceHash === sourceHash && cached.expiresAt > Date.now()) {
      return json(res, 200, { ...cached.result, cache: 'fresh' });
    }
    const model = process.env.RADAR_OPENAI_MODEL || 'gpt-6-astra';
    const draft = await generateAiDraft({ title: row.title, summary: row.payload?.summary,
      research: row.payload?.research, published_match: row.payload?.published_match },
    { apiKey: process.env.OPENAI_API_KEY, model });
    const output = { story_id: storyId, model, draft, status: 'editor_review_required',
      sources: row.payload?.research?.sources || [] };
    cache.set(storyId, { sourceHash, expiresAt: Date.now() + 30 * 60000, result: output });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return json(res, 200, { ...output, cache: 'miss' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
