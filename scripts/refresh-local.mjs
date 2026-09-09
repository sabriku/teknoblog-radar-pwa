const baseUrl = process.env.RADAR_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.CRON_TOKEN || '';

if (!token) throw new Error('CRON_TOKEN tanımlı değil.');

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 8 * 60 * 1000);

try {
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
    const response = await fetch(`${baseUrl}/api/ingest?token=${encodeURIComponent(token)}&source_limit=${window.source_limit}&source_offset=${window.source_offset}&item_limit=24`, {
      cache: 'no-store', signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}
    if (!response.ok) throw new Error(data?.error || text || `Ingest HTTP ${response.status}`);
    ingest.push({ ...window, ingested: Number(data.ingested || 0), updated: Number(data.updated || 0) });
  }
  const scoreResponse = await fetch(`${baseUrl}/api/score-batch?token=${encodeURIComponent(token)}&offset=0&limit=400`, {
    cache: 'no-store', signal: controller.signal
  });
  const scoreText = await scoreResponse.text();
  let scoreData = {};
  try { scoreData = JSON.parse(scoreText); } catch {}
  if (!scoreResponse.ok) throw new Error(scoreData?.error || scoreText || `Score HTTP ${scoreResponse.status}`);
  console.log(JSON.stringify({ mode: 'incremental', quarter_slot: quarterSlot, ingest, processed: Number(scoreData.processed || 0) }));
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
} finally {
  clearTimeout(timer);
}
