const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_TOKEN = process.env.CRON_TOKEN;

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function getSupabaseHeaders(useServiceRole = false) {
  const key = useServiceRole ? SERVICE_ROLE_KEY : ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

async function sb(path, options = {}, useServiceRole = true) {
  const headers = { ...getSupabaseHeaders(useServiceRole), ...(options.headers || {}) };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    throw new Error(`Supabase error ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function stripHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function shortSummary(text = '', max = 180) {
  const cleaned = stripHtml(text);
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).trim() + '…';
}

function decodeXml(text = '') {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getTag(block, tags) {
  const list = Array.isArray(tags) ? tags : [tags];
  for (const tag of list) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = block.match(re);
    if (match) return decodeXml(match[1].trim());
  }
  return '';
}

function extractImage(block, summary = '') {
  const imgMatch = block.match(/<media:content[^>]*url=["']([^"']+)["']/i)
    || block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i)
    || summary.match(/<img[^>]*src=["']([^"']+)["']/i)
    || block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i);
  return imgMatch ? imgMatch[1] : '';
}

function parseRssItems(xml = '') {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    const title = getTag(block, 'title');
    const linkTag = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    const link = linkTag ? linkTag[1] : getTag(block, 'link');
    const guid = getTag(block, 'guid') || link || title;
    const summary = getTag(block, ['description', 'summary', 'content']);
    const pub = getTag(block, ['pubDate', 'published', 'updated']);
    const image = extractImage(block, summary);
    if (title && link) {
      items.push({ title: stripHtml(title), link, guid, summary, published_at: pub || null, image_url: image || null });
    }
  }
  return items;
}

function simpleHash(input = '') {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

const BLACKLIST = [
  'affiliate','grammarly','commission junction','plr','email marketing','content creator tools','blogger','2022','2023','2024','how i get free traffic','best wordpress plugin'
];
const BRAND_TERMS = ['apple','samsung','google','openai','microsoft','meta','qualcomm','intel','xiaomi','huawei','oneplus','sony'];
const PRODUCT_TERMS = ['iphone','galaxy','android','windows','chrome','gemini','chatgpt','one ui','wear os','copilot','ipad','pixel','macbook'];
const TURKEY_TERMS = ['turkey','türkiye','turkish','tl','₺'];
const DEAL_TERMS = ['discount','sale','deal','kampanya','fiyat','price','indirim','preorder','pre-order','satış'];
const UPDATE_TERMS = ['update','güncelleme','rollout','release','beta','patch'];
const LAUNCH_TERMS = ['launch','announces','announced','introduces','debut','tanıttı','duyurdu'];
const GUIDE_TERMS = ['how to','guide','neden','nasıl','best','top','compare','comparison'];

function inferContentType(title, summary = '') {
  const text = `${title} ${summary}`.toLowerCase();
  if (DEAL_TERMS.some(t => text.includes(t))) return 'deal';
  if (LAUNCH_TERMS.some(t => text.includes(t))) return 'launch';
  if (UPDATE_TERMS.some(t => text.includes(t))) return 'update';
  if (GUIDE_TERMS.some(t => text.includes(t))) return 'guide';
  return 'hot_news';
}

function scoreCandidate(item, source = {}) {
  const text = `${item.title} ${item.summary || ''}`.toLowerCase();
  let traffic = 25;
  let conversion = 10;
  let discover = 15;
  let social = 15;
  let editorial = Math.round((source.priority_weight || 50) / 5);

  if (BRAND_TERMS.some(t => text.includes(t))) traffic += 10;
  if (PRODUCT_TERMS.some(t => text.includes(t))) traffic += 10;
  if (TURKEY_TERMS.some(t => text.includes(t))) conversion += 12;
  if (DEAL_TERMS.some(t => text.includes(t))) conversion += 22;
  if (UPDATE_TERMS.some(t => text.includes(t))) discover += 8;
  if (LAUNCH_TERMS.some(t => text.includes(t))) social += 12;
  if (source.source_type === 'official') editorial += 12;
  editorial += Math.round((source.trust_score || 70) / 10);

  const published = item.published_at ? new Date(item.published_at) : null;
  if (published && !Number.isNaN(published.getTime())) {
    const ageHours = (Date.now() - published.getTime()) / 36e5;
    if (ageHours <= 24) {
      traffic += 10; discover += 10; social += 10;
    } else if (ageHours > 24 * 7) {
      traffic -= 10; discover -= 10; social -= 8;
    } else if (ageHours > 24 * 30) {
      traffic -= 20; discover -= 20; social -= 15;
    }
  }

  if (BLACKLIST.some(term => text.includes(term))) {
    traffic -= 25; conversion -= 20; discover -= 20; social -= 20; editorial -= 20;
  }

  const contentType = inferContentType(item.title, item.summary);
  if (contentType === 'guide') discover += 5;
  if (contentType === 'deal') conversion += 10;

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  traffic = clamp(traffic);
  conversion = clamp(conversion);
  discover = clamp(discover);
  social = clamp(social);
  editorial = clamp(editorial);
  const total = clamp(Math.round((traffic * 0.3) + (conversion * 0.25) + (discover * 0.2) + (social * 0.15) + (editorial * 0.1)));

  return {
    content_type_hint: contentType,
    traffic_score: traffic,
    conversion_score: conversion,
    discover_score: discover,
    social_score: social,
    editorial_score: editorial,
    total_score: total,
  };
}

module.exports = {
  SUPABASE_URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  CRON_TOKEN,
  json,
  sb,
  stripHtml,
  shortSummary,
  parseRssItems,
  simpleHash,
  scoreCandidate,
};
