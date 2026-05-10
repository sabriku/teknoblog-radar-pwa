import { getSupabaseAdmin, json } from './_lib.js';

function scoreValue(item, key) {
  const value = Number(item?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function timeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function ageHours(item) {
  const published = timeValue(item?.published_at || item?.updated_at);
  if (!published) return 999999;
  return Math.max(0, (Date.now() - published) / 3600000);
}

function freshnessBoost(item) {
  const hours = ageHours(item);
  if (hours <= 6) return 24;
  if (hours <= 12) return 20;
  if (hours <= 24) return 16;
  if (hours <= 48) return 12;
  if (hours <= 72) return 8;
  if (hours <= 168) return 4;
  if (hours <= 336) return 0;
  if (hours <= 720) return -8;
  return -18;
}

function adjustedScore(item, sortKey) {
  return scoreValue(item, sortKey) + freshnessBoost(item);
}

function compareItems(a, b, sortKey) {
  if (sortKey === 'published_at' || sortKey === 'updated_at') {
    return timeValue(b?.[sortKey]) - timeValue(a?.[sortKey]);
  }

  const adjustedDiff = adjustedScore(b, sortKey) - adjustedScore(a, sortKey);
  if (adjustedDiff !== 0) return adjustedDiff;

  const rawScoreDiff = scoreValue(b, sortKey) - scoreValue(a, sortKey);
  if (rawScoreDiff !== 0) return rawScoreDiff;

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
