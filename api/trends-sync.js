import { getSupabaseAdmin, json } from './_lib.js';
import trendsIngest from './trends-ingest.js';
import trendClusters from './trend-clusters.js';

const TEAM_AND_SPORT_PATTERNS = [
  /galatasaray|fenerbahçe|fenerbahce|beşiktaş|besiktas|trabzonspor|başakşehir|basaksehir|bursaspor|göztepe|goztepe|sivasspor|konyaspor|kayserispor|rizespor|samsunspor|antalyaspor/i,
  /hull\s*city|polonya|türkiye|turkiye|almanya|fransa|italya|ispanya|ingiltere|portekiz|hollanda|brezilya|arjantin/i,
  /real\s*madrid|barcelona|liverpool|arsenal|chelsea|manchester|city|united|psg|juventus|milan|inter|bayern/i,
  /futbol|voleybol|basketbol|tenis|hentbol|hockey|formula\s*1|f1|nba|euroleague|süper\s*lig|super\s*lig|uefa|şampiyonlar\s*ligi|sampiyonlar\s*ligi|avrupa\s*ligi/i
];

const SPORTS_INTENT_PATTERNS = [
  /hangi\s*kanalda/i,
  /ne\s*zaman/i,
  /saat\s*kaçta|saat\s*kacta/i,
  /canlı\s*izle|canli\s*izle/i,
  /canlı\s*skor|canli\s*skor/i,
  /skor|puan\s*durumu|fikstür|fikstur|kadrosu|ilk\s*11|hakem/i,
  /\bkupa\b|final|yarı\s*final|yari\s*final|çeyrek\s*final|ceyrek\s*final/i,
  /bilet|yayın|yayin|tv\s*yayını|tv\s*yayini/i
];

const DIRECT_SPORTS_PATTERNS = [
  /\bmaç[ıi]?\b/i,
  /\bmac[iı]?\b/i,
  /\bmaçı\b/i,
  /\bmaci\b/i,
  /\bderbi\b/i,
  /\btransfer\b/i,
  /\bspor\b/i,
  /\bfutbol\b/i,
  /\bvoleybol\b/i,
  /\bbasketbol\b/i
];

const TECH_PATTERNS = [
  /macbook|imac|mac\s*studio|mac\s*mini|macos|apple\s*mac|m\d\s*mac/i,
  /google|android|iphone|ios|ipad|windows|samsung|galaxy|xiaomi|huawei|oppo|vivo|honor|pixel/i,
  /openai|chatgpt|gemini|claude|yapay\s*zeka|\bai\b/i,
  /telefon|tablet|laptop|gpu|cpu|nvidia|amd|intel|snapdragon|mediatek|çip|chip|işlemci/i,
  /watch|wear\s*os|akıllı\s*saat|app\s*store|play\s*store|whatsapp|instagram|youtube|chrome/i,
  /güvenlik|siber|hack|veri\s*sızıntısı|yazılım|uygulama|robot|çipset|kamera|batarya/i
];

function compactText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o')
    .replace(/[ş]/g, 's')
    .replace(/[ü]/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTechContext(text = '') {
  return TECH_PATTERNS.some((pattern) => pattern.test(text));
}

function hasSportsContext(text = '') {
  const plain = String(text || '').toLowerCase();
  const ascii = compactText(text);
  const combined = `${plain} ${ascii}`;
  const hasDirectSports = DIRECT_SPORTS_PATTERNS.some((pattern) => pattern.test(combined));
  const hasTeamOrSport = TEAM_AND_SPORT_PATTERNS.some((pattern) => pattern.test(combined));
  const hasSportsIntent = SPORTS_INTENT_PATTERNS.some((pattern) => pattern.test(combined));
  if (hasDirectSports && (hasTeamOrSport || hasSportsIntent)) return true;
  if (/\bmac\b/i.test(ascii) && (hasTeamOrSport || hasSportsIntent)) return true;
  if (hasTeamOrSport && hasSportsIntent) return true;
  return false;
}

function isNoise(text = '') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  if (hasSportsContext(value) && !hasTechContext(value)) return true;
  if (/hull\s*city|canlı\s*skor|canli\s*skor|hangi\s*kanalda|ne\s*zaman|saat\s*kacta|saat\s*kaçta/i.test(value) && !hasTechContext(value)) return true;
  return false;
}

function makeReq(originalReq) {
  return { ...originalReq, query: { ...(originalReq.query || {}) } };
}

function callHandler(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(key, value) { this.headers[key] = value; },
      end(body) {
        let data = body;
        try { data = JSON.parse(body); } catch {}
        resolve({ status: this.statusCode, data });
      }
    };
    Promise.resolve(handler(req, res)).catch((error) => {
      resolve({ status: 500, data: { error: error?.message || String(error) } });
    });
  });
}

async function cleanupNoise(supabase) {
  const sinceIso = new Date(Date.now() - (30 * 24 * 3600 * 1000)).toISOString();
  const { data: signals, error } = await supabase
    .from('trend_signals')
    .select('signal_hash,topic_text,normalized_topic,source_name,signal_payload,detected_at')
    .gte('detected_at', sinceIso)
    .limit(8000);

  if (error) return { deleted_signals: 0, archived_clusters: 0, deleted_links: 0, error: error.message };

  const noisyHashes = [];
  const noisyTopics = new Set();

  for (const signal of signals || []) {
    const payloadText = typeof signal.signal_payload === 'object' ? JSON.stringify(signal.signal_payload) : String(signal.signal_payload || '');
    const text = [signal.topic_text, signal.normalized_topic, signal.source_name, payloadText].filter(Boolean).join(' ');
    if (isNoise(text)) {
      if (signal.signal_hash) noisyHashes.push(signal.signal_hash);
      if (signal.normalized_topic) noisyTopics.add(compactText(signal.normalized_topic));
      if (signal.topic_text) noisyTopics.add(compactText(signal.topic_text));
    }
  }

  let deletedSignals = 0;
  for (let i = 0; i < noisyHashes.length; i += 200) {
    const chunk = noisyHashes.slice(i, i + 200);
    if (!chunk.length) continue;
    const { error: deleteError } = await supabase
      .from('trend_signals')
      .delete()
      .in('signal_hash', chunk);
    if (!deleteError) deletedSignals += chunk.length;
  }

  const { data: clusters, error: clustersError } = await supabase
    .from('trend_clusters')
    .select('id,cluster_key,cluster_name,summary,last_seen_at')
    .limit(3000);

  let archivedClusters = 0;
  let deletedLinks = 0;
  if (!clustersError) {
    const keys = [];
    const clusterIds = [];
    for (const cluster of clusters || []) {
      const summaryText = typeof cluster.summary === 'object' ? JSON.stringify(cluster.summary) : String(cluster.summary || '');
      const text = [cluster.cluster_name, summaryText].filter(Boolean).join(' ');
      const compact = compactText(text);
      const topicHit = [...noisyTopics].some((topic) => topic && compact.includes(topic));
      if (isNoise(text) || topicHit) {
        if (cluster.cluster_key) keys.push(cluster.cluster_key);
        if (cluster.id) clusterIds.push(cluster.id);
      }
    }

    for (let i = 0; i < clusterIds.length; i += 200) {
      const chunk = clusterIds.slice(i, i + 200);
      if (!chunk.length) continue;
      const { error: deleteLinksError } = await supabase
        .from('trend_news_links')
        .delete()
        .in('cluster_id', chunk);
      if (!deleteLinksError) deletedLinks += chunk.length;
    }

    for (let i = 0; i < keys.length; i += 200) {
      const chunk = keys.slice(i, i + 200);
      if (!chunk.length) continue;
      const { error: updateError } = await supabase
        .from('trend_clusters')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .in('cluster_key', chunk);
      if (!updateError) archivedClusters += chunk.length;
    }
  }

  return { deleted_signals: deletedSignals, archived_clusters: archivedClusters, deleted_links: deletedLinks };
}

export default async function handler(req, res) {
  try {
    const token = req.query?.token || '';
    const expected = process.env.CRON_TOKEN || '';
    if (!expected || token !== expected) return json(res, 401, { error: 'Yetkisiz istek' });

    const supabase = getSupabaseAdmin();
    const ingest = await callHandler(trendsIngest, makeReq(req));
    const cleanup = await cleanupNoise(supabase);
    const clusters = await callHandler(trendClusters, makeReq(req));
    const secondCleanup = await cleanupNoise(supabase);

    return json(res, 200, {
      ok: true,
      ingest_status: ingest.status,
      ingest: ingest.data,
      cleanup,
      clusters_status: clusters.status,
      clusters: clusters.data,
      second_cleanup: secondCleanup,
      synced_at: new Date().toISOString()
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
