import { getSupabaseAdmin, json } from './_lib.js';

export default async function handler(req, res) {
  try {
    const token = req.query?.token || '';
    const expected = process.env.CRON_TOKEN || '';

    if (!expected || token !== expected) {
      return json(res, 401, {
        error: 'Yetkisiz istek',
        finished_at: new Date().toISOString()
      });
    }

    const supabase = getSupabaseAdmin();

    const { data: runRow, error: runInsertError } = await supabase
      .from('pipeline_runs')
      .insert({
        status: 'running',
        ingested_count: 0,
        processed_count: 0
      })
      .select()
      .single();

    if (runInsertError) {
      return json(res, 500, {
        error: runInsertError.message,
        finished_at: new Date().toISOString()
      });
    }

    const baseUrl = `https://${req.headers.host}`;

    const ingestResp = await fetch(`${baseUrl}/api/ingest?token=${encodeURIComponent(token)}`);
    const ingestJson = await ingestResp.json();

    if (!ingestResp.ok) {
      await supabase
        .from('pipeline_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          notes: JSON.stringify(ingestJson)
        })
        .eq('id', runRow.id);

      return json(res, 500, ingestJson);
    }

    const scoreResp = await fetch(`${baseUrl}/api/score?token=${encodeURIComponent(token)}`);
    const scoreJson = await scoreResp.json();

    if (!scoreResp.ok) {
      await supabase
        .from('pipeline_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          notes: JSON.stringify(scoreJson),
          ingested_count: Number(ingestJson.ingested || 0)
        })
        .eq('id', runRow.id);

      return json(res, 500, scoreJson);
    }

    const finishedAt = new Date().toISOString();

    await supabase
      .from('pipeline_runs')
      .update({
        status: 'completed',
        finished_at: finishedAt,
        ingested_count: Number(ingestJson.ingested || 0),
        processed_count: Number(scoreJson.processed || 0)
      })
      .eq('id', runRow.id);

    return json(res, 200, {
      ok: true,
      ingested: Number(ingestJson.ingested || 0),
      processed: Number(scoreJson.processed || 0),
      finished_at: finishedAt
    });
  } catch (error) {
    return json(res, 500, {
      error: error?.message || String(error),
      finished_at: new Date().toISOString()
    });
  }
}
