import { json, getSupabaseAdmin, parseFeedItems, hashValue, chooseFeedUrl, safeText, nowIso, queryLocal } from '../_lib.js';

const PRIORITY_BOOSTS = {
  'engadget': 35,
  'digital trends': 35,
  'log.com.tr': 35,
  'log': 20
};

function boostedPriority(source = {}) {
  const name = String(source?.name || '').toLowerCase().trim();
  const base = Number(source?.priority_weight || 0);
  for (const [key, boost] of Object.entries(PRIORITY_BOOSTS)) {
    if (name === key || name.includes(key)) return base + boost;
  }
  return base;
}

function sortSourcesWithBoost(items = []) {
  return [...items].sort((a, b) => {
    const diff = boostedPriority(b) - boostedPriority(a);
    if (diff !== 0) return diff;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'tr');
  });
}

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function firstMatch(pattern, text) {
  const match = String(text || '').match(pattern);
  return match ? (match[1] || '').trim() : '';
}

function normalizeImageUrl(url = '', baseUrl = '') {
  const clean = String(url || '').trim();
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^\/\//.test(clean)) return `https:${clean}`;
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return clean;
  }
}

async function recordSourceHealth(source, { ok, error = '', fetched = 0, images = 0, latency = 0 }) {
  const quality = clampHealth((ok ? 45 : 10) + Math.min(25, fetched * 2) + Math.min(15, images * 3) + (latency < 3000 ? 10 : latency < 6000 ? 5 : 0));
  await queryLocal(`INSERT INTO source_health(source_id,last_attempt_at,last_success_at,last_error,consecutive_failures,fetched_count,image_count,avg_latency_ms,quality_score,updated_at)
    VALUES($1,NOW(),CASE WHEN $2 THEN NOW() ELSE NULL END,$3,CASE WHEN $2 THEN 0 ELSE 1 END,$4,$5,$6,$7,NOW())
    ON CONFLICT(source_id) DO UPDATE SET last_attempt_at=NOW(),last_success_at=CASE WHEN $2 THEN NOW() ELSE source_health.last_success_at END,
    last_error=$3,consecutive_failures=CASE WHEN $2 THEN 0 ELSE source_health.consecutive_failures+1 END,
    fetched_count=$4,image_count=$5,avg_latency_ms=CASE WHEN source_health.avg_latency_ms=0 THEN $6 ELSE ROUND((source_health.avg_latency_ms+$6)/2.0)::int END,
    quality_score=$7,updated_at=NOW()`, [source.id, ok, error, fetched, images, latency, quality]);
}

function clampHealth(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }

async function fetchOgImage(url = '') {
  if (!url) return '';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

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
    const og = firstMatch(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i, html);
    const tw = firstMatch(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i, html);
    return normalizeImageUrl(og || tw, url);
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

    const sourceLimit = Math.min(toPositiveInt(req.query?.source_limit, 4), 8);
    const sourceOffset = toPositiveInt(req.query?.source_offset, 0);
    const itemLimit = Math.min(toPositiveInt(req.query?.item_limit, 10), 20);
    const startedAt = Date.now();
    const hardStopMs = 25000;

    const supabase = getSupabaseAdmin();

    const { data: allSources, error: sourcesError } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .order('priority_weight', { ascending: false })
      .limit(200);

    if (sourcesError) return json(res, 500, { error: sourcesError.message });

    const sortedSources = sortSourcesWithBoost(allSources || []);
    const sources = sortedSources.slice(sourceOffset, sourceOffset + sourceLimit);

    let ingested = 0;
    let updated = 0;
    const debug = [];
    let processed_sources = 0;

    for (const source of sources || []) {
      const sourceStartedAt = Date.now();
      if (Date.now() - startedAt > hardStopMs) {
        debug.push({ source: source.name, status: 'stopped', reason: 'Time budget reached' });
        break;
      }

      const feedUrl = chooseFeedUrl(source);

      if (!feedUrl) {
        debug.push({ source: source.name, status: 'skipped', reason: 'No feed URL' });
        await recordSourceHealth(source, { ok: false, error: 'No feed URL', latency: Date.now() - sourceStartedAt });
        continue;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(feedUrl, {
          headers: {
            'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
            'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
          },
          cache: 'no-store',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          debug.push({ source: source.name, status: 'http_error', feedUrl, code: response.status });
          await recordSourceHealth(source, { ok: false, error: `HTTP ${response.status}`, latency: Date.now() - sourceStartedAt });
          continue;
        }

        const xml = await response.text();
        const items = parseFeedItems(xml).slice(0, itemLimit);
        processed_sources += 1;
        let ogLookups = 0;
        let insertErrors = 0;
        let updateErrors = 0;
        let selectErrors = 0;
        let insertedForSource = 0;
        let updatedForSource = 0;
        let sampleError = '';

        debug.push({ source: source.name, status: 'fetched', feedUrl, count: items.length });
        const imageCount = items.filter((item) => item.image_url || item.image).length;

        for (const item of items) {
          const title = safeText(item.title);
          const url = safeText(item.url || item.link);
          const summary = safeText(item.summary || item.description);
          const published_at = safeText(item.published_at || '') || null;
          let image_url = safeText(item.image_url || item.image || '');
          const content_hash = hashValue(`${title}|${url}`);
          const url_hash = hashValue(url);

          if (!title || !url) continue;

          const { data: existing, error: existingError } = await supabase
            .from('raw_feed_items')
            .select('id,image_url,summary,published_at')
            .eq('content_hash', content_hash)
            .limit(1);

          if (existingError) {
            selectErrors += 1;
            if (!sampleError) sampleError = existingError.message || 'select failed';
            continue;
          }

          const current = existing && existing.length > 0 ? existing[0] : null;

          if (!image_url && !(current && current.image_url) && ogLookups < 1 && Date.now() - startedAt < hardStopMs - 3000) {
            ogLookups += 1;
            image_url = safeText(await fetchOgImage(url));
          }

          if (current) {
            const patch = {};
            if (image_url && !current.image_url) patch.image_url = image_url;
            if (summary && (!current.summary || current.summary.length < summary.length)) patch.summary = summary;
            if (published_at && !current.published_at) patch.published_at = published_at;

            if (Object.keys(patch).length > 0) {
              const { error: updateError } = await supabase
                .from('raw_feed_items')
                .update(patch)
                .eq('id', current.id);
              if (!updateError) {
                updated += 1;
                updatedForSource += 1;
              } else {
                updateErrors += 1;
                if (!sampleError) sampleError = updateError.message || 'update failed';
              }
            }
            continue;
          }

          const payload = {
            source_id: source.id,
            source_name: source.name || '',
            source_url: source.site_url || source.rss_url || source.feed_url || url,
            title,
            url,
            canonical_url: url,
            summary,
            image_url: image_url || null,
            published_at,
            content_hash,
            url_hash,
            created_at: nowIso()
          };

          const { error: insertError } = await supabase
            .from('raw_feed_items')
            .insert(payload);

          if (!insertError) {
            ingested += 1;
            insertedForSource += 1;
          } else {
            insertErrors += 1;
            if (!sampleError) sampleError = insertError.message || 'insert failed';
          }
        }

        debug.push({
          source: source.name,
          status: 'db_result',
          inserted: insertedForSource,
          updated: updatedForSource,
          insertErrors,
          updateErrors,
          selectErrors,
          error: sampleError || ''
        });
        await recordSourceHealth(source, { ok: true, fetched: items.length, images: imageCount, latency: Date.now() - sourceStartedAt });
      } catch (error) {
        debug.push({
          source: source.name,
          status: 'exception',
          feedUrl,
          error: error?.message || String(error)
        });
        await recordSourceHealth(source, { ok: false, error: error?.message || String(error), latency: Date.now() - sourceStartedAt });
      }
    }

    return json(res, 200, {
      ok: true,
      ingested,
      updated,
      processed_sources,
      source_limit: sourceLimit,
      source_offset: sourceOffset,
      has_more: sortedSources.length > sourceOffset + sourceLimit,
      item_limit: itemLimit,
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
