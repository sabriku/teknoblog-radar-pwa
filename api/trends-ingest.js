import { getSupabaseAdmin, json, parseFeedItems, safeText, hashValue } from './_lib.js';

function normalizeTopic(title = '') {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
    .replace(/\b(the|and|for|with|from|that|this|will|have|has|about|daha|için|ile|bir|ve|son|new|yeni|güncelleme|update|launch|announced|duyurdu|tanıttı)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ')
    .slice(0, 120);
}

function getTrendFeeds() {
  const raw = process.env.TREND_FEED_URLS || '[]';
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toSignalScore(item = {}, feed = {}) {
  const title = safeText(item.title || '');
  const text = `${title} ${safeText(item.summary || '')}`.toLowerCase();
  let score = Number(feed.base_score || 40);
  if (/fiyat|price|kampanya|deal|indirim|discount/.test(text)) score += 10;
  if (/beta|update|güncelleme|rollout|ios|android|one ui/.test(text)) score += 8;
  if (/leak|rumor|sızıntı|report|iddia/.test(text)) score += 6;
  if (/gemini|chatgpt|openai|android|iphone|samsung|google|xiaomi|huawei/.test(text)) score += 6;
  if (Number(item.traffic_score || 0) > 0) score += Math.min(12, Math.round(Number(item.traffic_score || 0) / 10));
  return Math.max(0, Math.min(100, score));
}

function textFrom(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return [
      value.title,
      value.name,
      value.query,
      value.keyword,
      value.formattedTraffic,
      value.traffic,
      value.snippet,
      value.description
    ].map(textFrom).filter(Boolean).join(' ');
  }
  return '';
}

function numberFromTraffic(value) {
  const text = textFrom(value).toLowerCase();
  if (!text) return 0;
  const match = text.match(/([\d.,]+)\s*([kmmb]|bin|milyon)?/i);
  if (!match) return 0;
  const base = Number(match[1].replace(/,/g, '.')) || 0;
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'k' || unit === 'bin') return Math.round(base * 1000);
  if (unit === 'm' || unit === 'milyon') return Math.round(base * 1000000);
  if (unit === 'b') return Math.round(base * 1000000000);
  return Math.round(base);
}

function normalizeJsonTrendItem(item = {}, feed = {}) {
  const title = safeText(
    item.title || item.query || item.keyword || item.name || item.entityName || item.topic || item.searchTerm || ''
  );
  const published = item.published_at || item.pubDate || item.date || item.created_at || item.timestamp || new Date().toISOString();
  const articles = Array.isArray(item.articles) ? item.articles : [];
  const firstArticle = articles[0] || item.article || item.news || {};
  const url = safeText(
    item.url || item.link || item.exploreLink || item.articleUrl || firstArticle.url || firstArticle.link || ''
  );
  const imageUrl = safeText(item.image_url || item.imageUrl || firstArticle.image || firstArticle.imageUrl || '');
  const trafficScore = numberFromTraffic(item.formattedTraffic || item.traffic || item.searchVolume || item.volume || '');
  const summary = safeText(
    item.summary || item.snippet || item.description || firstArticle.title || firstArticle.snippet || item.related || ''
  );

  return {
    title,
    url,
    summary,
    image_url: imageUrl,
    published_at: published,
    traffic_score: trafficScore,
    raw_json: item,
    feed_hint: feed.name || ''
  };
}

function flattenJsonTrendItems(data, feed = {}) {
  const buckets = [];
  if (Array.isArray(data)) buckets.push(...data);
  if (data && typeof data === 'object') {
    const candidates = [
      data.items,
      data.stories,
      data.trendingSearches,
      data.default?.trendingSearchesDays,
      data.default?.trendingSearches,
      data.data,
      data.results,
      data.searches,
      data.topics
    ].filter(Boolean);
    for (const entry of candidates) {
      if (Array.isArray(entry)) buckets.push(...entry);
    }
  }

  const expanded = [];
  for (const entry of buckets) {
    if (!entry) continue;
    if (Array.isArray(entry.trendingSearches)) {
      expanded.push(...entry.trendingSearches);
      continue;
    }
    if (Array.isArray(entry.stories)) {
      expanded.push(...entry.stories);
      continue;
    }
    expanded.push(entry);
  }

  return expanded
    .map((item) => normalizeJsonTrendItem(item, feed))
    .filter((item) => item.title);
}

function detectJsonPayload(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith(")]}'"))) return null;
  const normalized = trimmed.startsWith(")]}'") ? trimmed.slice(4) : trimmed;
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function maybeJsonString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractBatchexecutePayloads(bodyText = '') {
  const lines = String(bodyText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const payloads = [];
  for (const line of lines) {
    const parsed = maybeJsonString(line);
    if (!parsed) continue;

    const walk = (node) => {
      if (node == null) return;
      if (typeof node === 'string') {
        const nested = maybeJsonString(node);
        if (nested) {
          payloads.push(nested);
          walk(nested);
        }
        return;
      }
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node === 'object') {
        payloads.push(node);
        for (const value of Object.values(node)) walk(value);
      }
    };

    walk(parsed);
  }

  return payloads;
}

function flattenBatchexecuteItems(bodyText = '', feed = {}) {
  const payloads = extractBatchexecutePayloads(bodyText);
  const normalized = [];

  const pushTopic = (value) => {
    const title = safeText(value);
    if (!title || title.length < 2) return;
    normalized.push(normalizeJsonTrendItem({ title }, feed));
  };

  const walk = (node) => {
    if (node == null) return;
    if (typeof node === 'string') {
      const trimmed = node.trim();
      if (!trimmed) return;
      const nested = maybeJsonString(trimmed);
      if (nested) {
        walk(nested);
        return;
      }
      if (/^[A-Z]{2}$/.test(trimmed)) return;
      if (/^(boq_|mpe|APse|null|true|false)$/i.test(trimmed)) return;
      if (/^https?:\/\//i.test(trimmed)) return;
      if (trimmed.length <= 120 && /[a-zçğıöşü]/i.test(trimmed)) pushTopic(trimmed);
      return;
    }
    if (Array.isArray(node)) {
      if (node.length >= 2 && typeof node[1] === 'string' && node[1].trim().length <= 120) {
        pushTopic(node[1]);
      }
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === 'object') {
      for (const key of ['title', 'query', 'keyword', 'name', 'topic', 'searchTerm']) {
        if (node[key]) pushTopic(node[key]);
      }
      for (const value of Object.values(node)) walk(value);
    }
  };

  payloads.forEach((payload) => walk(payload));

  const seen = new Set();
  return normalized.filter((item) => {
    const key = normalizeTopic(item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseTrendItems(bodyText = '', contentType = '', feed = {}) {
  const hintedJson = /json/i.test(contentType) || /google_trends/i.test(String(feed.source_type || ''));
  if (hintedJson) {
    const jsonPayload = detectJsonPayload(bodyText);
    if (jsonPayload) return flattenJsonTrendItems(jsonPayload, feed);
  }

  if (/batchexecute/i.test(String(feed.source_type || '')) || /wrb\.fr|\[\[\[/.test(bodyText)) {
    const batchItems = flattenBatchexecuteItems(bodyText, feed);
    if (batchItems.length) return batchItems;
  }

  if (/xml|rss|atom/i.test(contentType) || bodyText.trim().startsWith('<')) {
    return parseFeedItems(bodyText).slice(0, Number(feed.limit || 25));
  }

  const jsonPayload = detectJsonPayload(bodyText);
  if (jsonPayload) return flattenJsonTrendItems(jsonPayload, feed);
  return [];
}

function buildRequestInit(feed = {}) {
  const method = String(feed.method || 'GET').toUpperCase();
  const headers = {
    'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
    'accept': 'application/json, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    ...(feed.headers && typeof feed.headers === 'object' ? feed.headers : {})
  };

  const init = { method, headers, cache: 'no-store' };
  if (method !== 'GET' && method !== 'HEAD' && typeof feed.body === 'string') {
    init.body = feed.body;
  }
  return init;
}

export default async function handler(req, res) {
  try {
    const token = req.query?.token || '';
    const expected = process.env.CRON_TOKEN || '';
    if (!expected || token !== expected) {
      return json(res, 401, { error: 'Yetkisiz istek' });
    }

    const feeds = getTrendFeeds();
    if (!feeds.length) {
      return json(res, 200, {
        inserted: 0,
        feeds: 0,
        message: 'TREND_FEED_URLS tanımlı değil. Google Trends veya benzeri feed URL listesi environment değişkeni olarak girilmeli.'
      });
    }

    const supabase = getSupabaseAdmin();
    let inserted = 0;
    const debug = [];

    for (const feed of feeds) {
      const url = String(feed?.url || '').trim();
      if (!url) continue;

      try {
        const response = await fetch(url, buildRequestInit(feed));

        if (!response.ok) {
          debug.push({ feed: feed.name || url, status: 'http_error', code: response.status });
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        const bodyText = await response.text();
        const items = parseTrendItems(bodyText, contentType, feed).slice(0, Number(feed.limit || 25));
        debug.push({ feed: feed.name || url, status: 'fetched', count: items.length, source_type: feed.source_type || 'trend_feed', method: feed.method || 'GET' });

        for (const item of items) {
          const topicText = safeText(item.title || '');
          const normalizedTopic = normalizeTopic(topicText);
          if (!topicText || !normalizedTopic) continue;

          const detectedAt = item.published_at || new Date().toISOString();
          const signalHash = hashValue(`${feed.name || url}|${normalizedTopic}|${detectedAt}`);

          const payload = {
            title: topicText,
            url: safeText(item.url || item.link || ''),
            summary: safeText(item.summary || item.description || ''),
            image_url: safeText(item.image_url || ''),
            raw_feed_name: feed.name || '',
            feed_url: url,
            traffic_score: Number(item.traffic_score || 0),
            raw_json: item.raw_json || null
          };

          const row = {
            signal_hash: signalHash,
            source_type: feed.source_type || 'trend_feed',
            source_name: feed.name || 'Trend Feed',
            market_scope: feed.market_scope || 'global',
            country_code: feed.country_code || null,
            topic_text: topicText,
            normalized_topic: normalizedTopic,
            signal_score: toSignalScore(item, feed),
            time_window: feed.time_window || '24h',
            detected_at: detectedAt,
            signal_payload: payload,
            updated_at: new Date().toISOString()
          };

          const { error } = await supabase
            .from('trend_signals')
            .upsert(row, { onConflict: 'signal_hash' });

          if (!error) inserted += 1;
        }
      } catch (error) {
        debug.push({ feed: feed.name || url, status: 'error', error: error.message || String(error), source_type: feed.source_type || 'trend_feed' });
      }
    }

    return json(res, 200, { inserted, feeds: feeds.length, debug });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
