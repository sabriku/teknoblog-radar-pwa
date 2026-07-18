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
