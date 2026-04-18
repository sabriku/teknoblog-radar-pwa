const { json, getSupabase, nowIso } = require('./_lib');
const ingest = require('./ingest');
const score = require('./score');

function runHandler(handler, req) {
  return new Promise((resolve) => {
    let body = '';
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      end(chunk) { body += chunk || ''; resolve({ statusCode: this.statusCode, body }); },
    };
    Promise.resolve(handler(req, res)).catch((error) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: error.message }) });
    });
  });
}

module.exports = async (req, res) => {
  try {
    const token = req.query?.token || req.body?.token || req.headers['x-cron-token'];
    if (!token || token !== process.env.CRON_TOKEN) {
      return json(res, 401, { error: 'Yetkisiz istek' });
    }

    const supabase = await getSupabase();
    const { data: runRow } = await supabase
      .from('pipeline_runs')
      .insert({ status: 'running', notes: 'Pipeline started' })
      .select('id')
      .single();

    const ingestResult = await runHandler(ingest, { query: {}, body: {}, headers: {} });
    const ingestPayload = JSON.parse(ingestResult.body || '{}');
    const scoreResult = await runHandler(score, { query: {}, body: {}, headers: {} });
    const scorePayload = JSON.parse(scoreResult.body || '{}');

    await supabase
      .from('pipeline_runs')
      .update({
        status: 'finished',
        ingested_count: ingestPayload.ingested || 0,
        processed_count: scorePayload.processed || 0,
        notes: JSON.stringify({
          ingest_status: ingestResult.statusCode,
          score_status: scoreResult.statusCode,
          processed_sources: ingestPayload.processed_sources || 0,
        }),
        finished_at: nowIso(),
      })
      .eq('id', runRow?.id || 0);

    return json(res, 200, {
      ok: true,
      ingested: ingestPayload.ingested || 0,
      processed: scorePayload.processed || 0,
      finished_at: nowIso(),
      debug: ingestPayload.debug || [],
    });
  } catch (error) {
    return json(res, 500, { error: error.message, finished_at: nowIso() });
  }
};
