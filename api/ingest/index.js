import { json, getSupabaseAdmin, parseFeedItems, hashValue, chooseFeedUrl, safeText, nowIso } from '../_lib.js';

function firstMatch(pattern, text) {
  const match = String(text || '').match(pattern);
  return match ? (match[1] || '').trim() : '';
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function normalizeImageUrl(url = '', baseUrl = '') {
  const clean = decodeHtml(url).trim();
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^\/\//.test(clean)) return `https:${clean}`;
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return clean;
  }
}

function firstSrcFromSrcset(value = '') {
  const first = String(value).split(',')[0] || '';
  return (first.trim().split(/\s+/)[0] || '').trim();
}

function extractImageFromHtml(html = '', pageUrl = '') {
  const candidates = [
    firstMatch(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i, html),
    firstMatch(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i, html),
    firstMatch(/<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i, html),
    firstMatch(/<img[^>]*data-lazy-src=["']([^"']+)["']/i, html),
    firstMatch(/<img[^>]*data-src=["']([^"']+)["']/i, html),
    firstSrcFromSrcset(firstMatch(/<img[^>]*srcset=["']([^"']+)["']/i, html)),
    firstMatch(/<img[^>]*src=["']([^"']+)["']/i, html)
  ];

  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate, pageUrl);
    if (normalized) return normalized;
  }

  return '';
}

async function fetchArticleImage(url = '') {
  if (!url) return '';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) return '';
    const html = await response.text();
    return extractImageFromHtml(html, url);
  } catch {
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  try {
    const token = req.query?.token || '';
    const expected = process.env.CRON_TOKEN || '';

    if (!expected || token !== expected) {
      return json(res, 401, { error: 'Yetkisiz istek' });
    }

    const supabase = getSupabaseAdmin();

    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .order('priority_weight', { ascending: false });

    if (sourcesError) return json(res, 500, { error: sourcesError.message });

    let ingested = 0;
    let updated = 0;
    const debug = [];

    for (const source of sources || []) {
      const feedUrl = chooseFeedUrl(source);

      if (!feedUrl) {
        debug.push({ source: source.name, status: 'skipped', reason: 'No feed URL' });
        continue;
      }

      try {
        const response = await fetch(feedUrl, {
          headers: {
            'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
            'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
          },
          cache: 'no-store'
        });

        if (!response.ok) {
          debug.push({ source: source.name, status: 'http_error', feedUrl, code: response.status });
          continue;
        }

        const xml = await response.text();
        const items = parseFeedItems(xml);
        let articleImageFetches = 0;

        debug.push({ source: source.name, status: 'fetched', feedUrl, count: items.length });

        for (const item of items) {
          const title = safeText(item.title);
          const url = safeText(item.url || item.link);
          const summary = safeText(item.summary || item.description);
          let image_url = safeText(item.image_url || item.image || '');
          const content_hash = hashValue(`${title}|${url}`);

          if (!title || !url) continue;

          if (!image_url && articleImageFetches < 8) {
            image_url = safeText(await fetchArticleImage(url));
            if (image_url) articleImageFetches += 1;
          }

          const { data: existing, error: existingError } = await supabase
            .from('raw_feed_items')
            .select('id,image_url,summary,published_at')
            .eq('content_hash', content_hash)
            .limit(1);

          if (existingError) continue;

          if (existing && existing.length > 0) {
            const current = existing[0];
            const patch = {};
            if (image_url && !current.image_url) patch.image_url = image_url;
            if (summary && (!current.summary || current.summary.length < summary.length)) patch.summary = summary;
            if (item.published_at && !current.published_at) patch.published_at = item.published_at;

            if (Object.keys(patch).length > 0) {
              const { error: updateError } = await supabase
                .from('raw_feed_items')
                .update(patch)
                .eq('id', current.id);
              if (!updateError) updated += 1;
            }
            continue;
          }

          const payload = {
            source_id: source.id,
            title,
            url,
            canonical_url: url,
            summary,
            image_url: image_url || null,
            published_at: item.published_at || null,
            content_hash,
            created_at: nowIso()
          };

          const { error: insertError } = await supabase
            .from('raw_feed_items')
            .insert(payload);

          if (!insertError) ingested += 1;
        }
      } catch (error) {
        debug.push({
          source: source.name,
          status: 'exception',
          feedUrl,
          error: error?.message || String(error)
        });
      }
    }

    return json(res, 200, {
      ok: true,
      ingested,
      updated,
      debug,
      finished_at: nowIso()
    });
  } catch (error) {
    return json(res, 500, {
      error: error?.message || String(error),
      finished_at: nowIso()
    });
  }
}
