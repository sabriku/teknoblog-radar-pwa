import { getSupabaseAdmin, json } from './_lib.js';

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const limit = Math.min(Math.max(Number(req.query?.limit || 20), 1), 50);

    const { data: clusters, error } = await supabase
      .from('trend_clusters')
      .select('*')
      .neq('status', 'archived')
      .order('trend_score', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(limit);

    if (error) return json(res, 500, { error: error.message });

    const ids = (clusters || []).map((item) => item.id).filter(Boolean);
    let links = [];
    if (ids.length) {
      const { data: linkRows } = await supabase
        .from('trend_news_links')
        .select('cluster_id,candidate_title,candidate_url,source_name,match_score')
        .in('cluster_id', ids)
        .order('match_score', { ascending: false });
      links = linkRows || [];
    }

    const linksByCluster = new Map();
    for (const link of links) {
      const key = String(link.cluster_id || '');
      if (!linksByCluster.has(key)) linksByCluster.set(key, []);
      if (linksByCluster.get(key).length < 5) linksByCluster.get(key).push(link);
    }

    const items = (clusters || []).map((cluster) => ({
      ...cluster,
      linked_news: linksByCluster.get(String(cluster.id || '')) || []
    }));

    return json(res, 200, { items });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
