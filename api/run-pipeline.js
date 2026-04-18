const { json, sb, CRON_TOKEN } = require('./_lib');

async function callAbsolute(req, path) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const response = await fetch(`${proto}://${host}${path}`);
  return response.json();
}

module.exports = async (req, res) => {
  try {
    const token = req.query.token;
    if (!CRON_TOKEN || token !== CRON_TOKEN) {
      return json(res, 401, { error: 'Yetkisiz istek' });
    }

    const run = await sb('pipeline_runs', { method: 'POST', body: JSON.stringify({ status: 'running' }) }, true);
    const runId = run?.[0]?.id;
    const ingest = await callAbsolute(req, '/api/ingest');
    const score = await callAbsolute(req, '/api/score');
    await sb(`pipeline_runs?id=eq.${runId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        finished_at: new Date().toISOString(),
        ingested_count: ingest.ingested || 0,
        processed_count: score.processed || 0,
        status: 'completed'
      })
    }, true);

    return json(res, 200, {
      ok: true,
      ingested: ingest.ingested || 0,
      processed: score.processed || 0,
      finished_at: new Date().toISOString()
    });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
