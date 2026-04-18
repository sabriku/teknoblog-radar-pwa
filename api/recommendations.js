const { json, getEnv, supabaseFetch } = require('./_lib');

module.exports = async (req, res) => {
  const env = await getEnv();
  if (!env.ok) return json(res, 500, { error: 'Eksik environment variables', missing: env.missing });
  try {
    const type = req.query?.type || '';
    const filters = ['status=eq.active'];
    if (type) filters.push(`content_type_hint=eq.${encodeURIComponent(type)}`);
    const qs = filters.join('&');
    const items = await supabaseFetch(`topic_candidates?select=id,title,summary,total_score,traffic_score,conversion_score,discover_score,social_score,editorial_score,content_type_hint,source_name,published_at,updated_at,status&${qs}&order=total_score.desc&limit=30`, { method: 'GET' });
    return json(res, 200, { items });
  } catch (error) {
    return json(res, 500, { error: error.message, items: [] });
  }
};
