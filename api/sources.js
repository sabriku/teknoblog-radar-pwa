const { json, getSupabase, nowIso } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const supabase = await getSupabase();

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const payload = {
        name: body.name,
        feed_url: body.rss_url || body.feed_url,
        rss_url: body.rss_url || body.feed_url,
        site_url: body.site_url || null,
        source_type: body.source_type || 'news',
        market_relevance: body.market_relevance || 'global',
        priority_weight: Number(body.priority_weight || 70),
        trust_score: Number(body.trust_score || 70),
        is_active: body.is_active !== false,
        updated_at: nowIso(),
      };

      if (!payload.name || !payload.rss_url) return json(res, 400, { error: 'name and rss_url are required' });

      const { data, error } = await supabase.from('sources').insert(payload).select('*').single();
      if (error) throw error;
      return json(res, 200, { ok: true, item: data });
    }

    const { data, error } = await supabase
      .from('sources')
      .select('id,name,feed_url,rss_url,site_url,source_type,market_relevance,priority_weight,trust_score,is_active')
      .order('priority_weight', { ascending: false })
      .limit(200);
    if (error) throw error;

    return json(res, 200, { items: data || [] });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
