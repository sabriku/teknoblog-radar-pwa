const baseUrl = process.env.RADAR_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.CRON_TOKEN || '';
if (!token) throw new Error('CRON_TOKEN tanımlı değil.');

for (const action of ['maintenance', 'check_images']) {
  const response = await fetch(`${baseUrl}/api/intelligence?token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }), signal: AbortSignal.timeout(180000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${action} HTTP ${response.status}`);
  console.log(JSON.stringify({ action, ...data }));
}

const authResponse = await fetch(`${baseUrl}/api/google-auth`, { signal: AbortSignal.timeout(15000) });
const auth = await authResponse.json().catch(() => ({}));
if (authResponse.ok && auth.connected) {
  const response = await fetch(`${baseUrl}/api/intelligence`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-token': token },
    body: JSON.stringify({ action: 'sync_gsc' }),
    signal: AbortSignal.timeout(180000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `sync_gsc HTTP ${response.status}`);
  console.log(JSON.stringify({ action: 'sync_gsc', ...data }));
} else {
  console.log(JSON.stringify({ action: 'sync_gsc', skipped: true, reason: 'Google Search Console bağlı değil.' }));
}
