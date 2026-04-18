const { json, getEnv, supabaseFetch } = require('./_lib');

module.exports = async (req, res) => {
  const env = await getEnv();
  if (!env.ok) {
    return json(res, 500, { status: 'error', missing: env.missing, now: new Date().toISOString() });
  }
  try {
    await supabaseFetch('topic_candidates?select=id&limit=1', { method: 'GET' });
    return json(res, 200, { status: 'ok', database: 'ok', now: new Date().toISOString() });
  } catch (error) {
    return json(res, 200, { status: 'partial', database: error.message, now: new Date().toISOString() });
  }
};
