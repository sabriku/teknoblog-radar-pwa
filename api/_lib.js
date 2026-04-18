const crypto = require('crypto');

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key, { auth: { persistSession: false } });
}

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html = '') {
  return decodeXml(String(html))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFirstMatch(text, regexes) {
  for (const regex of regexes) {
    const m = text.match(regex);
    if (m && m[1]) return decodeXml(m[1]).trim();
  }
  return '';
}

function parseFeedItems(xml = '') {
  const normalized = xml.replace(/\r/g, '');
  const entries = normalized.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return entries.map((entry) => {
    const title = stripHtml(getFirstMatch(entry, [
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]));
    const linkFromHref = getFirstMatch(entry, [
      /<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i,
    ]);
    const link = linkFromHref || stripHtml(getFirstMatch(entry, [
      /<link[^>]*>([\s\S]*?)<\/link>/i,
      /<id[^>]*>([\s\S]*?)<\/id>/i,
    ]));
    const summary = stripHtml(getFirstMatch(entry, [
      /<description[^>]*>([\s\S]*?)<\/description>/i,
      /<summary[^>]*>([\s\S]*?)<\/summary>/i,
      /<content[^>]*>([\s\S]*?)<\/content>/i,
      /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i,
    ]));
    const pubDate = getFirstMatch(entry, [
      /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i,
      /<published[^>]*>([\s\S]*?)<\/published>/i,
      /<updated[^>]*>([\s\S]*?)<\/updated>/i,
    ]);
    const image = getFirstMatch(entry, [
      /<media:content[^>]+url=["']([^"']+)["']/i,
      /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
      /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["']/i,
      /<img[^>]+src=["']([^"']+)["']/i,
    ]);

    return {
      title,
      url: link,
      canonical_url: link,
      summary,
      image_url: image || null,
      published_at: pubDate ? new Date(pubDate).toISOString() : null,
    };
  }).filter((item) => item.title && item.url);
}

function hashValue(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function chooseFeedUrl(source) {
  return source?.rss_url || source?.feed_url || null;
}

function nowIso() {
  return new Date().toISOString();
}

async function safeText(response) {
  try { return await response.text(); } catch { return ''; }
}

module.exports = {
  json,
  getSupabase,
  stripHtml,
  parseFeedItems,
  hashValue,
  chooseFeedUrl,
  nowIso,
  safeText,
};
