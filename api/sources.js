const { json, sb } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const sources = await sb('sources?select=*&order=priority_weight.desc', { method: 'GET' }, true);
      return json(res, 200, { items: sources });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const payload = {
        name: body.name,
        rss_url: body.rss_url,
        site_url: body.site_url || null,
        source_type: body.source_type || 'news',
        market_relevance: body.market_relevance || 'global',
        priority_weight: Number(body.priority_weight || 70),
        trust_score: Number(body.trust_score || 75),
        is_active: true,
      };
      const inserted = await sb('sources', { method: 'POST', body: JSON.stringify(payload) }, true);
      return json(res, 200, { ok: true, item: inserted?.[0] || null });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
