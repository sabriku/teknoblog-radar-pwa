import { getSupabaseAdmin, json, parseFeedItems, hashValue, chooseFeedUrl, safeText, nowIso } from './_lib.js';

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

function getCutoff(period = '') {
  const now = Date.now();
  if (period === '1d') return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (period === '1w') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (period === '1m') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeUrl(value = '') {
  try {
    const url = new URL(String(value).trim());
    url.hash = '';
    url.pathname = (url.pathname || '/').replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return String(value || '').trim().replace(/\/+$/, '').toLowerCase();
  }
}

function originFromUrl(value = '') {
  try { return new URL(String(value).trim()).origin; } catch { return ''; }
}

function firstMatch(pattern, text = '') {
  const match = String(text || '').match(pattern);
  return match ? String(match[1] || '').trim() : '';
}

function decodeFeedText(value = '') {
  return safeText(String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '));
}

function parseFeedMeta(xml = '', feedUrl = '') {
  const block = /<feed[\s>]/i.test(xml)
    ? (firstMatch(/<feed\b[\s\S]*?<\/feed>/i, xml) || xml)
    : (firstMatch(/<channel\b[\s\S]*?<\/channel>/i, xml) || xml);
  const title = decodeFeedText(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, block));
  const rssLink = decodeFeedText(firstMatch(/<link>([\s\S]*?)<\/link>/i, block));
  const atomAlt = firstMatch(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?/i, block);
  const atomAny = firstMatch(/<link[^>]*href=["']([^"']+)["'][^>]*\/?/i, block);
  const siteUrl = rssLink || atomAlt || atomAny || originFromUrl(feedUrl);
  const description = decodeFeedText(firstMatch(/<description[^>]*>([\s\S]*?)<\/description>/i, block) || firstMatch(/<subtitle[^>]*>([\s\S]*?)<\/subtitle>/i, block));
  return {
    name: title || originFromUrl(feedUrl).replace(/^https?:\/\//, '').replace(/^www\./, '') || feedUrl,
    site_url: siteUrl || originFromUrl(feedUrl),
    description
  };
}

function inferSourceSettings(meta = {}, feedUrl = '') {
  const name = String(meta.name || '').toLowerCase();
  const site = String(meta.site_url || feedUrl || '').toLowerCase();
  const text = `${name} ${site}`;
  let source_type = 'news';
  let market_relevance = 'global';
  let priority_weight = 50;
  let trust_score = 70;

  if (/apple|google|openai|microsoft|meta|samsung|nvidia|qualcomm|sony|huawei|xiaomi/.test(text)) {
    source_type = 'official';
    priority_weight = 86;
    trust_score = 95;
  } else if (/verge|engadget|techcrunch|ars technica|wired|9to5|macrumors|android police|android authority|sammobile|gsmarena|notebookcheck|the decoder|venturebeat|bleepingcomputer|windows central|tom's hardware|tomshardware/.test(text)) {
    source_type = 'news';
    priority_weight = 82;
    trust_score = 86;
  } else if (/videocardz|wccftech/.test(text)) {
    source_type = 'news';
    priority_weight = 76;
    trust_score = 68;
  } else if (/donanim|donanım|shiftdelete|webrazzi|webtekno|log\.com\.tr|chip\.com\.tr|teknoblog/.test(text)) {
    source_type = 'competitor';
    market_relevance = 'local';
    priority_weight = 68;
    trust_score = 74;
  }

  if (/deal|deals|coupon|discount|fırsat|indirim|kampanya/.test(text)) {
    source_type = 'deals';
    priority_weight = Math.max(priority_weight, 70);
  }

  return { source_type, market_relevance, priority_weight, trust_score };
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
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(feedUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
        'accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    const xml = await response.text();
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    if (!/<rss[\s>]|<feed[\s>]|<channel[\s>]/i.test(xml)) return { ok: false, error: 'RSS/Atom bulunamadı' };
    return { ok: true, ...parseFeedMeta(xml, feedUrl) };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, error: 'Zaman aşımı' };
    return { ok: false, error: error?.message || String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function bulkAddSources(supabase, body = {}) {
  const inputUrls = extractInputUrls(body);
  if (inputUrls.length === 0) return { ok: false, error: 'En az bir RSS URL gerekli.' };

  const { data: existingSources, error: listError } = await supabase.from('sources').select('*').limit(5000);
  if (listError) return { ok: false, error: listError.message };

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

    const siteKey = normalizeUrl(meta.site_url || originFromUrl(feedUrl));
    if (siteKey && existingKeys.has(siteKey)) {
      skipped.push({ rss_url: feedUrl, site_url: meta.site_url, reason: 'Aynı site kaynak listesinde zaten var' });
      continue;
    }

    const inferred = inferSourceSettings(meta, feedUrl);
    const payload = {
      name: meta.name || originFromUrl(feedUrl) || feedUrl,
      feed_url: feedUrl,
      rss_url: feedUrl,
      site_url: meta.site_url || originFromUrl(feedUrl),
      source_type: inferred.source_type,
      market_relevance: inferred.market_relevance,
      priority_weight: inferred.priority_weight,
      trust_score: inferred.trust_score,
      is_active: true,
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

  return { ok: true, added, skipped, failed, counts: { added: added.length, skipped: skipped.length, failed: failed.length, total: inputUrls.length } };
}

function scoreTitle(title = '', publishedAt = null) {
  const t = String(title).toLowerCase();
  let traffic = 38;
  let conversion = 24;
  let discover = 34;
  let social = 26;
  let editorial = 36;
  let contentType = 'analysis';

  const strongBrands = ['apple', 'iphone', 'ipad', 'mac', 'samsung', 'galaxy', 'google', 'android', 'microsoft', 'windows', 'openai', 'chatgpt', 'meta', 'intel', 'qualcomm', 'xiaomi', 'huawei', 'oneplus', 'sony', 'nvidia', 'amd', 'tesla', 'gemini'];
  const dealWords = ['discount', 'deal', 'sale', 'coupon', 'price', 'indirim', 'fiyat', 'kampanya', 'sepette', 'prime'];
  const launchWords = ['launch', 'announced', 'introduces', 'unveils', 'reveals', 'tanıttı', 'duyurdu', 'çıktı'];
  const updateWords = ['update', 'rollout', 'beta', 'one ui', 'ios', 'android 16', 'windows 11', 'patch', 'security'];
  const aiWords = ['ai', 'yapay zeka', 'chatgpt', 'gemini', 'copilot', 'claude', 'openai'];
  const urgencyWords = ['today', 'now', 'bugün', 'şimdi', 'son dakika', 'breaking'];

  if (strongBrands.some((w) => t.includes(w))) { traffic += 14; discover += 12; editorial += 10; }
  if (dealWords.some((w) => t.includes(w))) { conversion += 30; traffic += 14; discover += 6; contentType = 'deal'; }
  if (launchWords.some((w) => t.includes(w))) { traffic += 16; social += 16; discover += 12; editorial += 6; contentType = 'launch'; }
  if (updateWords.some((w) => t.includes(w))) { traffic += 12; discover += 12; social += 10; editorial += 6; contentType = 'update'; }
  if (aiWords.some((w) => t.includes(w))) { discover += 12; social += 10; traffic += 8; editorial += 6; }
  if (urgencyWords.some((w) => t.includes(w))) { discover += 8; traffic += 8; social += 6; }

  if (publishedAt) {
    const publishedMs = new Date(publishedAt).getTime();
    if (Number.isFinite(publishedMs)) {
      const ageHours = (Date.now() - publishedMs) / 3600000;
      if (ageHours <= 12) { traffic += 10; discover += 12; social += 8; }
      else if (ageHours <= 24) { traffic += 8; discover += 8; social += 6; }
      else if (ageHours <= 72) { traffic += 4; discover += 4; }
      else if (ageHours > 720) { traffic -= 18; discover -= 18; social -= 10; }
    }
  }

  traffic = clamp(traffic);
  conversion = clamp(conversion);
  discover = clamp(discover);
  social = clamp(social);
  editorial = clamp(editorial);

  const total = clamp(traffic * 0.28 + conversion * 0.18 + discover * 0.24 + social * 0.10 + editorial * 0.20);
  return { traffic_score: traffic, conversion_score: conversion, discover_score: discover, social_score: social, editorial_score: editorial, total_score: total, content_type_hint: contentType };
}

async function upsertTopicCandidate(supabase, source, row) {
  const scores = scoreTitle(row.title || '', row.published_at || row.created_at || null);
  const title = row.title || '';
  const url = row.url || row.canonical_url || '';
  const payload = {
    raw_feed_item_id: row.id,
    source_id: source.id || null,
    source_name: source.name || '',
    title,
    summary: row.summary || '',
    url,
    image_url: row.image_url || null,
    candidate_hash: hashValue(`${title}|${url}`),
    content_type_hint: scores.content_type_hint,
    total_score: scores.total_score,
    traffic_score: scores.traffic_score,
    conversion_score: scores.conversion_score,
    discover_score: scores.discover_score,
    social_score: scores.social_score,
    editorial_score: scores.editorial_score,
    status: 'active',
    published_at: row.published_at || null,
    updated_at: nowIso()
  };

  const { data: existing, error: existingError } = await supabase.from('topic_candidates').select('id').eq('raw_feed_item_id', row.id).limit(1);
  if (existingError) return false;
  if (existing && existing.length > 0) {
    const { error: updateError } = await supabase.from('topic_candidates').update(payload).eq('raw_feed_item_id', row.id);
    return !updateError;
  }
  const { error: insertError } = await supabase.from('topic_candidates').insert({ ...payload, created_at: nowIso() });
  return !insertError;
}

async function fetchSingleSource(supabase, source, itemLimit = 15) {
  const feedUrl = chooseFeedUrl(source);
  if (!feedUrl) return { ok: false, error: 'No feed URL' };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(feedUrl, { headers: { 'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0', 'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const xml = await response.text();
    const items = parseFeedItems(xml).slice(0, itemLimit);
    let ingested = 0; let updated = 0; let scored = 0;
    for (const item of items) {
      const title = safeText(item.title); const url = safeText(item.url || item.link); const summary = safeText(item.summary || item.description); const published_at = safeText(item.published_at || '') || null; const image_url = safeText(item.image_url || item.image || '') || null; const content_hash = hashValue(`${title}|${url}`); const url_hash = hashValue(url);
      if (!title || !url) continue;
      const { data: existing, error: existingError } = await supabase.from('raw_feed_items').select('id,image_url,summary,published_at,title,url,canonical_url,created_at').eq('content_hash', content_hash).limit(1);
      if (existingError) continue;
      const current = existing && existing.length > 0 ? existing[0] : null;
      if (current) {
        const patch = {};
        if (image_url && !current.image_url) patch.image_url = image_url;
        if (summary && (!current.summary || current.summary.length < summary.length)) patch.summary = summary;
        if (published_at && !current.published_at) patch.published_at = published_at;
        if (Object.keys(patch).length > 0) { const { error: updateError } = await supabase.from('raw_feed_items').update(patch).eq('id', current.id); if (!updateError) updated += 1; }
        const scoredOk = await upsertTopicCandidate(supabase, source, { ...current, ...patch, summary: patch.summary || current.summary || summary, image_url: patch.image_url || current.image_url || image_url, published_at: patch.published_at || current.published_at || published_at });
        if (scoredOk) scored += 1;
        continue;
      }
      const payload = { source_id: source.id, source_name: source.name || '', source_url: source.site_url || source.rss_url || source.feed_url || url, title, url, canonical_url: url, summary, image_url, published_at, content_hash, url_hash, created_at: nowIso() };
      const { data: insertedRow, error: insertError } = await supabase.from('raw_feed_items').insert(payload).select('*').single();
      if (!insertError && insertedRow) { ingested += 1; const scoredOk = await upsertTopicCandidate(supabase, source, insertedRow); if (scoredOk) scored += 1; }
    }
    return { ok: true, ingested, updated, scored, fetched: items.length };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();

    if (req.method === 'GET') {
      const id = String(req.query?.id || '').trim();
      let query = supabase.from('sources').select('*').order('priority_weight', { ascending: false });
      if (id) query = query.eq('id', id).limit(1);
      const { data, error } = await query;
      if (error) return json(res, 500, { error: error.message });
      if (id) return json(res, 200, { item: Array.isArray(data) ? (data[0] || null) : null });
      return json(res, 200, { items: sortSourcesWithBoost(data || []) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

      if (body.action === 'bulk_add') {
        const result = await bulkAddSources(supabase, body);
        if (!result.ok) return json(res, 400, { error: result.error || 'Toplu ekleme başarısız' });
        return json(res, 200, result);
      }

      if (body.action === 'fetch_source') {
        const sourceId = String(body.source_id || '').trim();
        if (!sourceId) return json(res, 400, { error: 'source_id gerekli' });
        const { data: source, error: sourceError } = await supabase.from('sources').select('*').eq('id', sourceId).limit(1).single();
        if (sourceError || !source) return json(res, 404, { error: 'Kaynak bulunamadı' });
        const result = await fetchSingleSource(supabase, source, 15);
        if (!result.ok) return json(res, 500, { error: result.error || 'Kaynak çekilemedi' });
        return json(res, 200, { ok: true, source_id: sourceId, ...result });
      }

      const feed = body.rss_url || body.feed_url || '';
      const inferred = inferSourceSettings({ name: body.name || '', site_url: body.site_url || feed }, feed);
      const payload = { name: body.name || '', feed_url: feed, rss_url: feed, site_url: body.site_url || '', source_type: body.source_type || inferred.source_type, market_relevance: body.market_relevance || inferred.market_relevance, priority_weight: Number(body.priority_weight || inferred.priority_weight), trust_score: Number(body.trust_score || inferred.trust_score), is_active: body.is_active ?? true };
      const { data, error } = await supabase.from('sources').insert(payload).select().single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { item: data });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const sourceId = String(body.id || body.source_id || '').trim();
      if (!sourceId) return json(res, 400, { error: 'id gerekli' });
      const feed = body.rss_url || body.feed_url || '';
      const inferred = inferSourceSettings({ name: body.name || '', site_url: body.site_url || feed }, feed);
      const payload = { name: body.name || '', feed_url: feed, rss_url: feed, site_url: body.site_url || '', source_type: body.source_type || inferred.source_type, market_relevance: body.market_relevance || inferred.market_relevance, priority_weight: Number(body.priority_weight || inferred.priority_weight), trust_score: Number(body.trust_score || inferred.trust_score), is_active: body.is_active ?? true };
      const { data, error } = await supabase.from('sources').update(payload).eq('id', sourceId).select().single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { item: data });
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const sourceId = String(body.source_id || '').trim();
      if (sourceId) {
        const { data: rawItems, error: rawError } = await supabase.from('raw_feed_items').select('id').eq('source_id', sourceId).limit(5000);
        if (rawError) return json(res, 500, { error: rawError.message });
        const rawIds = (rawItems || []).map((item) => item.id).filter(Boolean);
        if (rawIds.length > 0) {
          const { error: topicDeleteError } = await supabase.from('topic_candidates').delete().in('raw_feed_item_id', rawIds);
          if (topicDeleteError) return json(res, 500, { error: topicDeleteError.message });
          const { error: rawDeleteError } = await supabase.from('raw_feed_items').delete().in('id', rawIds);
          if (rawDeleteError) return json(res, 500, { error: rawDeleteError.message });
        }
        const { error: sourceDeleteError } = await supabase.from('sources').delete().eq('id', sourceId);
        if (sourceDeleteError) return json(res, 500, { error: sourceDeleteError.message });
        return json(res, 200, { ok: true, source_id: sourceId, deleted_raw_feed_items: rawIds.length });
      }

      const token = req.query?.token || req.headers['x-cron-token'] || '';
      const expected = process.env.CRON_TOKEN || '';
      if (!expected || token !== expected) return json(res, 401, { error: 'Yetkisiz istek' });
      const period = body.period || 'all';
      const cutoff = getCutoff(period);
      let rawItems = [];
      let rawError = null;
      if (cutoff) {
        const result = await supabase.from('raw_feed_items').select('id').or(`published_at.gte.${cutoff},created_at.gte.${cutoff}`).limit(5000);
        rawItems = result.data || [];
        rawError = result.error || null;
      } else {
        const result = await supabase.from('raw_feed_items').select('id').limit(5000);
        rawItems = result.data || [];
        rawError = result.error || null;
      }
      if (rawError) return json(res, 500, { error: rawError.message });
      const rawIds = rawItems.map((item) => item.id).filter(Boolean);
      if (rawIds.length === 0) return json(res, 200, { ok: true, period, deleted_topic_candidates: 0, deleted_raw_feed_items: 0 });
      const { data: topicRows, error: topicSelectError } = await supabase.from('topic_candidates').select('id').in('raw_feed_item_id', rawIds).limit(5000);
      if (topicSelectError) return json(res, 500, { error: topicSelectError.message });
      const deletedTopicCandidates = (topicRows || []).length;
      const { error: topicDeleteError } = await supabase.from('topic_candidates').delete().in('raw_feed_item_id', rawIds);
      if (topicDeleteError) return json(res, 500, { error: topicDeleteError.message });
      const { error: rawDeleteError } = await supabase.from('raw_feed_items').delete().in('id', rawIds);
      if (rawDeleteError) return json(res, 500, { error: rawDeleteError.message });
      return json(res, 200, { ok: true, period, deleted_topic_candidates: deletedTopicCandidates, deleted_raw_feed_items: rawIds.length });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
