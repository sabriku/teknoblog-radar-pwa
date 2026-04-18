const { json, sb, scoreCandidate } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const rows = await sb('raw_feed_items?select=*,sources(*)&order=fetched_at.desc&limit=100', { method: 'GET' }, true);
    let processed = 0;
    for (const row of rows) {
      const scores = scoreCandidate({ title: row.title, summary: row.summary, published_at: row.published_at }, row.sources || {});
      const payload = {
        raw_item_id: row.id,
        title: row.title,
        url: row.link,
        summary: row.summary,
        image_url: row.image_url,
        ...scores,
        status: 'active'
      };
      await sb(`topic_candidates?on_conflict=raw_item_id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload),
      }, true);
      processed += 1;
    }
    return json(res, 200, { ok: true, processed });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
