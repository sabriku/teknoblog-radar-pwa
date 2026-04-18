import { getSupabaseAdmin, json } from './_lib.js';

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const sort = req.query?.sort || 'total_score';

    const allowedSorts = [
      'total_score',
      'traffic_score',
      'conversion_score',
      'discover_score',
      'social_score',
      'editorial_score',
      'updated_at'
    ];

    const sortKey = allowedSorts.includes(sort) ? sort : 'total_score';

    const { data, error } = await supabase
      .from('topic_candidates')
      .select('*')
      .eq('status', 'active')
      .order(sortKey, { ascending: false })
      .limit(100);

    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { items: data || [] });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
