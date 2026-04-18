import { json, getSupabaseAdmin, parseFeedItems, hashValue, chooseFeedUrl, safeText, nowIso } from '../_lib.js';

export default async function handler(req, res) {
  try {
    const token = req.query?.token || '';
    const expected = process.env.CRON_TOKEN || '';

    if (!expected || token !== expected) {
      return json(res, 401, { error: 'Yetkisiz istek' });
    }

    const supabase = getSupabaseAdmin();

    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .order('priority_weight', { ascending: false });

    if (sourcesError) return json(res, 500, { error: sourcesError.message });

    let ingested = 0;
    let updated = 0;
    const debug = [];

    for (const source of sources || []) {
      const feedUrl = chooseFeedUrl(source);

      if (!feedUrl) {
        debug.push({ source: source.name, status: 'skipped', reason: 'No feed URL' });
        continue;
      }

      try {
        const response = await fetch(feedUrl, {
          headers: {
            'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
            'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
          },
          cache: 'no-store'
        });

        if (!response.ok) {
          debug.push({ source: source.name, status: 'http_error', feedUrl, code: response.status });
          continue;
        }

        const xml = await response.text();
        const items = parseFeedItems(xml);

        debug.push({ source: source.name, status: 'fetched', feedUrl, count: items.length });

        for (const item of items) {
          const title = safeText(item.title);
          const url = safeText(item.url || item.link);
          const summary = safeText(item.summary || item.description);
          const image_url = safeText(item.image_url || item.image || '');
          const content_hash = hashValue(`${title}|${url}`);

          if (!title || !url) continue;

          const { data: existing, error: existingError } = await supabase
            .from('raw_feed_items')
            .select('id,image_url,summary,published_at')
            .eq('content_hash', content_hash)
            .limit(1);

          if (existingError) continue;

          if (existing && existing.length > 0) {
            const current = existing[0];
            const patch = {};
            if (image_url && !current.image_url) patch.image_url = image_url;
            if (summary && (!current.summary || current.summary.length < summary.length)) patch.summary = summary;
            if (item.published_at && !current.published_at) patch.published_at = item.published_at;

            if (Object.keys(patch).length > 0) {
              const { error: updateError } = await supabase
                .from('raw_feed_items')
                .update(patch)
                .eq('id', current.id);
              if (!updateError) updated += 1;
            }
            continue;
          }

          const payload = {
            source_id: source.id,
            title,
            url,
            canonical_url: url,
            summary,
            image_url: image_url || null,
            published_at: item.published_at || null,
            content_hash,
            created_at: nowIso()
          };

          const { error: insertError } = await supabase
            .from('raw_feed_items')
            .insert(payload);

          if (!insertError) ingested += 1;
        }
      } catch (error) {
        debug.push({
          source: source.name,
          status: 'exception',
          feedUrl,
          error: error?.message || String(error)
        });
      }
    }

    return json(res, 200, {
      ok: true,
      ingested,
      updated,
      debug,
      finished_at: nowIso()
    });
  } catch (error) {
    return json(res, 500, {
      error: error?.message || String(error),
      finished_at: nowIso()
    });
  }
}
