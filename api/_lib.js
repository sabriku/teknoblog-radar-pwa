import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

let pool = null;
let schemaReady = false;
let schemaPromise = null;
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
  const acceptLocal = (candidate) => {
    const parsed = new URL(candidate);
    if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) return '';
    return candidate;
  };
  try { return acceptLocal(text); } catch {
    // Passwords produced by `openssl rand -base64` may contain URL-reserved
    // characters. Repair the common unescaped connection-string form.
    const match = text.match(/^(postgres(?:ql)?:\/\/)([^:/@]+):(.+)@([^/]+)(\/[^?\s]*(?:\?[^\s]*)?)$/i);
    if (!match) return '';
    try {
      const user = encodeURIComponent(decodeURIComponent(match[2]));
      const password = encodeURIComponent(decodeURIComponent(match[3]));
      const repaired = `${match[1]}${user}:${password}@${match[4]}${match[5]}`;
      return acceptLocal(repaired);
    } catch { return ''; }
  }
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
    dbDisabledReason = 'Yerel PostgreSQL bağlantısı bulunamadı. RADAR_DATABASE_URL veya /root/radar_database_url.txt kontrol edilmeli.';
    return null;
  }
  if (!pool) {
    pool = new Pool({ connectionString, max: 8, idleTimeoutMillis: 30000, connectionTimeoutMillis: 6000 });
    pool.on('error', (error) => { dbDisabledReason = error?.message || String(error); });
  }
  return pool;
}

async function ensureSchema() {
  if (schemaReady) return true;
  const client = db();
  if (!client) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const schemaSql = fs.readFileSync(new URL('../sql/local_postgres.sql', import.meta.url), 'utf8');
      const seedSql = fs.readFileSync(new URL('../sql/local_seed.sql', import.meta.url), 'utf8');
      await client.query(schemaSql);
      await client.query(seedSql);
      schemaReady = true;
      dbDisabledReason = '';
      return true;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function initializeDatabase() {
  const ready = await ensureSchema();
  if (!ready) throw new Error(dbDisabledReason || 'Yerel PostgreSQL bağlantısı bulunamadı.');
  return true;
}

export async function queryLocal(text, params = []) {
  await initializeDatabase();
  return db().query(text, params);
}

export function databaseStatus() {
  return { configured: Boolean(databaseUrl()), ready: schemaReady, error: dbDisabledReason || null };
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
  pipeline_runs: [],
  trend_signals: [],
  trend_clusters: [],
  trend_news_links: [],
  editor_actions: [],
  source_blacklist_terms: []
};

const DATABASE_GENERATED_IDS = new Set(['pipeline_runs', 'trend_clusters', 'trend_news_links', 'editor_actions', 'source_blacklist_terms']);

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
  if (!next.id && !DATABASE_GENERATED_IDS.has(table)) next.id = idFor(table, next);
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
  pipeline_runs: ['id','started_at','finished_at','status','ingested_count','processed_count','notes','created_at'],
  trend_signals: ['id','signal_hash','source_type','source_name','market_scope','country_code','category','topic_text','normalized_topic','signal_score','time_window','detected_at','signal_payload','payload','created_at','updated_at'],
  trend_clusters: ['id','cluster_key','cluster_name','market_scope','country_code','source_count','signal_count','competitor_count','turkey_interest_score','early_signal_score','trend_score','discover_potential_score','seo_potential_score','affiliate_potential_score','recommendation_type','status','summary','first_seen_at','last_seen_at','created_at','updated_at'],
  trend_news_links: ['id','cluster_id','topic_candidate_id','raw_feed_item_id','candidate_url','candidate_title','source_name','match_score','created_at'],
  editor_actions: ['id','candidate_id','action_type','payload','created_at'],
  source_blacklist_terms: ['id','term','is_active','created_at']
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
  constructor(table) { this.table = table; this.action = 'select'; this.columns = '*'; this.filters = []; this.orders = []; this.rowLimit = null; this.rowOffset = 0; this.payload = null; this.returning = false; this.singleRow = false; this.maybeSingleRow = false; this.countMode = null; this.headOnly = false; this.conflictColumns = null; }
  select(columns = '*', options = {}) { this.columns = columns || '*'; this.returning = this.action !== 'select'; this.countMode = options?.count || null; this.headOnly = Boolean(options?.head); return this; }
  insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
  upsert(payload, options = {}) { this.action = 'upsert'; this.payload = payload; this.conflictColumns = options?.onConflict || null; return this; }
  update(payload) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  eq(column, value) { this.filters.push({ type: 'eq', column, value }); return this; }
  gte(column, value) { this.filters.push({ type: 'gte', column, value }); return this; }
  in(column, values = []) { this.filters.push({ type: 'in', column, values }); return this; }
  or(raw = '') { this.filters.push({ type: 'or', raw }); return this; }
  order(column, options = {}) { this.orders.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value) { this.rowLimit = Math.max(0, Number(value) || 0); return this; }
  range(from, to) { this.rowOffset = Math.max(0, Number(from) || 0); this.rowLimit = Math.max(0, (Number(to) || 0) - this.rowOffset + 1); return this; }
  single() { this.singleRow = true; return this; }
  maybeSingle() { this.maybeSingleRow = true; return this; }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
  async execute() {
    try {
      const ready = await ensureSchema();
      if (!ready) return { data: (this.singleRow || this.maybeSingleRow) ? null : [], error: { message: dbDisabledReason || 'Yerel PostgreSQL bağlantısı bulunamadı.' }, count: null };
      if (this.action === 'insert' || this.action === 'upsert') return this.execInsert();
      if (this.action === 'update') return this.execUpdate();
      if (this.action === 'delete') return this.execDelete();
      return this.execSelect();
    } catch (error) {
      dbDisabledReason = error?.message || String(error);
      return { data: (this.singleRow || this.maybeSingleRow) ? null : [], error: { message: dbDisabledReason }, count: null };
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
    if (this.headOnly) {
      const result = await db().query(`SELECT COUNT(*)::int AS count FROM ${this.table}${where.sql}`, where.params);
      return { data: null, error: null, count: Number(result.rows[0]?.count || 0) };
    }
    const orderSql = this.orders.length ? ` ORDER BY ${this.orders.map((o) => `${safeCol(this.table, o.column)} ${o.ascending ? 'ASC' : 'DESC'} NULLS LAST`).join(',')}` : '';
    const limitSql = this.rowLimit ? ` LIMIT ${Number(this.rowLimit)}` : '';
    const offsetSql = this.rowOffset ? ` OFFSET ${Number(this.rowOffset)}` : '';
    const result = await db().query(`SELECT ${this.selectedColumns()} FROM ${this.table}${where.sql}${orderSql}${limitSql}${offsetSql}`, where.params);
    const data = (this.singleRow || this.maybeSingleRow) ? (result.rows[0] || null) : result.rows;
    let count = null;
    if (this.countMode) {
      const countResult = await db().query(`SELECT COUNT(*)::int AS count FROM ${this.table}${where.sql}`, where.params);
      count = Number(countResult.rows[0]?.count || 0);
    }
    return { data, error: null, count };
  }
  async execInsert() {
    const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => normalizeRow(this.table, row || {}));
    const inserted = [];
    for (const row of rows) {
      const cols = Object.keys(row).filter((c) => COLS[this.table]?.includes(c));
      const vals = cols.map((c) => row[c]);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
      if (this.table === 'raw_feed_items') {
        const first = await db().query(
          `INSERT INTO raw_feed_items(${cols.join(',')}) VALUES(${placeholders}) ON CONFLICT DO NOTHING RETURNING *`,
          vals
        );
        if (first.rows[0]) {
          inserted.push(first.rows[0]);
          continue;
        }
        const existing = await db().query(`SELECT id FROM raw_feed_items
          WHERE ($1::text IS NOT NULL AND id=$1)
             OR ($2::text IS NOT NULL AND content_hash=$2)
             OR ($3::text IS NOT NULL AND url_hash=$3)
          ORDER BY created_at DESC LIMIT 1`, [row.id || null, row.content_hash || null, row.url_hash || null]);
        if (!existing.rows[0]) throw new Error('Çakışan RSS kaydı bulunamadı.');
        const mutable = cols.filter((c) => !['id', 'created_at', 'updated_at'].includes(c));
        const updateValues = mutable.map((c) => row[c]);
        const updateSql = mutable.map((c, index) => {
          if (['image_url', 'thumbnail', 'image', 'summary', 'description', 'excerpt'].includes(c)) {
            return `${c}=COALESCE(NULLIF($${index + 1}::text,''),${c})`;
          }
          if (c === 'published_at') return `${c}=COALESCE($${index + 1},${c})`;
          return `${c}=$${index + 1}`;
        }).join(',');
        const updated = await db().query(`UPDATE raw_feed_items SET ${updateSql},updated_at=NOW()
          WHERE id=$${updateValues.length + 1} RETURNING *`, [...updateValues, existing.rows[0].id]);
        inserted.push(updated.rows[0]);
        continue;
      }
      if (this.table === 'topic_candidates') {
        const first = await db().query(
          `INSERT INTO topic_candidates(${cols.join(',')}) VALUES(${placeholders}) ON CONFLICT DO NOTHING RETURNING *`,
          vals
        );
        if (first.rows[0]) {
          inserted.push(first.rows[0]);
          continue;
        }
        const existing = await db().query(`SELECT id FROM topic_candidates
          WHERE ($1::text IS NOT NULL AND id=$1)
             OR ($2::text IS NOT NULL AND candidate_hash=$2)
             OR ($3::text IS NOT NULL AND raw_feed_item_id=$3)
          ORDER BY created_at DESC LIMIT 1`, [row.id || null, row.candidate_hash || null, row.raw_feed_item_id || null]);
        if (!existing.rows[0]) throw new Error('Çakışan aday kaydı bulunamadı.');
        const mutable = cols.filter((c) => !['id', 'created_at', 'updated_at'].includes(c));
        const updateValues = mutable.map((c) => row[c]);
        const updateSql = mutable.map((c, index) => `${c}=$${index + 1}`).join(',');
        const updated = await db().query(`UPDATE topic_candidates SET ${updateSql},updated_at=NOW()
          WHERE id=$${updateValues.length + 1} RETURNING *`, [...updateValues, existing.rows[0].id]);
        inserted.push(updated.rows[0]);
        continue;
      }
      const updates = cols.filter((c) => c !== 'id').map((c) => `${c}=EXCLUDED.${c}`).join(',');
      const inferredConflict = this.table === 'raw_feed_items' && row.content_hash ? 'content_hash' : this.table === 'raw_feed_items' && row.url_hash ? 'url_hash' : this.table === 'topic_candidates' && row.candidate_hash ? 'candidate_hash' : this.table === 'trend_signals' && row.signal_hash ? 'signal_hash' : this.table === 'trend_clusters' && row.cluster_key ? 'cluster_key' : row.id ? 'id' : '';
      const conflict = String(this.conflictColumns || inferredConflict || '').split(',').map((c) => c.trim()).filter(Boolean).map((c) => safeCol(this.table, c)).join(',');
      const conflictSql = conflict ? ` ON CONFLICT(${conflict}) DO UPDATE SET ${updates || `${safeCol(this.table, 'id')}=EXCLUDED.${safeCol(this.table, 'id')}`}` : '';
      const sql = `INSERT INTO ${this.table}(${cols.join(',')}) VALUES(${placeholders})${conflictSql} RETURNING *`;
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
    const touchUpdated = COLS[this.table].includes('updated_at') && !cols.includes('updated_at') ? ', updated_at=NOW()' : '';
    const result = await db().query(`UPDATE ${this.table} SET ${set}${touchUpdated}${where.sql} RETURNING *`, [...vals, ...where.params]);
    return { data: (this.singleRow || this.maybeSingleRow) ? (result.rows[0] || null) : result.rows, error: null };
  }
  async execDelete() {
    const where = this.whereParts(1);
    const result = await db().query(`DELETE FROM ${this.table}${where.sql} RETURNING *`, where.params);
    return { data: (this.singleRow || this.maybeSingleRow) ? (result.rows[0] || null) : result.rows, error: null };
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
      if (this.rowOffset) rows = rows.slice(this.rowOffset);
      if (this.rowLimit) rows = rows.slice(0, this.rowLimit);
      const data = rows.map((row) => selectColumns(row, this.columns, this.table));
      return { data: (this.singleRow || this.maybeSingleRow) ? (data[0] || null) : data, error: null, count: this.countMode ? rows.length : null };
    }
    if (this.action === 'insert' || this.action === 'upsert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => {
        const normalized = normalizeRow(this.table, row || {});
        if (!normalized.id) normalized.id = idFor(this.table, normalized);
        return { created_at: now(), updated_at: now(), ...normalized };
      });
      const inserted = [];
      for (const row of rows) {
        const key = this.table === 'raw_feed_items' && row.content_hash ? 'content_hash' : this.table === 'raw_feed_items' && row.url_hash ? 'url_hash' : this.table === 'topic_candidates' && row.candidate_hash ? 'candidate_hash' : 'id';
        const index = tableRows.findIndex((item) => String(item[key] || '') === String(row[key] || ''));
        if (index >= 0) tableRows[index] = { ...tableRows[index], ...row, updated_at: now() };
        else tableRows.push(row);
        inserted.push(index >= 0 ? tableRows[index] : row);
      }
      return { data: (this.singleRow || this.maybeSingleRow) ? (inserted[0] || null) : inserted, error: null };
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
      return { data: (this.singleRow || this.maybeSingleRow) ? (changed[0] || null) : changed, error: null };
    }
    if (this.action === 'delete') {
      const kept = []; const deleted = [];
      for (const row of tableRows) memoryMatches(row, this.filters) ? deleted.push(row) : kept.push(row);
      memory[this.table] = kept;
      return { data: (this.singleRow || this.maybeSingleRow) ? (deleted[0] || null) : deleted, error: null };
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
