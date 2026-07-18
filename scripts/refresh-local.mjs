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
} finally {
  clearTimeout(timer);
}
