const { json, getSupabase, nowIso } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('sources').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return json(res, 200, { status: 'ok', database: 'ok', now: nowIso() });
  } catch (error) {
    return json(res, 500, { status: 'error', message: error.message, now: nowIso() });
  }
};
