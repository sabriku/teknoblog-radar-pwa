import { getSupabaseAdmin, json } from './_lib.js';

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .order('priority_weight', { ascending: false });

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { items: data || [] });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const feed = body.rss_url || body.feed_url || '';

      const payload = {
        name: body.name || '',
        feed_url: feed,
        rss_url: feed,
        site_url: body.site_url || '',
        source_type: body.source_type || 'news',
        market_relevance: body.market_relevance || 'global',
        priority_weight: Number(body.priority_weight || 50),
        trust_score: Number(body.trust_score || 70),
        is_active: body.is_active ?? true
      };

      const { data, error } = await supabase
        .from('sources')
        .insert(payload)
        .select()
        .single();

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { item: data });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
