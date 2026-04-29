import { getSupabaseAdmin, json, parseFeedItems, hashValue, chooseFeedUrl, safeText, nowIso } from './_lib.js';

function getCutoff(period = '') {
  const now = Date.now();
  if (period === '1d') return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (period === '1w') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (period === '1m') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

async function fetchSingleSource(supabase, source, itemLimit = 15) {
  const feedUrl = chooseFeedUrl(source);
  if (!feedUrl) return { ok: false, error: 'No feed URL' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(feedUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
        'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const xml = await response.text();
    const items = parseFeedItems(xml).slice(0, itemLimit);
    let ingested = 0;
    let updated = 0;

    for (const item of items) {
      const title = safeText(item.title);
      const url = safeText(item.url || item.link);
      const summary = safeText(item.summary || item.description);
      const published_at = safeText(item.published_at || '') || null;
      const image_url = safeText(item.image_url || item.image || '') || null;
      const content_hash = hashValue(`${title}|${url}`);
      const url_hash = hashValue(url);

      if (!title || !url) continue;

      const { data: existing, error: existingError } = await supabase
        .from('raw_feed_items')
        .select('id,image_url,summary,published_at')
        .eq('content_hash', content_hash)
        .limit(1);

      if (existingError) continue;

      const current = existing && existing.length > 0 ? existing[0] : null;

      if (current) {
        const patch = {};
        if (image_url && !current.image_url) patch.image_url = image_url;
        if (summary && (!current.summary || current.summary.length < summary.length)) patch.summary = summary;
        if (published_at && !current.published_at) patch.published_at = published_at;
        if (Object.keys(patch).length > 0) {
          const { error: updateError } = await supabase.from('raw_feed_items').update(patch).eq('id', current.id);
          if (!updateError) updated += 1;
        }
        continue;
      }

      const payload = {
        source_id: source.id,
        source_name: source.name || '',
        source_url: source.site_url || source.rss_url || source.feed_url || url,
        title,
        url,
        canonical_url: url,
        summary,
        image_url,
        published_at,
        content_hash,
        url_hash,
        created_at: nowIso()
      };

      const { error: insertError } = await supabase.from('raw_feed_items').insert(payload);
      if (!insertError) ingested += 1;
    }

    return { ok: true, ingested, updated, fetched: items.length };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();

    if (req.method === 'GET') {
      const id = String(req.query?.id || '').trim();
      let query = supabase.from('sources').select('*').order('priority_weight', { ascending: false });
      if (id) query = query.eq('id', id).limit(1);
      const { data, error } = await query;
      if (error) return json(res, 500, { error: error.message });
      if (id) return json(res, 200, { item: Array.isArray(data) ? (data[0] || null) : null });
      return json(res, 200, { items: data || [] });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

      if (body.action === 'fetch_source') {
        const sourceId = String(body.source_id || '').trim();
        if (!sourceId) return json(res, 400, { error: 'source_id gerekli' });
        const { data: source, error: sourceError } = await supabase.from('sources').select('*').eq('id', sourceId).limit(1).single();
        if (sourceError || !source) return json(res, 404, { error: 'Kaynak bulunamadı' });
        const result = await fetchSingleSource(supabase, source, 15);
        if (!result.ok) return json(res, 500, { error: result.error || 'Kaynak çekilemedi' });
        return json(res, 200, { ok: true, source_id: sourceId, ...result });
      }

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

      const { data, error } = await supabase.from('sources').insert(payload).select().single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { item: data });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const sourceId = String(body.id || body.source_id || '').trim();
      if (!sourceId) return json(res, 400, { error: 'id gerekli' });
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
      const { data, error } = await supabase.from('sources').update(payload).eq('id', sourceId).select().single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { item: data });
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const sourceId = String(body.source_id || '').trim();

      if (sourceId) {
        const { data: rawItems, error: rawError } = await supabase.from('raw_feed_items').select('id').eq('source_id', sourceId).limit(5000);
        if (rawError) return json(res, 500, { error: rawError.message });
        const rawIds = (rawItems || []).map((item) => item.id).filter(Boolean);
        if (rawIds.length > 0) {
          const { error: topicDeleteError } = await supabase.from('topic_candidates').delete().in('raw_feed_item_id', rawIds);
          if (topicDeleteError) return json(res, 500, { error: topicDeleteError.message });
          const { error: rawDeleteError } = await supabase.from('raw_feed_items').delete().in('id', rawIds);
          if (rawDeleteError) return json(res, 500, { error: rawDeleteError.message });
        }
        const { error: sourceDeleteError } = await supabase.from('sources').delete().eq('id', sourceId);
        if (sourceDeleteError) return json(res, 500, { error: sourceDeleteError.message });
        return json(res, 200, { ok: true, source_id: sourceId, deleted_raw_feed_items: rawIds.length });
      }

      const token = req.query?.token || req.headers['x-cron-token'] || '';
      const expected = process.env.CRON_TOKEN || '';
      if (!expected || token !== expected) return json(res, 401, { error: 'Yetkisiz istek' });

      const period = body.period || 'all';
      const cutoff = getCutoff(period);
      let rawItems = [];
      let rawError = null;

      if (cutoff) {
        const result = await supabase.from('raw_feed_items').select('id').or(`published_at.gte.${cutoff},created_at.gte.${cutoff}`).limit(5000);
        rawItems = result.data || [];
        rawError = result.error || null;
      } else {
        const result = await supabase.from('raw_feed_items').select('id').limit(5000);
        rawItems = result.data || [];
        rawError = result.error || null;
      }

      if (rawError) return json(res, 500, { error: rawError.message });
      const rawIds = rawItems.map((item) => item.id).filter(Boolean);
      if (rawIds.length === 0) return json(res, 200, { ok: true, period, deleted_topic_candidates: 0, deleted_raw_feed_items: 0 });

      const { data: topicRows, error: topicSelectError } = await supabase.from('topic_candidates').select('id').in('raw_feed_item_id', rawIds).limit(5000);
      if (topicSelectError) return json(res, 500, { error: topicSelectError.message });
      const deletedTopicCandidates = (topicRows || []).length;
      const { error: topicDeleteError } = await supabase.from('topic_candidates').delete().in('raw_feed_item_id', rawIds);
      if (topicDeleteError) return json(res, 500, { error: topicDeleteError.message });
      const { error: rawDeleteError } = await supabase.from('raw_feed_items').delete().in('id', rawIds);
      if (rawDeleteError) return json(res, 500, { error: rawDeleteError.message });

      return json(res, 200, { ok: true, period, deleted_topic_candidates: deletedTopicCandidates, deleted_raw_feed_items: rawIds.length });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
