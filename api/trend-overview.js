import { getSupabaseAdmin, json, hashValue } from './_lib.js';

const TECH_INCLUDE_PATTERNS = [
  /\bai\b/i,
  /\byapay zeka\b/i,
  /\bgemini\b/i,
  /\bopenai\b/i,
  /\bchatgpt\b/i,
  /\bcodex\b/i,
  /\bgmail\b/i,
  /\bandroid\b/i,
  /\bone ui\b/i,
  /\bios\b/i,
  /\bios 27\b/i,
  /\bios 18\b/i,
  /\biphone\b/i,
  /\bipad\b/i,
  /\bmac\b/i,
  /\bwindows\b/i,
  /\bpixel\b/i,
  /\bgalaxy\b/i,
  /\bsamsung\b/i,
  /\bgoogle\b/i,
  /\bapple\b/i,
  /\bhuawei\b/i,
  /\bxiaomi\b/i,
  /\bmeta\b/i,
  /\byoutube\b/i,
  /\bshorts\b/i,
  /\bsearch\b/i,
  /\bchrome\b/i,
  /\bgözlük\b/i,
  /\bsmart glasses\b/i,
  /\bakıllı gözlük\b/i,
  /\bwatch\b/i,
  /\btelefon\b/i,
  /\btablet\b/i,
  /\blaptop\b/i,
  /\bchip\b/i,
  /\bçip\b/i,
  /\bprocessor\b/i,
  /\bişlemci\b/i,
  /\bgpu\b/i,
  /\bcpu\b/i,
  /\bupdate\b/i,
  /\bgüncelleme\b/i,
  /\brollout\b/i,
  /\bfeature\b/i,
  /\bözellik\b/i,
  /\bapp\b/i,
  /\bapplication\b/i,
  /\buygulama\b/i,
  /\bstreet view\b/i,
  /\bgenie\b/i,
  /\bomni\b/i,
  /\bspark\b/i,
  /\bflash\b/i,
  /\bxr\b/i
];

const TECH_EXCLUDE_PATTERNS = [
  /\bdeprem\b/i,
  /\bhava durumu\b/i,
  /\bmeteoroloji\b/i,
  /\bmaç\b/i,
  /\bfutbol\b/i,
  /\bbasketbol\b/i,
  /\bfinal\b/i,
  /\blive\b/i,
  /\bkonser\b/i,
  /\bbelediye\b/i,
  /\bsiyaset\b/i,
  /\bparti\b/i,
  /\bseçim\b/i,
  /\bemekli\b/i,
  /\bmaaş\b/i,
  /\baltın\b/i,
  /\bdolar\b/i,
  /\bfaiz\b/i,
  /\bprime video\b/i,
  /\bsezon\b/i,
  /\bbölüm\b/i,
  /\bkimdir\b/i,
  /\bsevgilisi\b/i,
  /\bsurvivor\b/i,
  /\bthe boys\b/i,
  /\bçılgın sayısal\b/i,
  /\bşok kataloğu\b/i,
  /\bbankalar açık mı\b/i,
  /\bptt\b/i,
  /\bbaraj\b/i,
  /\belektrik kesintisi\b/i,
  /\bson dakika\b/i,
  /\bokullar ne zaman kapanıyor\b/i
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTopic(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWindow(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['4h', '24h', '48h'].includes(normalized) ? normalized : '24h';
}

function windowHours(windowValue = '24h') {
  return Number(String(windowValue).replace(/[^0-9]/g, '')) || 24;
}

function hoursAgoIso(hours) {
  return new Date(Date.now() - (hours * 3600 * 1000)).toISOString();
}

function sortByRecencyAndTrend(a, b) {
  const leftCount = Number(a.window_signal_count || 0);
  const rightCount = Number(b.window_signal_count || 0);
  if (rightCount !== leftCount) return rightCount - leftCount;

  const leftTrend = Number(a.trend_score || 0);
  const rightTrend = Number(b.trend_score || 0);
  if (rightTrend !== leftTrend) return rightTrend - leftTrend;

  return new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime();
}

function bucketSizeHours(windowValue = '24h') {
  if (windowValue === '4h') return 1;
  if (windowValue === '48h') return 4;
  return 2;
}

function formatBucketLabel(date, bucketHours) {
  const pad = (n) => String(n).padStart(2, '0');
  const hour = date.getUTCHours();
  if (bucketHours >= 24) return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}`;
  return `${pad(hour)}:00`;
}

function buildSparkline(signals = [], selectedWindow = '24h') {
  const hours = windowHours(selectedWindow);
  const bucketHours = bucketSizeHours(selectedWindow);
  const bucketCount = Math.max(1, Math.ceil(hours / bucketHours));
  const now = Date.now();
  const bucketMs = bucketHours * 3600 * 1000;
  const startMs = now - (bucketCount * bucketMs);
  const buckets = [];

  for (let i = 0; i < bucketCount; i += 1) {
    const bucketStart = startMs + (i * bucketMs);
    buckets.push({
      ts: new Date(bucketStart).toISOString(),
      label: formatBucketLabel(new Date(bucketStart), bucketHours),
      count: 0
    });
  }

  for (const signal of signals) {
    const detectedAt = new Date(signal.detected_at || 0).getTime();
    if (!Number.isFinite(detectedAt) || detectedAt < startMs) continue;
    const index = Math.floor((detectedAt - startMs) / bucketMs);
    if (index >= 0 && index < buckets.length) {
      buckets[index].count += 1;
    }
  }

  return buckets;
}

function looksTech(text = '') {
  const value = String(text || '');
  return TECH_INCLUDE_PATTERNS.some((pattern) => pattern.test(value));
}

function looksExcluded(text = '') {
  const value = String(text || '');
  return TECH_EXCLUDE_PATTERNS.some((pattern) => pattern.test(value));
}

function isTechCluster(cluster = {}) {
  const text = [
    cluster.cluster_name,
    cluster.summary?.display_name,
    ...(Array.isArray(cluster.summary?.sample_topics) ? cluster.summary.sample_topics : []),
    ...(Array.isArray(cluster.linked_news) ? cluster.linked_news.map((item) => item.candidate_title) : [])
  ].filter(Boolean).join(' \n ');

  if (!text.trim()) return false;
  if (looksExcluded(text) && !looksTech(text)) return false;
  if (looksTech(text)) return true;

  const linkedNews = Array.isArray(cluster.linked_news) ? cluster.linked_news : [];
  const highScores = Number(cluster.discover_potential_score || 0) >= 55 || Number(cluster.trend_score || 0) >= 60;
  return linkedNews.length >= 2 && highScores;
}

function decorateCluster(cluster = {}, signalGroup = {}, selectedWindow = '24h') {
  const signals = Array.isArray(signalGroup.signals) ? signalGroup.signals : [];
  const sparkline = buildSparkline(signals, selectedWindow);
  const latestSignalAt = signals.length
    ? signals.reduce((latest, item) => {
        const current = new Date(item.detected_at || 0).toISOString();
        return !latest || current > latest ? current : latest;
      }, '')
    : null;

  return {
    ...cluster,
    selected_window: selectedWindow,
    window_signal_count: signals.length,
    sparkline,
    latest_signal_at: latestSignalAt,
    linked_news: Array.isArray(cluster.linked_news) ? cluster.linked_news : []
  };
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const selectedWindow = parseWindow(req.query?.window || '24h');
    const limit = clamp(Number(req.query?.limit || 12), 1, 24);
    const hours = windowHours(selectedWindow);
    const sinceIso = hoursAgoIso(hours + 4);

    const { data: signals, error: signalsError } = await supabase
      .from('trend_signals')
      .select('normalized_topic,topic_text,detected_at,time_window,market_scope,country_code,signal_score')
      .eq('time_window', selectedWindow)
      .gte('detected_at', sinceIso)
      .order('detected_at', { ascending: false })
      .limit(2000);

    if (signalsError) return json(res, 500, { error: signalsError.message });

    const signalGroups = new Map();
    for (const signal of signals || []) {
      const normalizedTopic = normalizeTopic(signal.normalized_topic || signal.topic_text || '');
      if (!normalizedTopic) continue;
      const clusterKey = hashValue(normalizedTopic);
      if (!signalGroups.has(clusterKey)) {
        signalGroups.set(clusterKey, {
          cluster_key: clusterKey,
          normalized_topic: normalizedTopic,
          signals: []
        });
      }
      signalGroups.get(clusterKey).signals.push(signal);
    }

    const clusterKeys = [...signalGroups.keys()];
    if (!clusterKeys.length) {
      return json(res, 200, { items: [], window: selectedWindow, available_windows: ['4h', '24h', '48h'] });
    }

    const { data: clusters, error: clustersError } = await supabase
      .from('trend_clusters')
      .select('*')
      .in('cluster_key', clusterKeys)
      .neq('status', 'archived')
      .limit(100);

    if (clustersError) return json(res, 500, { error: clustersError.message });

    const clusterIds = (clusters || []).map((item) => item.id).filter(Boolean);
    let links = [];
    if (clusterIds.length) {
      const { data: linkRows, error: linksError } = await supabase
        .from('trend_news_links')
        .select('cluster_id,candidate_title,candidate_url,source_name,match_score')
        .in('cluster_id', clusterIds)
        .order('match_score', { ascending: false });

      if (linksError) return json(res, 500, { error: linksError.message });
      links = linkRows || [];
    }

    const linksByCluster = new Map();
    for (const link of links) {
      const key = String(link.cluster_id || '');
      if (!linksByCluster.has(key)) linksByCluster.set(key, []);
      if (linksByCluster.get(key).length < 5) linksByCluster.get(key).push(link);
    }

    const decorated = (clusters || [])
      .map((cluster) => {
        const signalGroup = signalGroups.get(String(cluster.cluster_key || '')) || { signals: [] };
        return decorateCluster(
          {
            ...cluster,
            linked_news: linksByCluster.get(String(cluster.id || '')) || []
          },
          signalGroup,
          selectedWindow
        );
      })
      .filter((cluster) => Number(cluster.window_signal_count || 0) > 0)
      .filter(isTechCluster)
      .sort(sortByRecencyAndTrend)
      .slice(0, limit);

    return json(res, 200, {
      items: decorated,
      window: selectedWindow,
      available_windows: ['4h', '24h', '48h']
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
