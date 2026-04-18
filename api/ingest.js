const crypto = require('crypto');
const { json, getEnv, supabaseFetch } = require('./_lib');

const FEEDS = [
  'https://www.theverge.com/rss/index.xml',
  'https://feeds.feedburner.com/TechCrunch/',
  'https://www.engadget.com/rss.xml'
];

function stripTag(text = '') {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRSS(xml) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of blocks.slice(0, 20)) {
    const pick = (tag) => {
      const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return match ? stripTag(match[1]) : '';
    };
    const title = pick('title');
    const link = pick('link');
    const pubDate = pick('pubDate');
    const description = pick('description');
    if (title && link) items.push({ title, link, pubDate, description });
  }
  return items;
}

module.exports = async (req, res) => {
  const env = await getEnv();
  if (!env.ok) return json(res, 500, { error: 'Eksik environment variables', missing: env.missing });

  try {
    let inserted = 0;
    for (const feedUrl of FEEDS) {
      const xml = await fetch(feedUrl).then(r => r.text());
      const items = parseRSS(xml);
      for (const item of items) {
        const urlHash = crypto.createHash('sha256').update(item.link).digest('hex');
        const payload = {
          source_name: new URL(feedUrl).hostname,
          title: item.title,
          summary: item.description?.slice(0, 500) || '',
          source_url: item.link,
          url_hash: urlHash,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
        };
        await supabaseFetch('raw_feed_items?on_conflict=url_hash', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(payload)
        });
        inserted += 1;
      }
    }
    return json(res, 200, { ok: true, inserted });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
