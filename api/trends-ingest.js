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
  return Math.max(0, Math.min(100, score));
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
        const response = await fetch(url, {
          headers: {
            'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
            'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
          },
          cache: 'no-store'
        });

        if (!response.ok) {
          debug.push({ feed: feed.name || url, status: 'http_error', code: response.status });
          continue;
        }

        const xml = await response.text();
        const items = parseFeedItems(xml).slice(0, Number(feed.limit || 25));
        debug.push({ feed: feed.name || url, status: 'fetched', count: items.length });

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
            feed_url: url
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
        debug.push({ feed: feed.name || url, status: 'error', error: error.message || String(error) });
      }
    }

    return json(res, 200, { inserted, feeds: feeds.length, debug });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
