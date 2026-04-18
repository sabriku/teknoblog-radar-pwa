import { getSupabaseAdmin, json, nowIso } from './_lib.js';

async function parseResponseSafe(response) {
  const text = await response.text();
  try {
    return { ok: true, data: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, data: null, raw: text };
  }
}

export default async function handler(req, res) {
  try {
    const token = req.query?.token || '';
    const expected = process.env.CRON_TOKEN || '';

    if (!expected || token !== expected) {
      return json(res, 401, {
        error: 'Yetkisiz istek',
        finished_at: nowIso()
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
        finished_at: nowIso()
      });
    }

    const baseUrl = `https://${req.headers.host}`;

    const ingestResp = await fetch(`${baseUrl}/api/ingest?token=${encodeURIComponent(token)}`);
    const ingestParsed = await parseResponseSafe(ingestResp);

    if (!ingestResp.ok || !ingestParsed.ok) {
      await supabase
        .from('pipeline_runs')
        .update({
          status: 'failed',
          finished_at: nowIso(),
          notes: ingestParsed.raw?.slice(0, 4000) || 'Ingest failed'
        })
        .eq('id', runRow.id);

      return json(res, 500, {
        error: 'Ingest failed',
        status: ingestResp.status,
        body: ingestParsed.raw?.slice(0, 4000) || null,
        finished_at: nowIso()
      });
    }

    const ingestJson = ingestParsed.data;

    const scoreResp = await fetch(`${baseUrl}/api/score?token=${encodeURIComponent(token)}`);
    const scoreParsed = await parseResponseSafe(scoreResp);

    if (!scoreResp.ok || !scoreParsed.ok) {
      await supabase
        .from('pipeline_runs')
        .update({
          status: 'failed',
          finished_at: nowIso(),
          ingested_count: Number(ingestJson.ingested || 0),
          notes: scoreParsed.raw?.slice(0, 4000) || 'Score failed'
        })
        .eq('id', runRow.id);

      return json(res, 500, {
        error: 'Score failed',
        status: scoreResp.status,
        body: scoreParsed.raw?.slice(0, 4000) || null,
        finished_at: nowIso()
      });
    }

    const scoreJson = scoreParsed.data;
    const finishedAt = nowIso();

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
      finished_at: nowIso()
    });
  }
}
