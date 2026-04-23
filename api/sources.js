import { getSupabaseAdmin, json } from './_lib.js';
import { requireAuthorizedRequest } from './auth.js';

function getCutoff(period = '') {
  const now = Date.now();
  if (period === '1d') return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (period === '1w') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (period === '1m') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

export default async function handler(req, res) {
  try {
    const allowCronToken = req.method === 'DELETE';
    const access = await requireAuthorizedRequest(req, res, { allowCronToken });
    if (!access) return;

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

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const period = body.period || 'all';
      const cutoff = getCutoff(period);

      let rawItems = [];
      let rawError = null;

      if (cutoff) {
        const result = await supabase
          .from('raw_feed_items')
          .select('id')
          .or(`published_at.gte.${cutoff},created_at.gte.${cutoff}`)
          .limit(5000);
        rawItems = result.data || [];
        rawError = result.error || null;
      } else {
        const result = await supabase
          .from('raw_feed_items')
          .select('id')
          .limit(5000);
        rawItems = result.data || [];
        rawError = result.error || null;
      }

      if (rawError) return json(res, 500, { error: rawError.message });

      const rawIds = rawItems.map((item) => item.id).filter(Boolean);
      if (rawIds.length === 0) {
        return json(res, 200, { ok: true, period, deleted_topic_candidates: 0, deleted_raw_feed_items: 0 });
      }

      const { data: topicRows, error: topicSelectError } = await supabase
        .from('topic_candidates')
        .select('id')
        .in('raw_feed_item_id', rawIds)
        .limit(5000);

      if (topicSelectError) return json(res, 500, { error: topicSelectError.message });

      const deletedTopicCandidates = (topicRows || []).length;

      const { error: topicDeleteError } = await supabase
        .from('topic_candidates')
        .delete()
        .in('raw_feed_item_id', rawIds);

      if (topicDeleteError) return json(res, 500, { error: topicDeleteError.message });

      const { error: rawDeleteError } = await supabase
        .from('raw_feed_items')
        .delete()
        .in('id', rawIds);

      if (rawDeleteError) return json(res, 500, { error: rawDeleteError.message });

      return json(res, 200, {
        ok: true,
        period,
        deleted_topic_candidates: deletedTopicCandidates,
        deleted_raw_feed_items: rawIds.length
      });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
