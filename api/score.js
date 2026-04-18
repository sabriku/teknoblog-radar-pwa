const crypto = require('crypto');
const { json, getEnv, supabaseFetch, scoreItem } = require('./_lib');

module.exports = async (req, res) => {
  const env = await getEnv();
  if (!env.ok) return json(res, 500, { error: 'Eksik environment variables', missing: env.missing });

  try {
    const rawItems = await supabaseFetch('raw_feed_items?select=id,title,summary,source_url,published_at&order=published_at.desc&limit=50', { method: 'GET' });
    let processed = 0;
    for (const item of rawItems) {
      const scores = scoreItem(item);
      const candidateHash = crypto.createHash('sha256').update((item.title || '') + '|' + (item.source_url || '')).digest('hex');
      const payload = {
        candidate_hash: candidateHash,
        title: item.title,
        summary: item.summary,
        source_url: item.source_url,
        traffic_score: scores.traffic_score,
        conversion_score: scores.conversion_score,
        discover_score: scores.discover_score,
        social_score: scores.social_score,
        editorial_score: scores.editorial_score,
        total_score: scores.total_score,
        status: 'active',
        updated_at: new Date().toISOString()
      };
      await supabaseFetch('topic_candidates?on_conflict=candidate_hash', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload)
      });
      processed += 1;
    }
    return json(res, 200, { ok: true, processed });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
