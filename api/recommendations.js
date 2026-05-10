import { getSupabaseAdmin, json } from './_lib.js';

function scoreValue(item, key) {
  const value = Number(item?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function timeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareItems(a, b, sortKey) {
  if (sortKey === 'published_at' || sortKey === 'updated_at') {
    return timeValue(b?.[sortKey]) - timeValue(a?.[sortKey]);
  }

  const scoreDiff = scoreValue(b, sortKey) - scoreValue(a, sortKey);
  if (scoreDiff !== 0) return scoreDiff;

  const publishedDiff = timeValue(b?.published_at) - timeValue(a?.published_at);
  if (publishedDiff !== 0) return publishedDiff;

  return timeValue(b?.updated_at) - timeValue(a?.updated_at);
}

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
      'updated_at',
      'published_at'
    ];

    const sortKey = allowedSorts.includes(sort) ? sort : 'total_score';

    const [{ data: items, error: itemsError }, { data: sources, error: sourcesError }, { data: rawItems, error: rawItemsError }] = await Promise.all([
      supabase
        .from('topic_candidates')
        .select('*')
        .eq('status', 'active')
        .limit(1000),
      supabase
        .from('sources')
        .select('id,name'),
      supabase
        .from('raw_feed_items')
        .select('id,published_at,image_url,source_id')
        .order('created_at', { ascending: false })
        .limit(10000)
    ]);

    if (itemsError) return json(res, 500, { error: itemsError.message });
    if (sourcesError) return json(res, 500, { error: sourcesError.message });
    if (rawItemsError) return json(res, 500, { error: rawItemsError.message });

    const sourceMap = new Map((sources || []).map((source) => [String(source.id), source.name || '']));
    const rawMap = new Map((rawItems || []).map((item) => [String(item.id), item]));

    const enriched = (items || []).map((item) => {
      const raw = rawMap.get(String(item.raw_feed_item_id || '')) || null;
      return {
        ...item,
        source_name: item.source_name || sourceMap.get(String(item.source_id)) || sourceMap.get(String(raw?.source_id || '')) || '',
        published_at: item.published_at || raw?.published_at || null,
        image_url: item.image_url || raw?.image_url || null
      };
    });

    enriched.sort((a, b) => compareItems(a, b, sortKey));

    return json(res, 200, { items: enriched.slice(0, 500) });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
