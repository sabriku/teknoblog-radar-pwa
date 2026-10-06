import { timingSafeEqual } from 'node:crypto';
import { json, withLocalTransaction } from './_lib.js';

function authorized(req) {
  const expected = Buffer.from(String(process.env.CRON_TOKEN || ''));
  const provided = Buffer.from(String(req.headers?.['x-cron-token'] || ''));
  return expected.length > 0 && expected.length === provided.length && timingSafeEqual(expected, provided);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!authorized(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    const input = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(input.action || '');
    const ownerId = String(input.owner_id || '');
    if (!/^[a-f0-9-]{36}$/i.test(ownerId)) return json(res, 400, { error: 'Geçersiz iş kimliği' });

    if (action === 'status') {
      const result = await withLocalTransaction(async (query) => query(`SELECT EXISTS(
        SELECT 1 FROM pipeline_job_leases WHERE job_name='scheduled_refresh' AND expires_at>NOW()
      ) AS active`));
      return json(res, 200, { ready: true, active: Boolean(result.rows[0]?.active) });
    }

    if (action === 'begin') {
      const result = await withLocalTransaction(async (query) => {
        const lease = await query(`INSERT INTO pipeline_job_leases(job_name,owner_id,expires_at)
          VALUES('scheduled_refresh',$1,NOW()+INTERVAL '10 minutes')
          ON CONFLICT(job_name) DO UPDATE SET owner_id=EXCLUDED.owner_id,acquired_at=NOW(),expires_at=EXCLUDED.expires_at
          WHERE pipeline_job_leases.expires_at<NOW() RETURNING owner_id`, [ownerId]);
        if (!lease.rowCount) return { acquired: false };
        const run = await query(`INSERT INTO pipeline_runs(status,job_kind,run_key)
          VALUES('running','scheduled_refresh',$1) RETURNING id`, [ownerId]);
        return { acquired: true, run_id: run.rows[0].id };
      });
      return json(res, 200, result);
    }

    if (!['complete', 'fail'].includes(action)) return json(res, 400, { error: 'Geçersiz iş eylemi' });
    const runId = Number(input.run_id);
    if (!Number.isSafeInteger(runId) || runId < 1) return json(res, 400, { error: 'Geçersiz çalışma kaydı' });
    const notes = action === 'complete' ? JSON.stringify(input.notes || {}).slice(0, 2000)
      : String(input.error || 'Refresh failed').slice(0, 2000);
    const result = await withLocalTransaction(async (query) => {
      const updated = await query(`UPDATE pipeline_runs SET status=$3,finished_at=NOW(),
          ingested_count=$4,processed_count=$5,notes=$6
          WHERE id=$1 AND run_key=$2 AND job_kind='scheduled_refresh' AND status='running' RETURNING id`,
      [runId, ownerId, action === 'complete' ? 'completed' : 'failed',
        action === 'complete' ? Math.max(0, Number(input.ingested_count) || 0) : 0,
        action === 'complete' ? Math.max(0, Number(input.processed_count) || 0) : 0, notes]);
      if (!updated.rowCount) return { updated: false };
      await query(`DELETE FROM pipeline_job_leases WHERE job_name='scheduled_refresh' AND owner_id=$1`, [ownerId]);
      return { updated: true };
    });
    return json(res, result.updated ? 200 : 409, result);
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
