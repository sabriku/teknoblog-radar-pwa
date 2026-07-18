const baseUrl = process.env.RADAR_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.CRON_TOKEN || '';

if (!token) throw new Error('CRON_TOKEN tanımlı değil.');

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);

try {
  const response = await fetch(
    `${baseUrl}/api/run-pipeline?token=${encodeURIComponent(token)}`,
    { cache: 'no-store', signal: controller.signal }
  );
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}

  if (!response.ok) {
    throw new Error(data?.error || data?.body || text || `HTTP ${response.status}`);
  }

  console.log(JSON.stringify(data));
  for (const action of ['sync_teknoblog', 'run_alerts', 'sync_gsc']) {
    try {
      const followup = await fetch(`${baseUrl}/api/intelligence?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }), signal: controller.signal
      });
      const followupData = await followup.json().catch(() => ({}));
      console.log(JSON.stringify({ action, ok: followup.ok, ...followupData }));
    } catch (error) {
      console.log(JSON.stringify({ action, ok: false, skipped: true, error: error?.message || String(error) }));
    }
  }
} finally {
  clearTimeout(timer);
}
