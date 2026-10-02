import { json, queryLocal } from './_lib.js';
import { readSession } from '../lib/lock.js';
import { fetchArticleLinks } from '../lib/origin-finder.js';

const cache = new Map();

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!readSession(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    const input = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const storyId = String(input.story_id || '');
    if (!/^[a-f0-9]{16}$/.test(storyId)) return json(res, 400, { error: 'Geçersiz konu kimliği' });
    const cached = cache.get(storyId);
    if (cached && cached.expiresAt > Date.now()) return json(res, 200, { ...cached.result, cache: 'fresh' });
    const [stories, officialSources] = await Promise.all([
      queryLocal('SELECT title,payload FROM editorial_story_clusters WHERE id=$1', [storyId]),
      queryLocal(`SELECT name,site_url FROM sources WHERE source_type='official' AND is_active=true AND site_url IS NOT NULL`)
    ]);
    const story = stories.rows[0];
    if (!story) return json(res, 404, { error: 'Konu henüz kayıtlı değil; bir sonraki Radar taramasından sonra tekrar dene' });
    const direct = (story.payload?.sources || []).filter((source) => source.type === 'official')
      .map((source) => ({ url: source.url, official_name: source.name, anchor_text: source.title,
        found_on: source.url, status: 'monitored_official_source' }));
    const candidates = [...direct];
    const scanned = [];
    for (const source of (story.payload?.sources || []).filter((item) => item.type !== 'official').slice(0, 3)) {
      try {
        const links = await fetchArticleLinks(source, officialSources.rows);
        candidates.push(...links);
        scanned.push({ name: source.name, url: source.url, status: 'scanned' });
      } catch (error) {
        scanned.push({ name: source.name, url: source.url, status: 'unavailable' });
      }
    }
    const unique = [...new Map(candidates.map((item) => [item.url, item])).values()].slice(0, 12);
    const result = { story_id: storyId, title: story.title, candidates: unique, scanned,
      note: 'Bağlantılar yalnızca muhtemel ilk kaynak adaylarıdır; içeriği ve iddiayı editör doğrulamalı.' };
    cache.set(storyId, { expiresAt: Date.now() + 30 * 60000, result });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return json(res, 200, { ...result, cache: 'miss' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
