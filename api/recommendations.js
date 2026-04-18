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

    const [{ data: items, error: itemsError }, { data: sources, error: sourcesError }] = await Promise.all([
      supabase
        .from('topic_candidates')
        .select('*')
        .eq('status', 'active')
        .order(sortKey, { ascending: false })
        .limit(100),
      supabase
        .from('sources')
        .select('id,name')
    ]);

    if (itemsError) return json(res, 500, { error: itemsError.message });
    if (sourcesError) return json(res, 500, { error: sourcesError.message });

    const sourceMap = new Map((sources || []).map((source) => [String(source.id), source.name || '']));
    const enriched = (items || []).map((item) => ({
      ...item,
      source_name: item.source_name || sourceMap.get(String(item.source_id)) || ''
    }));

    return json(res, 200, { items: enriched });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
