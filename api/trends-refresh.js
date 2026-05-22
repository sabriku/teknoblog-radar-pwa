import { json } from './_lib.js';
import trendsIngestHandler from './trends-ingest.js';
import trendClustersHandler from './trend-clusters.js';

function runInternalHandler(handler, query = {}) {
  return new Promise((resolve) => {
    const req = { query };
    const res = {
      statusCode: 200,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
        return this;
      },
      end(body = '') {
        let payload = body;
        try {
          payload = JSON.parse(String(body || '{}'));
        } catch {
          payload = { raw: String(body || '') };
        }
        resolve({ status: this.statusCode, payload });
      }
    };

    Promise.resolve(handler(req, res)).catch((error) => {
      resolve({
        status: 500,
        payload: { error: error?.message || String(error) }
      });
    });
  });
}

export default async function handler(req, res) {
  try {
    const token = process.env.CRON_TOKEN || '';
    if (!token) {
      return json(res, 500, { error: 'CRON_TOKEN tanımlı değil.' });
    }

    const ingest = await runInternalHandler(trendsIngestHandler, { token });
    if (ingest.status >= 400) {
      return json(res, ingest.status, {
        error: 'Google Trends yenileme başarısız oldu.',
        ingest: ingest.payload
      });
    }

    const clusters = await runInternalHandler(trendClustersHandler, { token });
    if (clusters.status >= 400) {
      return json(res, clusters.status, {
        error: 'Trend kümeleri yenilenemedi.',
        ingest: ingest.payload,
        clusters: clusters.payload
      });
    }

    return json(res, 200, {
      ok: true,
      refreshed_at: new Date().toISOString(),
      ingest: ingest.payload,
      clusters: clusters.payload
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
