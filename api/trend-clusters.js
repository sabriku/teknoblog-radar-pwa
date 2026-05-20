import { getSupabaseAdmin, json, hashValue } from './_lib.js';

const COMPETITOR_SOURCES = [
  'Webrazzi', 'ShiftDelete.Net', 'DonanımHaber', 'Android Authority', 'The Verge',
  '9to5Google', 'MacRumors', 'Windows Central', 'SamMobile', 'GSMArena'
];

const SOURCE_SUFFIXES = [
  'Mashable', 'CNBC', 'blog.google', 'Google Blog', 'Webtekno', 'Tamindir', 'LOG.com.tr',
  'TechRadar', 'TechCrunch', 'Digital Trends', 'Ars Technica', 'Engadget', '9to5Google',
  'Android Authority', 'Windows Central', 'The Verge', 'GSMArena', 'SamMobile', 'MacRumors',
  'DonanımHaber', 'ShiftDelete.Net', 'Webrazzi', 'Tom\'s Hardware'
];

function normalizeTopic(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanupTitle(value = '') {
  let text = String(value || '').trim();
  if (!text) return '';

  text = text
    .replace(/^[\s:;,\-–—|]+|[\s:;,\-–—|]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  for (const suffix of SOURCE_SUFFIXES) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text
      .replace(new RegExp(`\s[-–—|:]\s${escaped}$`, 'i'), '')
      .replace(new RegExp(`\s${escaped}$`, 'i'), '')
      .trim();
  }

  text = text
    .replace(/^Introducing\s+/i, '')
    .replace(/^Everything new in\s+/i, '')
    .replace(/^New\s+/i, '')
    .replace(/^I\/O\s?2026:\s*/i, '')
    .replace(/^Google I\/O\s?2026:\s*/i, '')
    .replace(/^I O\s?2026\s*/i, '')
    .replace(/^Google debuts\s+/i, 'Google ')
    .replace(/^Google announces\s+/i, 'Google ')
    .replace(/^Google says\s+/i, 'Google ')
    .replace(/^Introducing\s+/i, '')
    .replace(/^Everything new in our\s+/i, '')
    .replace(/^Everything new in\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function editorialClusterName(cluster = {}, matchedCandidates = []) {
  const candidateTitles = matchedCandidates
    .map((row) => cleanupTitle(row?.candidate?.title || ''))
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);

  const signalTitles = (cluster.signals || [])
    .map((signal) => cleanupTitle(signal?.topic_text || ''))
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);

  const pick = candidateTitles[0] || signalTitles[0] || cleanupTitle(cluster.clusterName || '') || cluster.normalizedTopic;

  return pick
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function recommendationType(clusterName = '', avgDiscover = 0) {
  const text = String(clusterName || '').toLowerCase();
  if (/(fiyat|indirim|kampanya|price|deal|discount)/.test(text)) return 'satın_alma';
  if (/(compare|karşılaştır|vs)/.test(text)) return 'karşılaştırma';
  if (/(beta|update|güncelle|rollout|ios|android|one ui)/.test(text)) return 'hızlı_haber';
  if (/(leak|rumor|report|sızıntı|iddia)/.test(text)) return 'takip_dosyası';
  return avgDiscover >= 72 ? 'discover_hızlı_haber' : 'detay_haber';
}

function matchScore(clusterTopic = '', candidate = {}) {
  const title = normalizeTopic(candidate.title || '');
  if (!clusterTopic || !title) return 0;
  if (title.includes(clusterTopic)) return 96;
  const clusterWords = clusterTopic.split(' ').filter(Boolean);
  if (!clusterWords.length) return 0;
  const hitCount = clusterWords.filter((word) => title.includes(word)).length;
  return Math.round((hitCount / clusterWords.length) * 100);
}

export default async function handler(req, res) {
  try {
    const token = req.query?.token || '';
    const expected = process.env.CRON_TOKEN || '';
    if (!expected || token !== expected) {
      return json(res, 401, { error: 'Yetkisiz istek' });
    }

    const supabase = getSupabaseAdmin();
    const sinceIso = new Date(Date.now() - (7 * 24 * 3600 * 1000)).toISOString();

    const [{ data: signals, error: signalsError }, { data: candidates, error: candidatesError }] = await Promise.all([
      supabase
        .from('trend_signals')
        .select('*')
        .gte('detected_at', sinceIso)
        .order('detected_at', { ascending: false })
        .limit(1500),
      supabase
        .from('topic_candidates')
        .select('id,raw_feed_item_id,title,url,source_name,discover_score,traffic_score,status')
        .eq('status', 'active')
        .limit(1500)
    ]);

    if (signalsError) return json(res, 500, { error: signalsError.message });
    if (candidatesError) return json(res, 500, { error: candidatesError.message });

    const clusterMap = new Map();
    for (const signal of signals || []) {
      const key = normalizeTopic(signal.normalized_topic || signal.topic_text || '');
      if (!key) continue;
      if (!clusterMap.has(key)) {
        clusterMap.set(key, {
          clusterKey: hashValue(key),
          clusterName: signal.topic_text || signal.normalized_topic || key,
          normalizedTopic: key,
          marketScope: signal.market_scope || 'global',
          countryCode: signal.country_code || null,
          signals: [],
          sources: new Set(),
          competitors: new Set(),
          firstSeenAt: null,
          lastSeenAt: null,
          signalScoreTotal: 0
        });
      }
      const cluster = clusterMap.get(key);
      cluster.signals.push(signal);
      cluster.sources.add(signal.source_name || '');
      if (COMPETITOR_SOURCES.includes(signal.source_name || '')) cluster.competitors.add(signal.source_name || '');
      cluster.signalScoreTotal += Number(signal.signal_score || 0);
      const ts = new Date(signal.detected_at || 0).toISOString();
      if (!cluster.firstSeenAt || ts < cluster.firstSeenAt) cluster.firstSeenAt = ts;
      if (!cluster.lastSeenAt || ts > cluster.lastSeenAt) cluster.lastSeenAt = ts;
    }

    let clusterUpserts = 0;
    let linkUpserts = 0;
    const debug = [];

    for (const cluster of clusterMap.values()) {
      const avgSignal = Math.round(cluster.signalScoreTotal / Math.max(1, cluster.signals.length));
      const matchedCandidates = (candidates || [])
        .map((candidate) => ({
          candidate,
          match: matchScore(cluster.normalizedTopic, candidate)
        }))
        .filter((row) => row.match >= 45)
        .sort((a, b) => b.match - a.match)
        .slice(0, 15);

      const cleanedClusterName = editorialClusterName(cluster, matchedCandidates);
      const avgDiscover = matchedCandidates.length
        ? Math.round(matchedCandidates.reduce((sum, row) => sum + Number(row.candidate.discover_score || 0), 0) / matchedCandidates.length)
        : 0;
      const avgTraffic = matchedCandidates.length
        ? Math.round(matchedCandidates.reduce((sum, row) => sum + Number(row.candidate.traffic_score || 0), 0) / matchedCandidates.length)
        : 0;
      const freshnessHours = Math.max(0, (Date.now() - new Date(cluster.lastSeenAt || 0).getTime()) / 3600000);
      const freshnessBoost = Math.max(0, 24 - Math.round(freshnessHours));
      const sourceCount = cluster.sources.size;
      const competitorCount = cluster.competitors.size;
      const turkeyInterestScore = cluster.marketScope === 'turkey' || cluster.countryCode === 'TR' ? 80 : 25;
      const earlySignalScore = Math.max(0, Math.min(100, (sourceCount <= 2 ? 40 : 15) + freshnessBoost + Math.round(avgSignal * 0.25)));
      const trendScore = Math.max(0, Math.min(100, freshnessBoost + (sourceCount * 6) + Math.round(avgSignal * 0.35) + Math.round(avgDiscover * 0.2)));
      const discoverPotentialScore = Math.max(0, Math.min(100, Math.round((avgDiscover * 0.7) + (avgSignal * 0.3))));
      const seoPotentialScore = Math.max(0, Math.min(100, Math.round((avgTraffic * 0.6) + (sourceCount * 4) + (freshnessBoost * 0.6))));
      const affiliatePotentialScore = recommendationType(cleanedClusterName, avgDiscover) === 'satın_alma' ? Math.max(65, avgTraffic) : Math.round(avgTraffic * 0.55);

      const clusterRow = {
        cluster_key: cluster.clusterKey,
        cluster_name: cleanedClusterName,
        market_scope: cluster.marketScope,
        country_code: cluster.countryCode,
        source_count: sourceCount,
        signal_count: cluster.signals.length,
        competitor_count: competitorCount,
        turkey_interest_score: turkeyInterestScore,
        early_signal_score: earlySignalScore,
        trend_score: trendScore,
        discover_potential_score: discoverPotentialScore,
        seo_potential_score: seoPotentialScore,
        affiliate_potential_score: affiliatePotentialScore,
        recommendation_type: recommendationType(cleanedClusterName, avgDiscover),
        status: freshnessHours <= 24 ? 'rising' : freshnessHours <= 72 ? 'emerging' : 'archived',
        summary: {
          avg_signal_score: avgSignal,
          avg_discover_score: avgDiscover,
          avg_traffic_score: avgTraffic,
          sample_topics: cluster.signals.slice(0, 5).map((signal) => signal.topic_text),
          display_name: cleanedClusterName
        },
        first_seen_at: cluster.firstSeenAt,
        last_seen_at: cluster.lastSeenAt,
        updated_at: new Date().toISOString()
      };

      const { error: clusterError } = await supabase
        .from('trend_clusters')
        .upsert(clusterRow, { onConflict: 'cluster_key' });

      if (clusterError) {
        debug.push({ cluster: cleanedClusterName, status: 'cluster_error', error: clusterError.message });
        continue;
      }
      clusterUpserts += 1;

      const { data: clusterRecord } = await supabase
        .from('trend_clusters')
        .select('id')
        .eq('cluster_key', cluster.clusterKey)
        .limit(1)
        .maybeSingle();

      if (!clusterRecord?.id) continue;

      for (const row of matchedCandidates) {
        const linkRow = {
          cluster_id: clusterRecord.id,
          topic_candidate_id: row.candidate.id,
          raw_feed_item_id: row.candidate.raw_feed_item_id || null,
          candidate_url: row.candidate.url || null,
          candidate_title: row.candidate.title || null,
          source_name: row.candidate.source_name || null,
          match_score: row.match
        };
        const { error: linkError } = await supabase
          .from('trend_news_links')
          .upsert(linkRow, { onConflict: 'cluster_id,topic_candidate_id' });
        if (!linkError) linkUpserts += 1;
      }
    }

    return json(res, 200, {
      clusters: clusterUpserts,
      links: linkUpserts,
      signal_count: (signals || []).length,
      candidate_count: (candidates || []).length,
      debug
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
