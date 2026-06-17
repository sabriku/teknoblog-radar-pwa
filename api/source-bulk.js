import { getSupabaseAdmin, json, safeText, nowIso } from './_lib.js';

function normalizeUrl(value = '') {
  try {
    const url = new URL(String(value).trim());
    url.hash = '';
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    url.pathname = pathname;
    return url.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return String(value || '').trim().replace(/\/+$/, '').toLowerCase();
  }
}

function urlOrigin(value = '') {
  try { return new URL(String(value).trim()).origin; } catch { return ''; }
}

function firstMatch(pattern, text = '') {
  const match = String(text).match(pattern);
  return match ? String(match[1] || '').trim() : '';
}

function decode(value = '') {
  return safeText(String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' '));
}

function parseFeedMeta(xml = '', feedUrl = '') {
  const channel = firstMatch(/<channel\b[\s\S]*?<\/channel>/i, xml) || xml;
  const feed = firstMatch(/<feed\b[\s\S]*?<\/feed>/i, xml) || xml;
  const block = /<feed[\s>]/i.test(xml) ? feed : channel;
  const title = decode(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, block));
  const rssLink = decode(firstMatch(/<link>([\s\S]*?)<\/link>/i, block));
  const atomAlt = firstMatch(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?/i, block);
  const atomAny = firstMatch(/<link[^>]*href=["']([^"']+)["'][^>]*\/?/i, block);
  const siteUrl = rssLink || atomAlt || atomAny || urlOrigin(feedUrl);
  const description = decode(firstMatch(/<description[^>]*>([\s\S]*?)<\/description>/i, block) || firstMatch(/<subtitle[^>]*>([\s\S]*?)<\/subtitle>/i, block));
  return {
    name: title || urlOrigin(feedUrl).replace(/^https?:\/\//, '').replace(/^www\./, '') || feedUrl,
    site_url: siteUrl || urlOrigin(feedUrl),
    description
  };
}

function extractInputUrls(body = {}) {
  const raw = Array.isArray(body.rss_urls) ? body.rss_urls.join('\n') : String(body.rss_urls || body.urls || body.text || '');
  return raw.split(/\n+/)
    .map((line) => String(line || '').trim())
    .map((line) => (line.match(/https?:\/\/\S+/i) || [line])[0].replace(/[),;]+$/, ''))
    .filter((line) => /^https?:\/\//i.test(line));
}

async function inspectFeed(feedUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(feedUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    if (!/<rss[\s>]|<feed[\s>]|<channel[\s>]/i.test(text)) return { ok: false, error: 'RSS/Atom bulunamadı' };
    return { ok: true, ...parseFeedMeta(text, feedUrl) };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, error: 'Zaman aşımı' };
    return { ok: false, error: error?.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const inputUrls = extractInputUrls(body);
    if (inputUrls.length === 0) return json(res, 400, { error: 'En az bir RSS URL gerekli.' });

    const supabase = getSupabaseAdmin();
    const { data: existingSources, error: listError } = await supabase.from('sources').select('*').limit(5000);
    if (listError) return json(res, 500, { error: listError.message });

    const existingKeys = new Set();
    for (const source of existingSources || []) {
      [source.rss_url, source.feed_url, source.site_url].filter(Boolean).forEach((value) => existingKeys.add(normalizeUrl(value)));
    }

    const seenInput = new Set();
    const added = [];
    const skipped = [];
    const failed = [];

    for (const rawUrl of inputUrls) {
      const feedUrl = String(rawUrl || '').trim();
      const feedKey = normalizeUrl(feedUrl);
      if (!feedKey) continue;
      if (seenInput.has(feedKey)) {
        skipped.push({ rss_url: feedUrl, reason: 'Aynı toplu ekleme içinde tekrar ediyor' });
        continue;
      }
      seenInput.add(feedKey);
      if (existingKeys.has(feedKey)) {
        skipped.push({ rss_url: feedUrl, reason: 'Kaynak listesinde zaten var' });
        continue;
      }

      const meta = await inspectFeed(feedUrl);
      if (!meta.ok) {
        failed.push({ rss_url: feedUrl, error: meta.error || 'RSS okunamadı' });
        continue;
      }

      const siteKey = normalizeUrl(meta.site_url || urlOrigin(feedUrl));
      if (siteKey && existingKeys.has(siteKey)) {
        skipped.push({ rss_url: feedUrl, site_url: meta.site_url, reason: 'Aynı site kaynak listesinde zaten var' });
        continue;
      }

      const payload = {
        name: meta.name || urlOrigin(feedUrl) || feedUrl,
        feed_url: feedUrl,
        rss_url: feedUrl,
        site_url: meta.site_url || urlOrigin(feedUrl),
        source_type: body.source_type || 'news',
        market_relevance: body.market_relevance || 'global',
        priority_weight: Number(body.priority_weight || 50),
        trust_score: Number(body.trust_score || 70),
        is_active: body.is_active ?? true,
        created_at: nowIso(),
        updated_at: nowIso()
      };

      const { data: inserted, error: insertError } = await supabase.from('sources').insert(payload).select().single();
      if (insertError) {
        failed.push({ rss_url: feedUrl, error: insertError.message });
        continue;
      }
      added.push(inserted);
      existingKeys.add(feedKey);
      if (siteKey) existingKeys.add(siteKey);
    }

    return json(res, 200, { ok: true, added, skipped, failed, counts: { added: added.length, skipped: skipped.length, failed: failed.length, total: inputUrls.length } });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
