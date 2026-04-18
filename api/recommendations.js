const { json, getEnv, supabaseFetch } = require('./_lib');

module.exports = async (req, res) => {
  const env = await getEnv();
  if (!env.ok) return json(res, 500, { error: 'Eksik environment variables', missing: env.missing });
  try {
    const items = await supabaseFetch('topic_candidates?select=id,title,summary,total_score,traffic_score,conversion_score,discover_score,social_score,updated_at,status&status=eq.active&order=total_score.desc&limit=20', { method: 'GET' });
    return json(res, 200, { items });
  } catch (error) {
    return json(res, 500, { error: error.message, items: [] });
  }
};
