import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getSupabaseAdmin() {
  return createClient(
    getEnv('SUPABASE_URL'),
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

export function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export function nowIso() {
  return new Date().toISOString();
}

export function safeText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashValue(value) {
  return createHash('sha1').update(String(value)).digest('hex');
}

export function chooseFeedUrl(source = {}) {
  return source.rss_url || source.feed_url || '';
}

function firstMatch(pattern, text) {
  const match = text.match(pattern);
  return match ? (match[1] || '').trim() : '';
}

function decodeHtml(s = '') {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractImage(block) {
  return decodeHtml(
    firstMatch(/<media:content[^>]*url=["']([^"']+)["']/i, block) ||
    firstMatch(/<media:thumbnail[^>]*url=["']([^"']+)["']/i, block) ||
    firstMatch(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']*["']/i, block) ||
    firstMatch(/<itunes:image[^>]*href=["']([^"']+)["']/i, block) ||
    firstMatch(/<img[^>]*src=["']([^"']+)["']/i, block)
  );
}

function parseRssItems(xml) {
  const items = [];
  const matches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  for (const block of matches) {
    const title = safeText(firstMatch(/<title>([\s\S]*?)<\/title>/i, block));
    const url = decodeHtml(
      firstMatch(/<link>([\s\S]*?)<\/link>/i, block) ||
      firstMatch(/<guid[^>]*>([\s\S]*?)<\/guid>/i, block)
    );
    const summaryRaw =
      firstMatch(/<description>([\s\S]*?)<\/description>/i, block) ||
      firstMatch(/<content:encoded>([\s\S]*?)<\/content:encoded>/i, block);
    const published_at =
      firstMatch(/<pubDate>([\s\S]*?)<\/pubDate>/i, block) ||
      firstMatch(/<dc:date>([\s\S]*?)<\/dc:date>/i, block);
    const image_url = extractImage(block);
    const summary = safeText(summaryRaw);

    if (title && url) {
      items.push({ title, url, summary, published_at, image_url });
    }
  }

  return items;
}

function parseAtomEntries(xml) {
  const items = [];
  const matches = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];

  for (const block of matches) {
    const title = safeText(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, block));
    const url = decodeHtml(
      firstMatch(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i, block) ||
      firstMatch(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i, block) ||
      firstMatch(/<id>([\s\S]*?)<\/id>/i, block)
    );
    const summaryRaw =
      firstMatch(/<summary[^>]*>([\s\S]*?)<\/summary>/i, block) ||
      firstMatch(/<content[^>]*>([\s\S]*?)<\/content>/i, block);
    const published_at =
      firstMatch(/<updated>([\s\S]*?)<\/updated>/i, block) ||
      firstMatch(/<published>([\s\S]*?)<\/published>/i, block);
    const image_url = extractImage(block);
    const summary = safeText(summaryRaw);

    if (title && url) {
      items.push({ title, url, summary, published_at, image_url });
    }
  }

  return items;
}

export function parseFeedItems(xml) {
  if (!xml || typeof xml !== 'string') return [];
  if (/<rss[\s>]/i.test(xml) || /<channel[\s>]/i.test(xml)) return parseRssItems(xml);
  if (/<feed[\s>]/i.test(xml)) return parseAtomEntries(xml);
  return parseRssItems(xml);
}
