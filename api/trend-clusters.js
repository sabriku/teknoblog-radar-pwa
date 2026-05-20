import { getSupabaseAdmin, json, hashValue } from './_lib.js';

const COMPETITOR_SOURCES = [
  'Webrazzi', 'ShiftDelete.Net', 'DonanımHaber', 'Android Authority', 'The Verge',
  '9to5Google', 'MacRumors', 'Windows Central', 'SamMobile', 'GSMArena'
];

const SOURCE_SUFFIXES = [
  'Mashable', 'CNBC', 'blog.google', 'Google Blog', 'Webtekno', 'Tamindir', 'LOG.com.tr',
  'TechRadar', 'TechCrunch', 'Digital Trends', 'Ars Technica', 'Engadget', '9to5Google',
  'Android Authority', 'Windows Central', 'The Verge', 'GSMArena', 'SamMobile', 'MacRumors',
  'DonanımHaber', 'ShiftDelete.Net', 'Webrazzi', 'Tom\'s Hardware', 'Vietnam.vn', 'Yeni Asır',
  'A Haber', 'Gizmochina', 'Uşak Haber Gazetesi', 'samsung.com', 'OpenAI'
];

const WEAK_TITLE_PATTERNS = [
  /\blive\b/i,
  /\bprimer\b/i,
  /\bwhat to expect\b/i,
  /\broundup\b/i,
  /\bweekly\b/i,
  /\bpodcast\b/i,
  /\breview\b/i,
  /\bhow to watch\b/i,
  /\bthings to expect\b/i,
  /\bthings you should know\b/i,
  /\beverything (new|google announced|we know)\b/i,
  /\bher şey\b/i,
  /\bcanlı\b/i,
  /\bözet\b/i,
  /\bbeklenenler\b/i,
  /\binceleme\b/i,
  /\bthe sideload\b/i,
  /\bkeynote\b/i
];

const STRONG_TOPIC_PATTERNS = [
  /\bgemini spark\b/i,
  /\bgemini omni\b/i,
  /\bgemini 3\.5 flash\b/i,
  /\bchatgpt\b/i,
  /\bopenai\b/i,
  /\bgalaxy s\d+\b/i,
  /\bone ui 8\.5\b/i,
  /\bone ui 9\.0\b/i,
  /\bandroid xr\b/i,
  /\bsmart glasses\b/i,
  /\bakıllı gözlük\b/i,
  /\bhuawei watch fit 5 pro\b/i,
  /\bios 27\b/i,
  /\bios\b/i,
  /\bandroid\b/i,
  /\bsamsung\b/i,
  /\bgoogle\b/i,
  /\bhuawei\b/i,
  /\bxiaomi\b/i,
  /\biphone\b/i,
  /\bpixel\b/i,
  /\bwatch\b/i,
  /\bai\b/i,
  /\byapay zeka\b/i,
  /\bgüncelleme\b/i,
  /\bupdate\b/i,
  /\bfiyat\b/i,
  /\bindirim\b/i,
  /\bkampanya\b/i
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
    .replace(/^How to watch\s+/i, '')
    .replace(/^7 things you should know about\s+/i, '')
    .replace(/^5 things to expect at\s+/i, '')
    .replace(/^I\/O\s?2026:\s*/i, '')
    .replace(/^Google I\/O\s?2026:\s*/i, '')
    .replace(/^Google debuts\s+/i, 'Google ')
    .replace(/^Google announces\s+/i, 'Google ')
    .replace(/^Google says\s+/i, 'Google ')
    .replace(/^Everything new in our\s+/i, '')
    .replace(/^Everything Google announced at\s+/i, '')
    .replace(/^Everything announced at\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function isWeakTitle(value = '') {
  const text = cleanupTitle(value);
  if (!text) return true;
  if (text.length < 8) return true;
  return WEAK_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

function strongTopicScore(value = '') {
  const text = cleanupTitle(value);
  if (!text) return -100;
  let score = 0;
  for (const pattern of STRONG_TOPIC_PATTERNS) {
    if (pattern.test(text)) score += 8;
  }
  if (!isWeakTitle(text)) score += 20;
  if (text.length >= 12 && text.length <= 80) score += 10;
  if (/[:]/.test(text)) score -= 6;
  if (/\b(live|primer|review|podcast|roundup|weekly|keynote)\b/i.test(text)) score -= 30;
  return score;
}

function titleCandidates(cluster = {}, matchedCandidates = []) {
  const candidates = [];
  for (const row of matchedCandidates) {
    const title = cleanupTitle(row?.candidate?.title || '');
    if (!title) continue;
    candidates.push({ title, score: strongTopicScore(title) + Math.max(0, Number(row?.match || 0) - 50) });
  }
  for (const signal of cluster.signals || []) {
    const title = cleanupTitle(signal?.topic_text || '');
    if (!title) continue;
    candidates.push({ title, score: strongTopicScore(title) });
  }
  return candidates.sort((a, b) => b.score - a.score || a.title.length - b.title.length);
}

function extractTopicLabel(title = '') {
  const text = cleanupTitle(title);
  if (!text) return '';

  const patterns = [
    [/gemini spark/i, 'Gemini Spark'],
    [/gemini omni/i, 'Gemini Omni'],
    [/gemini 3\.5 flash/i, 'Gemini 3.5 Flash'],
    [/openai for singapore/i, 'OpenAI Singapore'],
    [/chatgpt.*bank accounts|bank accounts.*chatgpt/i, 'ChatGPT banka hesabı erişimi'],
    [/one ui 9\.0 beta/i, 'One UI 9.0 beta'],
    [/one ui 8\.5/i, 'One UI 8.5 güncellemesi'],
    [/android xr.*smart glasses|smart glasses.*android xr/i, 'Android XR akıllı gözlükler'],
    [/samsung.*smart glasses|smart glasses.*samsung/i, 'Samsung ve Google akıllı gözlükleri'],
    [/google i\/o 2026|i\/o 2026/i, 'Google I/O 2026 duyuruları'],
    [/google ai studio/i, 'Google AI Studio'],
    [/gmail inbox|gmail/i, 'Gemini ve Gmail entegrasyonu'],
    [/huawei watch fit 5 pro/i, 'Huawei Watch Fit 5 Pro'],
    [/ios 27/i, 'iOS 27 yapay zeka özellikleri'],
    [/galaxy s26.*one ui 9/i, 'Galaxy S26 One UI 9 beta'],
    [/galaxy.*one ui 8\.5|one ui 8\.5.*galaxy/i, 'Galaxy One UI 8.5 güncellemesi'],
    [/xiaomi yu7/i, 'Xiaomi YU7 GT']
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) return label;
  }

  return '';
}

function editorialClusterName(cluster = {}, matchedCandidates = []) {
  const candidates = titleCandidates(cluster, matchedCandidates)
    .filter((item) => item.score >= 10)
    .map((item) => item.title);

  for (const candidate of candidates) {
    const label = extractTopicLabel(candidate);
    if (label) return label;
  }

  const firstStrong = candidates.find((title) => !isWeakTitle(title) && title.length <= 80);
  if (firstStrong) return firstStrong.slice(0, 140);

  const fallback = cleanupTitle(cluster.clusterName || '') || cluster.normalizedTopic;
  return fallback.replace(/\s+/g, ' ').trim().slice(0, 140);
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
  const ratio = hitCount / clusterWords.length;
  const base = Math.round(ratio * 100);
  if (clusterWords.length <= 2 && hitCount < clusterWords.length) return Math.min(base, 55);
  if (ratio < 0.6) return Math.min(base, 54);
  return base;
}

function clusterCoreTokens(clusterName = '') {
  return normalizeTopic(clusterName)
    .split(' ')
    .filter(Boolean)
    .filter((word) => word.length >= 3)
    .filter((word) => !['google', 'samsung', 'openai', 'android', 'galaxy', 'gemini', 'chatgpt'].includes(word) || normalizeTopic(clusterName).split(' ').length <= 2);
}

function linkedNewsQuality(clusterName = '', candidateTitle = '', match = 0) {
  const cleanedTitle = cleanupTitle(candidateTitle);
  if (!cleanedTitle) return -100;
  if (isWeakTitle(cleanedTitle)) return -40;

  const topicLabel = extractTopicLabel(clusterName) || cleanupTitle(clusterName);
  const clusterNorm = normalizeTopic(topicLabel);
  const titleNorm = normalizeTopic(cleanedTitle);
  const coreTokens = clusterCoreTokens(topicLabel);
  const tokenHits = coreTokens.filter((token) => titleNorm.includes(token)).length;

  let score = Number(match || 0);
  score += strongTopicScore(cleanedTitle) * 0.5;

  if (clusterNorm && titleNorm.includes(clusterNorm)) score += 20;
  if (coreTokens.length) score += tokenHits * 8;
  if (coreTokens.length >= 2 && tokenHits < 2) score -= 20;
  if (coreTokens.length >= 3 && tokenHits < 2) score -= 25;
  if (/\b(blockchain|vpn|eurovision|roland garros|iihf|hockey|streaming)\b/i.test(cleanedTitle)) score -= 35;
  if (/\bhow to watch|things to expect|things you should know|live\b/i.test(cleanedTitle)) score -= 18;

  return score;
}

function filterLinkedCandidates(clusterName = '', rows = []) {
  return rows
    .map((row) => ({ ...row, quality: linkedNewsQuality(clusterName, row?.candidate?.title || '', row?.match || 0) }))
    .filter((row) => row.quality >= 55)
    .sort((a, b) => b.quality - a.quality || b.match - a.match)
    .slice(0, 5);
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
        .filter((row) => row.match >= 60)
        .sort((a, b) => b.match - a.match)
        .slice(0, 12);

      const cleanedClusterName = editorialClusterName(cluster, matchedCandidates);
      const linkedCandidates = filterLinkedCandidates(cleanedClusterName, matchedCandidates);
      const avgDiscover = linkedCandidates.length
        ? Math.round(linkedCandidates.reduce((sum, row) => sum + Number(row.candidate.discover_score || 0), 0) / linkedCandidates.length)
        : 0;
      const avgTraffic = linkedCandidates.length
        ? Math.round(linkedCandidates.reduce((sum, row) => sum + Number(row.candidate.traffic_score || 0), 0) / linkedCandidates.length)
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

      const { data: clusterRecord, error: clusterLookupError } = await supabase
        .from('trend_clusters')
        .select('id')
        .eq('cluster_key', cluster.clusterKey)
        .limit(1)
        .maybeSingle();

      if (clusterLookupError || !clusterRecord?.id) {
        if (clusterLookupError) {
          debug.push({ cluster: cleanedClusterName, status: 'cluster_lookup_error', error: clusterLookupError.message });
        }
        continue;
      }

      const { error: deleteLinksError } = await supabase
        .from('trend_news_links')
        .delete()
        .eq('cluster_id', clusterRecord.id);

      if (deleteLinksError) {
        debug.push({ cluster: cleanedClusterName, status: 'delete_links_error', error: deleteLinksError.message });
        continue;
      }

      for (const row of linkedCandidates) {
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
          .insert(linkRow);
        if (!linkError) {
          linkUpserts += 1;
        } else {
          debug.push({ cluster: cleanedClusterName, status: 'link_insert_error', error: linkError.message, title: row.candidate.title || '' });
        }
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
