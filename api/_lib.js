import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

let pool = null;
let schemaReady = false;
let dbDisabledReason = '';

function readFileIfPossible(path) {
  try { return fs.readFileSync(path, 'utf8').trim(); } catch { return ''; }
}

export function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function extractPostgresUrl(value = '') {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/^export\s+/i, '').trim();
  const envMatch = text.match(/(?:RADAR_DATABASE_URL|DATABASE_URL)\s*=\s*['"]?([^'"\n\r]+)['"]?/i);
  if (envMatch) text = envMatch[1].trim();
  const urlMatch = text.match(/postgres(?:ql)?:\/\/[^\s'"`]+/i);
  if (urlMatch) text = urlMatch[0].trim();
  text = text.replace(/^['"]|['"]$/g, '').trim();
  if (!/^postgres(?:ql)?:\/\//i.test(text)) return '';
  try { new URL(text); return text; } catch { return ''; }
}

function databaseUrl() {
  const candidates = [
    process.env.RADAR_DATABASE_URL,
    readFileIfPossible('/var/www/teknoblog-radar/.database_url'),
    readFileIfPossible('/root/radar_database_url.txt'),
    process.env.DATABASE_URL
  ];
  for (const candidate of candidates) {
    const parsed = extractPostgresUrl(candidate);
    if (parsed) return parsed;
  }
  return '';
}

function db() {
  const connectionString = databaseUrl();
  if (!connectionString) {
    dbDisabledReason = 'Yerel PostgreSQL bağlantısı bulunamadı; geçici bellek uyumluluk katmanı kullanılıyor.';
    return null;
  }
  if (!pool) pool = new Pool({ connectionString, max: 8, idleTimeoutMillis: 30000, connectionTimeoutMillis: 6000 });
  return pool;
}

async function ensureSchema() {
  if (schemaReady) return true;
  const client = db();
  if (!client) return false;
  await client.query(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      feed_url TEXT,
      rss_url TEXT,
      site_url TEXT,
      description TEXT,
      source_type TEXT DEFAULT 'news',
      market_relevance TEXT DEFAULT 'global',
      priority_weight INTEGER DEFAULT 50,
      trust_score INTEGER DEFAULT 70,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS raw_feed_items (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      source_name TEXT,
      source_url TEXT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      canonical_url TEXT,
      link TEXT,
      summary TEXT,
      description TEXT,
      excerpt TEXT,
      image_url TEXT,
      thumbnail TEXT,
      image TEXT,
      published_at TIMESTAMPTZ,
      content_hash TEXT UNIQUE,
      url_hash TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS topic_candidates (
      id TEXT PRIMARY KEY,
      raw_feed_item_id TEXT,
      source_id TEXT,
      source_name TEXT,
      title TEXT NOT NULL,
      item_title TEXT,
      feed_title TEXT,
      summary TEXT,
      description TEXT,
      excerpt TEXT,
      url TEXT NOT NULL,
      canonical_url TEXT,
      link TEXT,
      image_url TEXT,
      thumbnail TEXT,
      image TEXT,
      candidate_hash TEXT UNIQUE,
      content_type_hint TEXT,
      total_score INTEGER DEFAULT 0,
      traffic_score INTEGER DEFAULT 0,
      conversion_score INTEGER DEFAULT 0,
      discover_score INTEGER DEFAULT 0,
      social_score INTEGER DEFAULT 0,
      editorial_score INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS trend_signals (
      id TEXT PRIMARY KEY,
      source_name TEXT,
      topic_text TEXT NOT NULL,
      normalized_topic TEXT,
      country_code TEXT,
      category TEXT,
      signal_score INTEGER DEFAULT 0,
      detected_at TIMESTAMPTZ DEFAULT NOW(),
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sources_priority ON sources(priority_weight DESC, name ASC);
    CREATE INDEX IF NOT EXISTS idx_raw_items_created ON raw_feed_items(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_raw_items_published ON raw_feed_items(published_at DESC NULLS LAST);
    CREATE INDEX IF NOT EXISTS idx_candidates_status_created ON topic_candidates(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_candidates_status_published ON topic_candidates(status, published_at DESC NULLS LAST);
    CREATE INDEX IF NOT EXISTS idx_trend_signals_detected ON trend_signals(detected_at DESC);
  `);
  schemaReady = true;
  return true;
}

export function hashValue(value) { return createHash('sha1').update(String(value)).digest('hex'); }

function now() { return new Date().toISOString(); }

function fallbackSource(id, name, rss, site, priority = 70, type = 'news', market = 'global') {
  return { id, name, feed_url: rss, rss_url: rss, site_url: site, source_type: type, market_relevance: market, priority_weight: priority, trust_score: 75, is_active: true, created_at: now(), updated_at: now() };
}

const DEFAULT_MEMORY_SOURCES = [
  fallbackSource('teknoblog', 'Teknoblog', 'https://www.teknoblog.com/feed/', 'https://www.teknoblog.com', 100, 'owned', 'local'),
  fallbackSource('log', 'LOG', 'https://www.log.com.tr/feed/', 'https://www.log.com.tr', 90, 'competitor', 'local'),
  fallbackSource('shiftdelete', 'ShiftDelete.Net', 'https://shiftdelete.net/feed', 'https://shiftdelete.net', 86, 'competitor', 'local'),
  fallbackSource('donanimhaber', 'DonanımHaber', 'https://www.donanimhaber.com/rss/tum/', 'https://www.donanimhaber.com', 84, 'competitor', 'local'),
  fallbackSource('webtekno', 'Webtekno', 'https://www.webtekno.com/rss.xml', 'https://www.webtekno.com', 78, 'competitor', 'local'),
  fallbackSource('webrazzi', 'Webrazzi', 'https://webrazzi.com/feed/', 'https://webrazzi.com', 74, 'news', 'local'),
  fallbackSource('the-verge', 'The Verge', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com', 88),
  fallbackSource('engadget', 'Engadget', 'https://www.engadget.com/rss.xml', 'https://www.engadget.com', 86),
  fallbackSource('techcrunch', 'TechCrunch', 'https://techcrunch.com/feed/', 'https://techcrunch.com', 82),
  fallbackSource('ars-technica', 'Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'https://arstechnica.com', 80),
  fallbackSource('9to5mac', '9to5Mac', 'https://9to5mac.com/feed/', 'https://9to5mac.com', 79),
  fallbackSource('android-police', 'Android Police', 'https://www.androidpolice.com/feed/', 'https://www.androidpolice.com', 77),
  fallbackSource('bleepingcomputer', 'BleepingComputer', 'https://www.bleepingcomputer.com/feed/', 'https://www.bleepingcomputer.com', 76),
  fallbackSource('windows-central', 'Windows Central', 'https://www.windowscentral.com/rss', 'https://www.windowscentral.com', 72),
  fallbackSource('macrumors', 'MacRumors', 'https://www.macrumors.com/macrumors.xml', 'https://www.macrumors.com', 72)
];

const memory = {
  sources: [...DEFAULT_MEMORY_SOURCES],
  raw_feed_items: [],
  topic_candidates: [],
  trend_signals: []
};

function idFor(table, row = {}) {
  if (row.id) return String(row.id);
  const seed = row.candidate_hash || row.content_hash || row.url_hash || row.url || row.link || row.rss_url || row.feed_url || row.title || `${table}:${Date.now()}:${Math.random()}`;
  return hashValue(`${table}:${seed}`);
}

function normalizeOptionalUrl(value = '') {
  const text = String(value || '').trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (/^\/\//.test(text)) return `https:${text}`;
  return '';
}

function normalizeRow(table, row = {}) {
  const next = { ...row };
  if (!next.id) next.id = idFor(table, next);
  if (table === 'sources') {
    next.rss_url = normalizeOptionalUrl(next.rss_url || next.feed_url);
    next.feed_url = normalizeOptionalUrl(next.feed_url || next.rss_url);
    next.site_url = normalizeOptionalUrl(next.site_url);
    if (next.priority_weight != null) next.priority_weight = Number(next.priority_weight) || 0;
    if (next.trust_score != null) next.trust_score = Number(next.trust_score) || 0;
    if (next.is_active == null) next.is_active = true;
  }
  if ((table === 'raw_feed_items' || table === 'topic_candidates') && next.published_at === '') next.published_at = null;
  if (table === 'raw_feed_items') {
    if (!next.canonical_url && next.url) next.canonical_url = next.url;
    if (!next.link && next.url) next.link = next.url;
    if (!next.url_hash && next.url) next.url_hash = hashValue(next.url);
    if (!next.content_hash) next.content_hash = hashValue(`${next.title || ''}|${next.url || ''}`);
  }
  if (table === 'topic_candidates') {
    if (!next.candidate_hash) next.candidate_hash = hashValue(`${next.title || ''}|${next.url || ''}`);
    if (!next.canonical_url && next.url) next.canonical_url = next.url;
    if (!next.link && next.url) next.link = next.url;
    if (!next.status) next.status = 'active';
  }
  return next;
}

const COLS = {
  sources: ['id','name','feed_url','rss_url','site_url','description','source_type','market_relevance','priority_weight','trust_score','is_active','created_at','updated_at'],
  raw_feed_items: ['id','source_id','source_name','source_url','title','url','canonical_url','link','summary','description','excerpt','image_url','thumbnail','image','published_at','content_hash','url_hash','created_at','updated_at'],
  topic_candidates: ['id','raw_feed_item_id','source_id','source_name','title','item_title','feed_title','summary','description','excerpt','url','canonical_url','link','image_url','thumbnail','image','candidate_hash','content_type_hint','total_score','traffic_score','conversion_score','discover_score','social_score','editorial_score','status','published_at','created_at','updated_at'],
  trend_signals: ['id','source_name','topic_text','normalized_topic','country_code','category','signal_score','detected_at','payload','created_at','updated_at']
};

function safeCol(table, col) {
  const clean = String(col || '').trim();
  if (!COLS[table]?.includes(clean)) throw new Error(`Unsupported column ${table}.${clean}`);
  return clean;
}

function valueTime(value) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? time : 0; }

function memoryMatches(row, filters = []) {
  for (const f of filters) {
    if (f.type === 'eq' && String(row[f.column] ?? '') !== String(f.value ?? '')) return false;
    if (f.type === 'gte' && valueTime(row[f.column]) < valueTime(f.value)) return false;
    if (f.type === 'in' && !Array.isArray(f.values) || (f.type === 'in' && !f.values.map(String).includes(String(row[f.column] ?? '')))) return false;
    if (f.type === 'or') {
      const ok = String(f.raw || '').split(',').some((expr) => {
        const match = expr.trim().match(/^([a-zA-Z0-9_]+)\.gte\.(.+)$/);
        return match ? valueTime(row[match[1]]) >= valueTime(match[2]) : false;
      });
      if (!ok) return false;
    }
  }
  return true;
}

function selectColumns(row, columns, table) {
  if (!columns || columns === '*') return { ...row };
  const out = {};
  for (const col of String(columns).split(',').map((c) => c.trim()).filter(Boolean)) out[safeCol(table, col)] = row[col];
  return out;
}

class PgQueryBuilder {
  constructor(table) { this.table = table; this.action = 'select'; this.columns = '*'; this.filters = []; this.orders = []; this.rowLimit = null; this.payload = null; this.returning = false; this.singleRow = false; }
  select(columns = '*') { this.columns = columns || '*'; this.returning = this.action !== 'select'; return this; }
  insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
  update(payload) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  eq(column, value) { this.filters.push({ type: 'eq', column, value }); return this; }
  gte(column, value) { this.filters.push({ type: 'gte', column, value }); return this; }
  in(column, values = []) { this.filters.push({ type: 'in', column, values }); return this; }
  or(raw = '') { this.filters.push({ type: 'or', raw }); return this; }
  order(column, options = {}) { this.orders.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value) { this.rowLimit = Math.max(0, Number(value) || 0); return this; }
  single() { this.singleRow = true; return this; }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
  async execute() {
    try {
      const ready = await ensureSchema();
      if (!ready) return this.execMemory();
      if (this.action === 'insert') return this.execInsert();
      if (this.action === 'update') return this.execUpdate();
      if (this.action === 'delete') return this.execDelete();
      return this.execSelect();
    } catch (error) {
      dbDisabledReason = error?.message || String(error);
      return this.execMemory();
    }
  }
  selectedColumns() {
    if (!this.columns || this.columns === '*') return '*';
    return String(this.columns).split(',').map((c) => safeCol(this.table, c.trim())).join(',');
  }
  whereParts(startIndex = 1) {
    const params = [];
    const parts = [];
    const add = (value) => { params.push(value); return `$${startIndex + params.length - 1}`; };
    for (const f of this.filters) {
      if (f.type === 'eq') parts.push(`${safeCol(this.table, f.column)} = ${add(f.value)}`);
      if (f.type === 'gte') parts.push(`${safeCol(this.table, f.column)} >= ${add(f.value)}`);
      if (f.type === 'in') parts.push(`${safeCol(this.table, f.column)} = ANY(${add(f.values)})`);
      if (f.type === 'or') {
        const ors = String(f.raw || '').split(',').map((expr) => expr.trim()).map((expr) => {
          const match = expr.match(/^([a-zA-Z0-9_]+)\.gte\.(.+)$/);
          if (!match) return '';
          return `${safeCol(this.table, match[1])} >= ${add(match[2])}`;
        }).filter(Boolean);
        if (ors.length) parts.push(`(${ors.join(' OR ')})`);
      }
    }
    return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
  }
  async execSelect() {
    const where = this.whereParts(1);
    const orderSql = this.orders.length ? ` ORDER BY ${this.orders.map((o) => `${safeCol(this.table, o.column)} ${o.ascending ? 'ASC' : 'DESC'} NULLS LAST`).join(',')}` : '';
    const limitSql = this.rowLimit ? ` LIMIT ${Number(this.rowLimit)}` : '';
    const result = await db().query(`SELECT ${this.selectedColumns()} FROM ${this.table}${where.sql}${orderSql}${limitSql}`, where.params);
    const data = this.singleRow ? (result.rows[0] || null) : result.rows;
    return { data, error: null };
  }
  async execInsert() {
    const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => normalizeRow(this.table, row || {}));
    const inserted = [];
    for (const row of rows) {
      const cols = Object.keys(row).filter((c) => COLS[this.table]?.includes(c));
      const vals = cols.map((c) => row[c]);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
      const updates = cols.filter((c) => c !== 'id').map((c) => `${c}=EXCLUDED.${c}`).join(',');
      const conflict = this.table === 'raw_feed_items' && row.content_hash ? 'content_hash' : this.table === 'raw_feed_items' && row.url_hash ? 'url_hash' : this.table === 'topic_candidates' && row.candidate_hash ? 'candidate_hash' : 'id';
      const sql = `INSERT INTO ${this.table}(${cols.join(',')}) VALUES(${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updates || 'updated_at=NOW()'} RETURNING *`;
      const result = await db().query(sql, vals);
      inserted.push(result.rows[0]);
    }
    const data = this.singleRow ? (inserted[0] || null) : inserted;
    return { data, error: null };
  }
  async execUpdate() {
    const row = normalizeRow(this.table, this.payload || {});
    const cols = Object.keys(row).filter((c) => c !== 'id' && COLS[this.table]?.includes(c));
    if (!cols.length) return { data: this.singleRow ? null : [], error: null };
    const vals = cols.map((c) => row[c]);
    const set = cols.map((c, i) => `${c}=$${i + 1}`).join(',');
    const where = this.whereParts(vals.length + 1);
    const result = await db().query(`UPDATE ${this.table} SET ${set}, updated_at=NOW()${where.sql} RETURNING *`, [...vals, ...where.params]);
    return { data: this.singleRow ? (result.rows[0] || null) : result.rows, error: null };
  }
  async execDelete() {
    const where = this.whereParts(1);
    const result = await db().query(`DELETE FROM ${this.table}${where.sql} RETURNING *`, where.params);
    return { data: this.singleRow ? (result.rows[0] || null) : result.rows, error: null };
  }
  async execMemory() {
    const tableRows = memory[this.table] || [];
    if (this.action === 'select') {
      let rows = tableRows.filter((row) => memoryMatches(row, this.filters));
      for (const order of [...this.orders].reverse()) {
        rows = rows.sort((a, b) => {
          const av = a[order.column]; const bv = b[order.column];
          const diff = typeof av === 'number' || typeof bv === 'number' ? Number(av || 0) - Number(bv || 0) : valueTime(av) - valueTime(bv) || String(av || '').localeCompare(String(bv || ''), 'tr');
          return order.ascending ? diff : -diff;
        });
      }
      if (this.rowLimit) rows = rows.slice(0, this.rowLimit);
      const data = rows.map((row) => selectColumns(row, this.columns, this.table));
      return { data: this.singleRow ? (data[0] || null) : data, error: null };
    }
    if (this.action === 'insert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({ created_at: now(), updated_at: now(), ...normalizeRow(this.table, row || {}) }));
      const inserted = [];
      for (const row of rows) {
        const key = this.table === 'raw_feed_items' && row.content_hash ? 'content_hash' : this.table === 'raw_feed_items' && row.url_hash ? 'url_hash' : this.table === 'topic_candidates' && row.candidate_hash ? 'candidate_hash' : 'id';
        const index = tableRows.findIndex((item) => String(item[key] || '') === String(row[key] || ''));
        if (index >= 0) tableRows[index] = { ...tableRows[index], ...row, updated_at: now() };
        else tableRows.push(row);
        inserted.push(index >= 0 ? tableRows[index] : row);
      }
      return { data: this.singleRow ? (inserted[0] || null) : inserted, error: null };
    }
    if (this.action === 'update') {
      const patch = normalizeRow(this.table, this.payload || {});
      const changed = [];
      for (let i = 0; i < tableRows.length; i += 1) {
        if (memoryMatches(tableRows[i], this.filters)) {
          tableRows[i] = { ...tableRows[i], ...patch, updated_at: now() };
          changed.push(tableRows[i]);
        }
      }
      return { data: this.singleRow ? (changed[0] || null) : changed, error: null };
    }
    if (this.action === 'delete') {
      const kept = []; const deleted = [];
      for (const row of tableRows) memoryMatches(row, this.filters) ? deleted.push(row) : kept.push(row);
      memory[this.table] = kept;
      return { data: this.singleRow ? (deleted[0] || null) : deleted, error: null };
    }
    return { data: this.singleRow ? null : [], error: null };
  }
}

export function getSupabaseAdmin() {
  return { from(table) { if (!COLS[table]) throw new Error(`Unsupported table: ${table}`); return new PgQueryBuilder(table); } };
}

export function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export function nowIso() { return new Date().toISOString(); }

function decodeHtml(value = '') {
  return String(value).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&lsquo;/g, '‘').replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
}

export function safeText(value) {
  if (value == null) return '';
  return decodeHtml(String(value).replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function chooseFeedUrl(source = {}) { return normalizeOptionalUrl(source.rss_url || source.feed_url || ''); }

function firstMatch(pattern, text = '') { const match = String(text || '').match(pattern); return match ? (match[1] || '').trim() : ''; }
function firstSrcFromSrcset(value = '') { const first = String(value).split(',')[0] || ''; return (first.trim().split(/\s+/)[0] || '').trim(); }
function normalizeImageUrl(url = '') { const clean = decodeHtml(url).trim(); if (!clean) return ''; if (/^https?:\/\//i.test(clean)) return clean; if (/^\/\//.test(clean)) return `https:${clean}`; return clean; }
function extractImage(block = '') {
  const candidates = [firstMatch(/<media:content[^>]*url=["']([^"']+)["']/i, block), firstMatch(/<media:thumbnail[^>]*url=["']([^"']+)["']/i, block), firstMatch(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']*["']/i, block), firstMatch(/<enclosure[^>]*url=["']([^"']+)["'][^>]*medium=["']image["']/i, block), firstMatch(/<itunes:image[^>]*href=["']([^"']+)["']/i, block), firstMatch(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i, block), firstMatch(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i, block), firstMatch(/<img[^>]*data-lazy-src=["']([^"']+)["']/i, block), firstMatch(/<img[^>]*data-src=["']([^"']+)["']/i, block), firstSrcFromSrcset(firstMatch(/<img[^>]*srcset=["']([^"']+)["']/i, block)), firstMatch(/<img[^>]*src=["']([^"']+)["']/i, block)];
  for (const candidate of candidates) { const normalized = normalizeImageUrl(candidate); if (normalized) return normalized; }
  return '';
}

function parseRssItems(xml = '') {
  const items = [];
  const matches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of matches) {
    const title = safeText(firstMatch(/<title>([\s\S]*?)<\/title>/i, block));
    const url = decodeHtml(firstMatch(/<link>([\s\S]*?)<\/link>/i, block) || firstMatch(/<guid[^>]*>([\s\S]*?)<\/guid>/i, block));
    const summaryRaw = firstMatch(/<description>([\s\S]*?)<\/description>/i, block) || firstMatch(/<content:encoded>([\s\S]*?)<\/content:encoded>/i, block);
    const published_at = firstMatch(/<pubDate>([\s\S]*?)<\/pubDate>/i, block) || firstMatch(/<dc:date>([\s\S]*?)<\/dc:date>/i, block);
    const image_url = extractImage(block) || extractImage(summaryRaw);
    const summary = safeText(summaryRaw);
    if (title && url) items.push({ title, url, summary, published_at, image_url });
  }
  return items;
}

function parseAtomEntries(xml = '') {
  const items = [];
  const matches = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const block of matches) {
    const title = safeText(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, block));
    const url = decodeHtml(firstMatch(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i, block) || firstMatch(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i, block) || firstMatch(/<id>([\s\S]*?)<\/id>/i, block));
    const summaryRaw = firstMatch(/<summary[^>]*>([\s\S]*?)<\/summary>/i, block) || firstMatch(/<content[^>]*>([\s\S]*?)<\/content>/i, block);
    const published_at = firstMatch(/<updated>([\s\S]*?)<\/updated>/i, block) || firstMatch(/<published>([\s\S]*?)<\/published>/i, block);
    const image_url = extractImage(block) || extractImage(summaryRaw);
    const summary = safeText(summaryRaw);
    if (title && url) items.push({ title, url, summary, published_at, image_url });
  }
  return items;
}

export function parseFeedItems(xml) {
  if (!xml || typeof xml !== 'string') return [];
  if (/<rss[\s>]/i.test(xml) || /<channel[\s>]/i.test(xml)) return parseRssItems(xml);
  if (/<feed[\s>]/i.test(xml)) return parseAtomEntries(xml);
  return parseRssItems(xml);
}
