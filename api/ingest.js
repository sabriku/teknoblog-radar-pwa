const { json, getSupabase, parseFeedItems, hashValue, chooseFeedUrl, safeText, nowIso } = require('./_lib');

module.exports = async (req, res) => {
  const supabase = await getSupabase();
  const debug = [];
  try {
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('id,name,feed_url,rss_url,site_url,is_active')
      .eq('is_active', true)
      .order('priority_weight', { ascending: false })
      .limit(50);

    if (sourcesError) throw sourcesError;

    let ingested = 0;
    let processedSources = 0;

    for (const source of sources || []) {
      const feedUrl = chooseFeedUrl(source);
      if (!feedUrl) {
        debug.push({ source: source.name, skipped: 'missing_feed_url' });
        continue;
      }

      try {
        const response = await fetch(feedUrl, {
          headers: {
            'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
            'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          },
        });

        if (!response.ok) {
          debug.push({ source: source.name, feedUrl, skipped: `http_${response.status}` });
          continue;
        }

        const xml = await safeText(response);
        if (!xml || xml.length < 80) {
          debug.push({ source: source.name, feedUrl, skipped: 'empty_xml' });
          continue;
        }

        const items = parseFeedItems(xml).slice(0, 20);
        processedSources += 1;

        for (const item of items) {
          const contentHash = hashValue(`${item.title}|${item.url}`);
          const row = {
            source_id: source.id,
            title: item.title,
            url: item.url,
            canonical_url: item.canonical_url || item.url,
            summary: item.summary || '',
            image_url: item.image_url,
            published_at: item.published_at,
            content_hash: contentHash,
          };

          const { error: insertError } = await supabase
            .from('raw_feed_items')
            .upsert(row, { onConflict: 'content_hash', ignoreDuplicates: false });

          if (!insertError) ingested += 1;
        }

        debug.push({ source: source.name, feedUrl, fetched: items.length });
      } catch (error) {
        debug.push({ source: source.name, feedUrl, skipped: error.message });
      }
    }

    return json(res, 200, {
      ok: true,
      ingested,
      processed_sources: processedSources,
      finished_at: nowIso(),
      debug,
    });
  } catch (error) {
    return json(res, 500, { error: error.message, finished_at: nowIso(), debug });
  }
};
