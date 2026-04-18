import { getSupabaseAdmin, json, nowIso } from './_lib.js';

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('sources').select('id', { count: 'exact', head: true });

    if (error) {
      return json(res, 500, {
        status: 'error',
        message: error.message,
        now: nowIso()
      });
    }

    return json(res, 200, {
      status: 'ok',
      database: 'ok',
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
