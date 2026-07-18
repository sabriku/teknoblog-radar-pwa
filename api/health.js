import { databaseStatus, getSupabaseAdmin, initializeDatabase, json, nowIso } from './_lib.js';

export default async function handler(req, res) {
  try {
    await initializeDatabase();
    const database = getSupabaseAdmin();
    const [{ error, count: sourceCount }, { error: runError, count: pipelineRunCount }] = await Promise.all([
      database.from('sources').select('id', { count: 'exact', head: true }),
      database.from('pipeline_runs').select('id', { count: 'exact', head: true })
    ]);

    if (error || runError) {
      return json(res, 500, {
        status: 'error',
        database: 'local_postgresql',
        message: error?.message || runError?.message,
        now: nowIso()
      });
    }

    return json(res, 200, {
      status: 'ok',
      database: 'local_postgresql',
      database_status: databaseStatus(),
      counts: { sources: sourceCount, pipeline_runs: pipelineRunCount },
      now: nowIso()
    });
  } catch (error) {
    return json(res, 500, {
      status: 'error',
      message: error?.message || String(error),
      now: nowIso()
    });
  }
}
