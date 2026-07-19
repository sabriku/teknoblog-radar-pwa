import trendOverview from './trend-overview.js';

export default async function handler(req, res) {
  req.query = { ...(req.query || {}), google_trends: '1' };
  return trendOverview(req, res);
}
