const baseUrl = process.env.RADAR_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.CRON_TOKEN || '';
if (!token) throw new Error('CRON_TOKEN tanımlı değil.');

async function postIntelligence(action, options = {}) {
  const critical = options.critical !== false;
  const timeoutMs = Number(options.timeoutMs || 180000);
  const useHeaderToken = options.headerToken === true;
  const url = useHeaderToken
    ? `${baseUrl}/api/intelligence`
    : `${baseUrl}/api/intelligence?token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: useHeaderToken
        ? { 'content-type': 'application/json', 'x-cron-token': token }
        : { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `${action} HTTP ${response.status}`);
    console.log(JSON.stringify({ action, ...data }));
    return data;
  } catch (error) {
    const payload = {
      action,
      ok: false,
      skipped: !critical,
      error: error?.name === 'TimeoutError' ? `${action} zaman aşımına uğradı` : (error?.message || String(error))
    };
    console.log(JSON.stringify(payload));
    if (critical) throw error;
    return payload;
  }
}

await postIntelligence('maintenance', { critical: true, timeoutMs: 180000 });
await postIntelligence('check_images', { critical: true, timeoutMs: 180000 });

let auth = null;
try {
  const authResponse = await fetch(`${baseUrl}/api/google-auth`, { signal: AbortSignal.timeout(15000) });
  auth = await authResponse.json().catch(() => ({}));
  if (!authResponse.ok || !auth.connected) {
    console.log(JSON.stringify({ action: 'sync_gsc', skipped: true, reason: 'Google Search Console bağlı değil.' }));
  }
} catch (error) {
  console.log(JSON.stringify({ action: 'sync_gsc', skipped: true, error: error?.message || String(error) }));
}

if (auth?.connected) {
  await postIntelligence('sync_gsc', { critical: false, timeoutMs: 120000, headerToken: true });
  if (auth.analytics_configured) {
    await postIntelligence('sync_ga4', { critical: false, timeoutMs: 120000, headerToken: true });
  }
}
