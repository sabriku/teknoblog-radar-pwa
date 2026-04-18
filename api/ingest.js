const crypto = require('crypto');
const { json, getEnv, supabaseFetch } = require('./_lib');

function stripTag(text = '') {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRSS(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?>[\s\S]*?<\/item>/g) || [];
  for (const block of blocks.slice(0, 25)) {
    const pick = (tag) => {
      const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return match ? stripTag(match[1]) : '';
    };
    const title = pick('title');
    const link = pick('link');
    const pubDate = pick('pubDate') || pick('published') || pick('updated');
    const description = pick('description') || pick('content:encoded');
    if (title && link) items.push({ title, link, pubDate, description });
  }
  return items;
}

module.exports = async (req, res) => {
  const env = await getEnv();
  if (!env.ok) return json(res, 500, { error: 'Eksik environment variables', missing: env.missing });

  try {
    const sources = await supabaseFetch('sources?select=id,name,feed_url,source_type,market_relevance,priority_weight,trust_score,is_active&is_active=eq.true&order=priority_weight.desc', { method: 'GET' });
    let inserted = 0;
    for (const source of sources) {
      const xml = await fetch(source.feed_url).then(r => r.text());
      const items = parseRSS(xml);
      for (const item of items) {
        const cleanLink = item.link.trim();
        const urlHash = crypto.createHash('sha256').update(cleanLink).digest('hex');
        const payload = {
          source_id: source.id,
          source_name: source.name,
          title: item.title,
          summary: item.description?.slice(0, 800) || '',
          source_url: cleanLink,
          canonical_url: cleanLink,
          url_hash: urlHash,
          canonical_url_hash: urlHash,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          source_type: source.source_type,
          market_relevance: source.market_relevance,
          trust_score: source.trust_score,
          priority_weight: source.priority_weight
        };
        await supabaseFetch('raw_feed_items?on_conflict=url_hash', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(payload)
        });
        inserted += 1;
      }
    }
    return json(res, 200, { ok: true, inserted, source_count: sources.length });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
