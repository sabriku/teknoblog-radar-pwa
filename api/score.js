const crypto = require('crypto');
const { json, getEnv, supabaseFetch, scoreItem } = require('./_lib');

module.exports = async (req, res) => {
  const env = await getEnv();
  if (!env.ok) return json(res, 500, { error: 'Eksik environment variables', missing: env.missing });

  try {
    const [rawItems, blacklistRows] = await Promise.all([
      supabaseFetch('raw_feed_items?select=id,title,summary,source_url,published_at,source_name,source_type,market_relevance,trust_score,priority_weight&order=published_at.desc&limit=120', { method: 'GET' }),
      supabaseFetch('source_blacklist_terms?select=term', { method: 'GET' })
    ]);

    const blacklistTerms = blacklistRows.map(x => String(x.term || '').toLowerCase()).filter(Boolean);
    let processed = 0;

    for (const item of rawItems) {
      const scores = scoreItem(item, blacklistTerms);
      if (scores.total_score < 15) continue;

      const candidateHash = crypto.createHash('sha256').update((scores.topic_cluster_key || '') + '|' + (item.source_url || '')).digest('hex');
      const payload = {
        candidate_hash: candidateHash,
        title: item.title,
        summary: item.summary,
        source_url: item.source_url,
        source_name: item.source_name,
        source_type: item.source_type,
        market_relevance: item.market_relevance,
        trust_score: item.trust_score || 50,
        priority_weight: item.priority_weight || 50,
        content_type_hint: scores.content_type_hint,
        topic_cluster_key: scores.topic_cluster_key,
        canonical_topic_title: scores.canonical_topic_title,
        source_count: 1,
        published_at: item.published_at,
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
