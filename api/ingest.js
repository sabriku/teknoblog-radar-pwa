const { json, sb, parseRssItems, simpleHash, shortSummary } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const sources = await sb('sources?select=*&is_active=eq.true&order=priority_weight.desc', { method: 'GET' }, true);
    let ingested = 0;
    for (const source of sources) {
      try {
        const response = await fetch(source.rss_url, { headers: { 'User-Agent': 'TeknoblogRadar/1.0' } });
        const xml = await response.text();
        const items = parseRssItems(xml).slice(0, 10);
        for (const item of items) {
          const guid_hash = simpleHash(item.guid || item.link || item.title);
          const payload = {
            source_id: source.id,
            guid_hash,
            title: item.title,
            link: item.link,
            summary: shortSummary(item.summary, 260),
            image_url: item.image_url,
            published_at: item.published_at || null,
          };
          await sb(`raw_feed_items?on_conflict=guid_hash`, {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify(payload),
          }, true);
          ingested += 1;
        }
      } catch (err) {
        console.error('Ingest source failed', source.name, err.message);
      }
    }
    return json(res, 200, { ok: true, ingested });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
