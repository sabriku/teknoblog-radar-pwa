import { getSupabaseAdmin, json } from './_lib.js';
import trendsIngest from './trends-ingest.js';
import trendClusters from './trend-clusters.js';

const NOISE_PATTERNS = [
  /hull\s*city/i,
  /polonya/i,
  /voleybol/i,
  /futbol/i,
  /basketbol/i,
  /\bkupa\b/i,
  /hangi\s*kanalda/i,
  /canli\s*izle|canlı\s*izle/i,
  /\bmac[iı]\b/i,
  /\bmaç[ıi]?\b/i,
  /\bspor\b/i,
  /premier\s*league/i,
  /championship/i,
  /galatasaray/i,
  /fenerbahçe/i,
  /besiktas|beşiktaş/i,
  /trabzonspor/i,
  /transfer/i,
  /derbi/i,
  /süper\s*lig/i,
  /uefa/i,
  /canlı\s*skor/i,
  /tv\s*yayını/i
];

const TECH_PATTERNS = [
  /google|android|iphone|ios|ipad|macbook|windows|samsung|galaxy|xiaomi|huawei|oppo|vivo|honor|pixel/i,
  /openai|chatgpt|gemini|claude|yapay\s*zeka|\bai\b/i,
  /telefon|tablet|laptop|gpu|cpu|nvidia|amd|intel|snapdragon|mediatek|çip|chip|işlemci/i,
  /watch|wear\s*os|akıllı\s*saat|app\s*store|play\s*store|whatsapp|instagram|youtube|chrome/i,
  /güvenlik|siber|hack|veri\s*sızıntısı|yazılım|uygulama|robot|çipset|kamera|batarya/i
];

function isNoise(text = '') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  const noisy = NOISE_PATTERNS.some((pattern) => pattern.test(value));
  if (!noisy) return false;
  return !TECH_PATTERNS.some((pattern) => pattern.test(value));
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
  const sinceIso = new Date(Date.now() - (10 * 24 * 3600 * 1000)).toISOString();
  const { data: signals, error } = await supabase
    .from('trend_signals')
    .select('signal_hash,topic_text,normalized_topic,source_name,signal_payload,detected_at')
    .gte('detected_at', sinceIso)
    .limit(4000);

  if (error) return { deleted_signals: 0, archived_clusters: 0, error: error.message };

  const noisyHashes = [];
  const noisyTopics = new Set();

  for (const signal of signals || []) {
    const payloadText = typeof signal.signal_payload === 'object' ? JSON.stringify(signal.signal_payload) : String(signal.signal_payload || '');
    const text = [signal.topic_text, signal.normalized_topic, signal.source_name, payloadText].filter(Boolean).join(' ');
    if (isNoise(text)) {
      if (signal.signal_hash) noisyHashes.push(signal.signal_hash);
      if (signal.normalized_topic) noisyTopics.add(String(signal.normalized_topic).toLowerCase());
      if (signal.topic_text) noisyTopics.add(String(signal.topic_text).toLowerCase());
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
    .select('cluster_key,cluster_name,summary,last_seen_at')
    .limit(1000);

  let archivedClusters = 0;
  if (!clustersError) {
    const keys = [];
    const staleLimit = Date.now() - (72 * 3600 * 1000);
    for (const cluster of clusters || []) {
      const summaryText = typeof cluster.summary === 'object' ? JSON.stringify(cluster.summary) : String(cluster.summary || '');
      const lastSeen = new Date(cluster.last_seen_at || 0).getTime();
      const text = [cluster.cluster_name, summaryText].filter(Boolean).join(' ');
      if (isNoise(text) || (lastSeen && lastSeen < staleLimit)) {
        if (cluster.cluster_key) keys.push(cluster.cluster_key);
      }
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

  return { deleted_signals: deletedSignals, archived_clusters: archivedClusters };
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

    return json(res, 200, {
      ok: true,
      ingest_status: ingest.status,
      ingest: ingest.data,
      cleanup,
      clusters_status: clusters.status,
      clusters: clusters.data,
      synced_at: new Date().toISOString()
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
