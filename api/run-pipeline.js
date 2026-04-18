import { getSupabaseAdmin, json, nowIso } from './_lib.js';

async function parseResponseSafe(response) {
  const text = await response.text();
  try {
    return { ok: true, data: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, data: null, raw: text };
  }
}

function isAuthorized(req, expected) {
  if (!expected) return false;
  const token = req.query?.token || '';
  if (token && token === expected) return true;
  return Boolean(req.headers['x-vercel-cron']);
}

async function runIngestBatches(baseUrl, token) {
  let offset = 0;
  const sourceLimit = 4;
  let totalIngested = 0;
  let totalUpdated = 0;
  let batches = 0;

  while (batches < 10) {
    const ingestResp = await fetch(`${baseUrl}/api/ingest?token=${encodeURIComponent(token)}&source_limit=${sourceLimit}&source_offset=${offset}&item_limit=10`);
    const ingestParsed = await parseResponseSafe(ingestResp);

    if (!ingestResp.ok || !ingestParsed.ok) {
      return {
        ok: false,
        status: ingestResp.status,
        raw: ingestParsed.raw?.slice(0, 4000) || 'Ingest failed'
      };
    }

    const data = ingestParsed.data || {};
    totalIngested += Number(data.ingested || 0);
    totalUpdated += Number(data.updated || 0);
    batches += 1;

    if (!data.has_more || Number(data.processed_sources || 0) < sourceLimit) {
      break;
    }

    offset += sourceLimit;
  }

  return {
    ok: true,
    ingested: totalIngested,
    updated: totalUpdated,
    batches
  };
}

export default async function handler(req, res) {
  try {
    const expected = process.env.CRON_TOKEN || '';

    if (!isAuthorized(req, expected)) {
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
    const ingestResult = await runIngestBatches(baseUrl, expected);

    if (!ingestResult.ok) {
      await supabase
        .from('pipeline_runs')
        .update({
          status: 'failed',
          finished_at: nowIso(),
          notes: ingestResult.raw || 'Ingest failed'
        })
        .eq('id', runRow.id);

      return json(res, 500, {
        error: 'Ingest failed',
        status: ingestResult.status,
        body: ingestResult.raw || null,
        finished_at: nowIso()
      });
    }

    const scoreResp = await fetch(`${baseUrl}/api/score?token=${encodeURIComponent(expected)}`);
    const scoreParsed = await parseResponseSafe(scoreResp);

    if (!scoreResp.ok || !scoreParsed.ok) {
      await supabase
        .from('pipeline_runs')
        .update({
          status: 'failed',
          finished_at: nowIso(),
          ingested_count: Number(ingestResult.ingested || 0),
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

    const scoreJson = scoreParsed.data || {};
    const finishedAt = nowIso();

    await supabase
      .from('pipeline_runs')
      .update({
        status: 'completed',
        finished_at: finishedAt,
        ingested_count: Number(ingestResult.ingested || 0),
        processed_count: Number(scoreJson.processed || 0),
        notes: `batches:${Number(ingestResult.batches || 0)},updated:${Number(ingestResult.updated || 0)}`
      })
      .eq('id', runRow.id);

    return json(res, 200, {
      ok: true,
      ingested: Number(ingestResult.ingested || 0),
      updated: Number(ingestResult.updated || 0),
      processed: Number(scoreJson.processed || 0),
      batches: Number(ingestResult.batches || 0),
      finished_at: finishedAt
    });
  } catch (error) {
    return json(res, 500, {
      error: error?.message || String(error),
      finished_at: nowIso()
    });
  }
}
