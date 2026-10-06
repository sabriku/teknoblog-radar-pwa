import { randomUUID } from 'node:crypto';

const baseUrl = process.env.RADAR_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.CRON_TOKEN || '';

if (!token) throw new Error('CRON_TOKEN tanımlı değil.');

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 8 * 60 * 1000);
const ownerId = randomUUID();
let runId = null;
let acquired = false;

async function jobAction(action, payload = {}) {
  const response = await fetch(`${baseUrl}/api/refresh-job`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-token': token },
    body: JSON.stringify({ action, owner_id: ownerId, ...payload }), signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Refresh job ${action} HTTP ${response.status}`);
  return data;
}

try {
  const lease = await jobAction('begin');
  if (!lease.acquired) {
    console.log(JSON.stringify({ mode: 'incremental', skipped: 'refresh_already_running' }));
    process.exitCode = 0;
  } else {
    acquired = true;
    runId = lease.run_id;
  // Keep high-priority sources fresh without rescanning the entire catalogue
  // every few minutes. The remaining sources rotate through four quarter-hour
  // slots, so all sources are covered within an hour.
  const quarterSlot = Math.floor(Date.now() / (15 * 60 * 1000)) % 4;
  const ingestWindows = [
    { source_offset: 0, source_limit: 12 },
    { source_offset: 12 + quarterSlot * 10, source_limit: 10 }
  ];
  const ingest = [];
  for (const window of ingestWindows) {
    let offset = window.source_offset;
    const end = offset + window.source_limit;
    while (offset < end) {
      const response = await fetch(`${baseUrl}/api/ingest?token=${encodeURIComponent(token)}&source_limit=${end - offset}&source_offset=${offset}&item_limit=24`, {
        cache: 'no-store', signal: controller.signal
      });
      const body = await response.text();
      let data = {};
      try { data = JSON.parse(body); } catch {}
      if (!response.ok) throw new Error(data?.error || body.slice(0, 500) || `Ingest HTTP ${response.status}`);
      ingest.push({ source_offset: offset, attempted: Number(data.attempted_sources || 0), ingested: Number(data.ingested || 0), updated: Number(data.updated || 0) });
      if (!data.attempted_sources && !data.has_more) break;
      const next = Number(data.next_source_offset);
      if (!Number.isInteger(next) || next <= offset) throw new Error(`Ingest did not advance past source ${offset}`);
      offset = next;
    }
  }
  const scoreResponse = await fetch(`${baseUrl}/api/score-batch?token=${encodeURIComponent(token)}&offset=0&limit=400`, {
    cache: 'no-store', signal: controller.signal
  });
  const scoreText = await scoreResponse.text();
  let scoreData = {};
  try { scoreData = JSON.parse(scoreText); } catch {}
  if (!scoreResponse.ok) throw new Error(scoreData?.error || scoreText || `Score HTTP ${scoreResponse.status}`);
  if (scoreData.errors?.length || scoreData.stopped_early) throw new Error(`Score batch incomplete: ${(scoreData.errors || []).join('; ') || 'time budget reached'}`);
  const snapshotResponse = await fetch(`${baseUrl}/api/editorial-dashboard`, {
    method: 'POST', headers: { 'x-cron-token': token }, signal: controller.signal
  });
  const snapshotData = await snapshotResponse.json().catch(() => ({}));
  if (!snapshotResponse.ok) throw new Error(snapshotData.error || `Editorial snapshot HTTP ${snapshotResponse.status}`);
  await jobAction('complete', { run_id: runId, ingested_count: ingest.reduce((sum, batch) => sum + batch.ingested, 0),
    processed_count: Number(scoreData.processed || 0), notes: { quarter_slot: quarterSlot, batches: ingest.length, story_snapshot: snapshotData.snapshot } });
  acquired = false;
  console.log(JSON.stringify({ mode: 'incremental', quarter_slot: quarterSlot, ingest, processed: Number(scoreData.processed || 0), story_snapshot: snapshotData.snapshot }));
  const minute = new Date().getUTCMinutes();
  const followupActions = ['run_alerts', 'sync_teknoblog'];
  if (minute % 15 < 5) followupActions.push('reconcile_queue_publications');
  try {
    const authResponse = await fetch(`${baseUrl}/api/google-auth`, { signal: controller.signal });
    const auth = await authResponse.json().catch(() => ({}));
    if (authResponse.ok && auth.connected) {
      if (minute < 5) followupActions.push('sync_gsc');
    }
  } catch {}
  for (const action of followupActions) {
    try {
      const followup = await fetch(`${baseUrl}/api/intelligence?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(action === 'sync_teknoblog' ? { max_pages: 1 } : {}) }), signal: controller.signal
      });
      const followupData = await followup.json().catch(() => ({}));
      console.log(JSON.stringify({ action, ok: followup.ok, ...followupData }));
    } catch (error) {
      console.log(JSON.stringify({ action, ok: false, skipped: true, error: error?.message || String(error) }));
    }
  }
  const trendWindows = minute % 15 < 5 ? ['4h', '24h'] : ['4h'];
  for (const window of trendWindows) {
    try {
      const trends = await fetch(`${baseUrl}/api/trend-overview?google_trends=1&geo=all&category=all&window=${window}&limit=72`, { cache: 'no-store', signal: controller.signal });
      const trendsData = await trends.json().catch(() => ({}));
      console.log(JSON.stringify({ action: 'sync_google_trends', window, ok: trends.ok, count: trendsData.count || 0, source: trendsData.data_source || null }));
    } catch (error) {
      console.log(JSON.stringify({ action: 'sync_google_trends', window, ok: false, error: error?.message || String(error) }));
    }
  }
  if (minute % 30 < 5) {
    try {
      const opportunities = await fetch(`${baseUrl}/api/opportunity-radar?refresh=1&limit=60`, { cache: 'no-store', signal: controller.signal });
      const opportunityData = await opportunities.json().catch(() => ({}));
      console.log(JSON.stringify({ action: 'sync_opportunities', ok: opportunities.ok, count: opportunityData.count || 0, scanned: opportunityData.scan?.found || 0 }));
    } catch (error) {
      console.log(JSON.stringify({ action: 'sync_opportunities', ok: false, error: error?.message || String(error) }));
    }
  }
  if (minute < 15) {
    try {
      const products = await fetch(`${baseUrl}/api/product-radar?refresh=1&hours=168&limit=60&token=${encodeURIComponent(token)}`, { cache: 'no-store', signal: controller.signal });
      const productData = await products.json().catch(() => ({}));
      console.log(JSON.stringify({ action: 'sync_product_radar', ok: products.ok, count: productData.count || 0, sync: productData.sync || null }));
    } catch (error) {
      console.log(JSON.stringify({ action: 'sync_product_radar', ok: false, error: error?.message || String(error) }));
    }
  }
  }
} catch (error) {
  if (runId && acquired) await jobAction('fail', { run_id: runId, error: String(error?.message || error) }).catch(() => {});
  throw error;
} finally {
  clearTimeout(timer);
}
