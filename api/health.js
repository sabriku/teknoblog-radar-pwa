const { json, sb } = require('./_lib');

module.exports = async (req, res) => {
  try {
    await sb('sources?select=id&limit=1', { method: 'GET' }, true);
    return json(res, 200, { status: 'ok', database: 'ok', now: new Date().toISOString() });
  } catch (error) {
    return json(res, 500, { status: 'error', message: error.message });
  }
};
