import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { initializeDatabase } from './api/_lib.js';

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);

const API_ROUTES = {
  '/api/access': './api/access.js',
  '/api/auth': './api/auth.js',
  '/api/google-news-tech': './api/google-news-tech.js',
  '/api/google-auth': './api/google-auth.js',
  '/api/google-auth/callback': './api/google-auth.js',
  '/api/google-trends': './api/google-trends.js',
  '/api/google-trends-categories': './api/google-trends-categories.js',
  '/api/health': './api/health.js',
  '/api/ingest': './api/ingest.js',
  '/api/instagram-radar': './api/instagram-radar.js',
  '/api/intelligence': './api/intelligence.js',
  '/api/opportunity-feed-radar': './api/opportunity-feed-radar.js',
  '/api/opportunity-radar': './api/opportunity-radar.js',
  '/api/push-to-slack': './api/push-to-slack.js',
  '/api/recommendations': './api/recommendations.js',
  '/api/run-pipeline': './api/run-pipeline.js',
  '/api/score': './api/score/index.js',
  '/api/score-batch': './api/score-batch.js',
  '/api/slack': './api/slack.js',
  '/api/source-bulk': './api/source-bulk.js',
  '/api/sources': './api/sources.js',
  '/api/teknoblog-latest': './api/teknoblog-latest.js',
  '/api/trend-clusters': './api/trend-clusters.js',
  '/api/trend-overview': './api/trend-overview.js',
  '/api/trends-ingest': './api/trends-ingest.js',
  '/api/trends-refresh': './api/trends-refresh.js',
  '/api/trends-sync': './api/trends-sync.js'
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function addCompat(res) {
  res.status = res.status || function status(code) { this.statusCode = code; return this; };
  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function safeJoin(base, target) {
  const resolved = path.normalize(path.join(base, target));
  return resolved.startsWith(base) ? resolved : null;
}

async function serveStatic(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = safeJoin(PUBLIC_DIR, requested);
  if (!filePath) { res.statusCode = 403; res.end('Forbidden'); return true; }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function handleApi(req, res, urlObj) {
  const modulePath = API_ROUTES[urlObj.pathname];
  if (!modulePath) return false;
  const mod = await import(modulePath);
  if (typeof mod.default !== 'function') throw new Error(`Invalid API handler: ${urlObj.pathname}`);
  req.query = Object.fromEntries(urlObj.searchParams.entries());
  const rawBody = await readBody(req);
  if (rawBody && String(req.headers['content-type'] || '').includes('application/json')) {
    try { req.body = JSON.parse(rawBody); } catch { req.body = rawBody; }
  } else req.body = rawBody || {};
  await mod.default(req, addCompat(res));
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (await handleApi(req, res, urlObj)) return;
    if (await serveStatic(res, urlObj.pathname)) return;
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error?.message || String(error) }));
  }
});

try {
  await initializeDatabase();
  console.log('Local PostgreSQL schema and source seed are ready.');
} catch (error) {
  console.error(`Local PostgreSQL startup check failed: ${error?.message || String(error)}`);
  process.exit(1);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Teknoblog Radar listening on http://127.0.0.1:${PORT}`);
});
