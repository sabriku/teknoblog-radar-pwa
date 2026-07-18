const baseUrl = process.env.RADAR_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.CRON_TOKEN || '';
if (!token) throw new Error('CRON_TOKEN tanımlı değil.');

async function get(pathname, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, { cache: 'no-store', signal: controller.signal });
    const text = await response.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}
    if (!response.ok) throw new Error(data?.error || text || `HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

const encoded = encodeURIComponent(token);
let sourceOffset = 0;
let ingested = 0;
let updated = 0;
let sourceBatches = 0;
for (; sourceBatches < 12; sourceBatches += 1) {
  const result = await get(`/api/ingest?token=${encoded}&source_limit=4&source_offset=${sourceOffset}&item_limit=20`);
  ingested += Number(result.ingested || 0);
  updated += Number(result.updated || 0);
  if (!result.has_more) break;
  sourceOffset += 4;
}

let scoreOffset = 0;
let processed = 0;
let scoreBatches = 0;
for (; scoreBatches < 30; scoreBatches += 1) {
  const result = await get(`/api/score-batch?token=${encoded}&offset=${scoreOffset}&limit=120`);
  processed += Number(result.processed || 0);
  if (!result.has_more || result.stopped_early) break;
  scoreOffset += 120;
}

console.log(JSON.stringify({ ok: true, ingested, updated, processed, source_batches: sourceBatches + 1, score_batches: scoreBatches + 1 }));
