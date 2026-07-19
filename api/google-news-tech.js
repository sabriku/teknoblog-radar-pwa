import trendOverviewHandler from './trend-overview.js';

export default async function handler(req, res) {
  req.query = { ...(req.query || {}), google_news: '1' };
  return trendOverviewHandler(req, res);
}
