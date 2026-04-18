const { json } = require('./_lib');
const ingest = require('./ingest');
const score = require('./score');

module.exports = async (req, res) => {
  const token = req.query.token;
  if (!process.env.CRON_TOKEN || token !== process.env.CRON_TOKEN) {
    return json(res, 401, { error: 'Yetkisiz istek' });
  }

  const fakeResA = makeCollector();
  await ingest(req, fakeResA);
  if (fakeResA.statusCode >= 400) return json(res, fakeResA.statusCode, fakeResA.payload);

  const fakeResB = makeCollector();
  await score(req, fakeResB);
  if (fakeResB.statusCode >= 400) return json(res, fakeResB.statusCode, fakeResB.payload);

  return json(res, 200, {
    ok: true,
    ingested: fakeResA.payload.inserted || 0,
    processed: fakeResB.payload.processed || 0,
    finished_at: new Date().toISOString()
  });
};

function makeCollector() {
  return {
    statusCode: 200,
    payload: null,
    setHeader() {},
    end(body) {
      try { this.payload = JSON.parse(body); } catch { this.payload = { raw: body }; }
    }
  };
}
