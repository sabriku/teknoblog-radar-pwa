const { json, sb } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const sortMap = {
      total: 'total_score.desc',
      traffic: 'traffic_score.desc',
      conversion: 'conversion_score.desc',
      discover: 'discover_score.desc',
      social: 'social_score.desc',
      editorial: 'editorial_score.desc'
    };
    const sort = sortMap[req.query.sort] || sortMap.total;
    const minScore = Number.isFinite(Number(req.query.minScore)) ? Number(req.query.minScore) : 0;
    const type = req.query.type || 'all';
    const query = [`select=*`, `status=eq.active`, `total_score=gte.${minScore}`];
    if (type !== 'all') query.push(`content_type_hint=eq.${encodeURIComponent(type)}`);
    query.push(`order=${sort}`);
    query.push('limit=100');
    const items = await sb(`topic_candidates?${query.join('&')}`, { method: 'GET' }, true);
    return json(res, 200, { items });
  } catch (error) {
    return json(res, 500, { error: error.message, items: [] });
  }
};
