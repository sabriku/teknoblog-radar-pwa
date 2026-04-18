const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function decodeHtml(str = '') {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function stripTags(str = '') {
  return decodeHtml(str)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFirstMatch(str, patterns) {
  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return '';
}

function extractImage(block = '') {
  const enclosure = getFirstMatch(block, [
    /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["'][^"']*image[^"']*["'][^>]*>/i,
    /<media:content[^>]+url=["']([^"']+)["'][^>]*>/i,
    /<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*>/i,
  ]);
  if (enclosure) return enclosure;

  const htmlImage = getFirstMatch(block, [
    /<img[^>]+src=["']([^"']+)["'][^>]*>/i,
  ]);
  return htmlImage || null;
}

function parseRssItems(xml = '') {
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return items.map((block) => {
    const title = stripTags(getFirstMatch(block, [/<title>([\s\S]*?)<\/title>/i]));
    const link = stripTags(getFirstMatch(block, [/<link>([\s\S]*?)<\/link>/i]));
    const descriptionRaw = getFirstMatch(block, [
      /<description>([\s\S]*?)<\/description>/i,
      /<content:encoded>([\s\S]*?)<\/content:encoded>/i,
    ]);
    const pubDate = stripTags(getFirstMatch(block, [/<pubDate>([\s\S]*?)<\/pubDate>/i]));
    const imageUrl = extractImage(block);

    return {
      title,
      url: link,
      canonical_url: link,
      summary: stripTags(descriptionRaw).slice(0, 420),
      image_url: imageUrl,
      published_at: pubDate ? new Date(pubDate).toISOString() : null,
    };
  });
}

function parseAtomEntries(xml = '') {
  const entries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return entries.map((block) => {
    const title = stripTags(getFirstMatch(block, [/<title[^>]*>([\s\S]*?)<\/title>/i]));
    const link = getFirstMatch(block, [
      /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i,
      /<link[^>]+href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i,
      /<id>([\s\S]*?)<\/id>/i,
    ]);
    const summaryRaw = getFirstMatch(block, [
      /<summary[^>]*>([\s\S]*?)<\/summary>/i,
      /<content[^>]*>([\s\S]*?)<\/content>/i,
    ]);
    const published = stripTags(getFirstMatch(block, [
      /<updated>([\s\S]*?)<\/updated>/i,
      /<published>([\s\S]*?)<\/published>/i,
    ]));
    const imageUrl = extractImage(block);

    return {
      title,
      url: stripTags(link),
      canonical_url: stripTags(link),
      summary: stripTags(summaryRaw).slice(0, 420),
      image_url: imageUrl,
      published_at: published ? new Date(published).toISOString() : null,
    };
  });
}

function parseFeed(xml = '') {
  if (!xml || typeof xml !== 'string') return [];
  if (/<rss|<rdf:RDF/i.test(xml)) return parseRssItems(xml);
  if (/<feed\b/i.test(xml)) return parseAtomEntries(xml);
  return [];
}

function sha1(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase environment variables are missing' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('id,name,rss_url,feed_url,site_url,is_active')
      .eq('is_active', true);

    if (sourcesError) {
      throw new Error(`Sources fetch failed: ${sourcesError.message}`);
    }

    let ingested = 0;
    const debug = [];

    for (const source of sources || []) {
      const feedUrl = source.rss_url || source.feed_url;
      if (!feedUrl) {
        debug.push({ source: source.name, status: 'skipped', reason: 'No feed URL' });
        continue;
      }

      try {
        const response = await fetch(feedUrl, {
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; TeknoblogRadarBot/1.0)',
            accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          },
        });

        if (!response.ok) {
          debug.push({ source: source.name, status: 'failed', reason: `HTTP ${response.status}`, feedUrl });
          continue;
        }

        const xml = await response.text();
        const parsed = parseFeed(xml).filter((item) => item.title && item.url).slice(0, 20);

        if (!parsed.length) {
          debug.push({ source: source.name, status: 'failed', reason: 'No parsable items', feedUrl });
          continue;
        }

        for (const item of parsed) {
          const contentHash = sha1(`${item.title}|${item.url}`);
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
            .upsert(row, { onConflict: 'content_hash', ignoreDuplicates: true });

          if (!insertError) ingested += 1;
        }

        debug.push({ source: source.name, status: 'ok', insertedApprox: parsed.length, feedUrl });
      } catch (error) {
        debug.push({ source: source.name, status: 'failed', reason: error.message || String(error), feedUrl });
      }
    }

    return res.status(200).json({ ok: true, ingested, debug });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected ingest failure' });
  }
};
