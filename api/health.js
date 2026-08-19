import { databaseStatus, initializeDatabase, json, nowIso, queryLocal } from './_lib.js';

export default async function handler(req, res) {
  try {
    await initializeDatabase();
    const counts = await queryLocal(`SELECT
      (SELECT COUNT(*)::int FROM sources) AS sources,
      (SELECT COUNT(*)::int FROM pipeline_runs) AS pipeline_runs`);
    const row = counts.rows[0] || {};

    return json(res, 200, {
      status: 'ok',
      database: 'local_postgresql',
      database_status: databaseStatus(),
      counts: { sources: Number(row.sources || 0), pipeline_runs: Number(row.pipeline_runs || 0) },
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
