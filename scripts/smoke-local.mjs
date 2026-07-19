const baseUrl = process.env.RADAR_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.CRON_TOKEN || '';

const checks = [
  ['/api/health', 200],
  ['/api/sources', 200],
  ['/api/recommendations?sort=discover_score', 200],
  ['/api/search?q=Samsung&period=30d&limit=6', 200],
  ['/api/intelligence?section=summary', 200],
  ['/api/intelligence?section=early-signals', 200],
  ['/api/intelligence?section=scoring-lab', 200],
  ['/api/intelligence?section=accuracy', 200],
  ['/api/intelligence?section=weekly-report', 200],
  ['/api/google-auth', 200],
  ['/api/trend-overview?window=24h&limit=5', 200],
  ['/api/push-to-slack', 200]
];

if (token && process.env.RADAR_SMOKE_MUTATIONS === '1') {
  checks.push([`/api/ingest?token=${encodeURIComponent(token)}&source_limit=1&item_limit=2`, 200]);
  checks.push([`/api/score-batch?token=${encodeURIComponent(token)}&limit=10&offset=0`, 200]);
}

let failed = 0;
for (const [pathname, expected] of checks) {
  const displayPath = pathname.replace(/([?&]token=)[^&]+/i, '$1[redacted]');
  try {
    const response = await fetch(`${baseUrl}${pathname}`, { headers: { accept: 'application/json' } });
    const text = await response.text();
    const ok = response.status === expected;
    console.log(`${ok ? 'OK' : 'FAIL'} ${response.status} ${displayPath} ${text.slice(0, 180).replace(/\s+/g, ' ')}`);
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`FAIL fetch ${displayPath}: ${error?.message || String(error)}`);
  }
}

if (failed) process.exit(1);
