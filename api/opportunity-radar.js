import { json, safeText, hashValue, queryLocal, databaseStatus } from './_lib.js';

const CACHE_MINUTES = 45;
const MAX_STALE_HOURS = 72;
const TARGET_STORES = [
  'MediaMarkt', 'Teknosa', 'Hepsiburada', 'Amazon.com.tr',
  'Samsung Shop', 'Huawei Online Mağaza'
];

const CIMRI_PAGES = [
  ['MediaMarkt', 'https://www.cimri.com/mediamarkt-com-tr'],
  ['Teknosa', 'https://www.cimri.com/teknosa'],
  ['Hepsiburada', 'https://www.cimri.com/hepsiburada'],
  ['Amazon.com.tr', 'https://www.cimri.com/amazon-com-tr']
];

const EPEY_PAGES = [
  ['MediaMarkt', 'https://www.epey.com/site/media-markt/'],
  ['Teknosa', 'https://www.epey.com/site/teknosa/'],
  ['Hepsiburada', 'https://www.epey.com/site/hepsiburada/'],
  ['Amazon.com.tr', 'https://www.epey.com/site/amazon/'],
  ['Samsung Shop', 'https://www.epey.com/site/samsung/'],
  ['Huawei Online Mağaza', 'https://www.epey.com/site/huawei/']
];

const AKAKCE_STORE_PAGES = [
  ['MediaMarkt', 'https://www.akakce.com/magaza/mediamarkt'],
  ['Hepsiburada', 'https://www.akakce.com/magaza/hepsiburada'],
  ['Amazon.com.tr', 'https://www.akakce.com/magaza/amazon'],
  ['Samsung Shop', 'https://www.akakce.com/magaza/samsung'],
  ['Huawei Online Mağaza', 'https://www.akakce.com/magaza/huawei']
];

const AKAKCE_QUERIES = [
  'iphone', 'samsung galaxy', 'huawei', 'laptop', 'tablet',
  'akıllı saat', 'kulaklık', 'oled televizyon', 'playstation', 'ssd'
];

const TECH_WORDS = /iphone|ipad|macbook|samsung|galaxy|xiaomi|huawei|honor|oppo|vivo|pixel|telefon|tablet|laptop|notebook|bilgisayar|monitör|monitor|kulaklık|earbuds|airpods|watch|akıllı saat|televizyon|\btv\b|oled|qled|ssd|ram|router|modem|playstation|xbox|nintendo|kamera|yazıcı|printer|projektör|projector|drone|robot süpürge/i;
const NOISE_WORDS = /kılıf|kilif|cam koruyucu|şarj kablosu|sarj kablosu|adaptör|adapter|askı|stand|çanta|canta|temizlik|yedek parça|oyuncak|bebek|kozmetik|deterjan|kitap|buzdolabı|çamaşır|bulaşık|derin dondurucu|kahve makinesi|klima|süpürge/i;
const COLOR_WORDS = /\b(siyah|beyaz|mavi|lacivert|pembe|yeşil|gri|mor|kırmızı|sarı|bej|altın|silver|black|white|blue|green|gray|grey|gold|ultramarine|deniz mavisi|laciverttaş)\b/gi;
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 TeknoblogRadar/2.0',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'tr-TR,tr;q=0.9,en;q=0.6'
};

let scanPromise = null;
let lastScanStarted = 0;

function decodeHtml(value = '') {
  return safeText(String(value || '')
    .replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&').replace(/\\u002f/gi, '/')
    .replace(/&quot;|&#x27;|&#39;|&apos;/gi, (m) => ({ '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&apos;': "'" }[m.toLowerCase()] || m)));
}

function decodeHtmlMarkup(value = '') {
  return String(value || '')
    .replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>').replace(/\\u0026/gi, '&').replace(/\\u002f/gi, '/')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ');
}

function absoluteUrl(value = '', base = '') {
  try { return new URL(decodeHtml(value), base).toString(); } catch { return base; }
}

function cleanTitle(value = '') {
  return decodeHtml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function productKey(title = '') {
  return cleanTitle(title).toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(COLOR_WORDS, ' ')
    .replace(/\b(apple|akıllı telefon|cep telefonu|turkiye garantili|türkiye garantili|distributor garantili|distribütör garantili|gb ram|5g)\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 120);
}

function categoryFor(title = '') {
  const text = cleanTitle(title).toLocaleLowerCase('tr-TR');
  if (/iphone|galaxy|telefon|pixel|xiaomi|huawei pura|huawei nova/.test(text)) return 'Telefon';
  if (/macbook|laptop|notebook|bilgisayar/.test(text)) return 'Bilgisayar';
  if (/ipad|tablet/.test(text)) return 'Tablet';
  if (/watch|akıllı saat/.test(text)) return 'Akıllı Saat';
  if (/kulaklık|earbuds|airpods|buds/.test(text)) return 'Kulaklık';
  if (/televizyon|\btv\b|oled|qled/.test(text)) return 'TV';
  if (/playstation|xbox|nintendo|konsol/.test(text)) return 'Oyun';
  if (/ssd|monitör|monitor|router|modem|kamera|yazıcı|projektör/.test(text)) return 'Donanım';
  return 'Diğer';
}

function validTechnology(title = '', price = 0) {
  const text = cleanTitle(title);
  return text.length >= 8 && Number(price) >= 500 && TECH_WORDS.test(text) && !NOISE_WORDS.test(text);
}

function parsePrice(value = '') {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value || '').replace(/\s/g, '').replace(/TL|TRY|₺/gi, '');
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)) return Number(text.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(text.replace(',', '.')) || 0;
}

async function fetchHtml(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: HEADERS });
    const html = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return html;
  } finally { clearTimeout(timer); }
}

function imageMapFromHtml(html = '') {
  const map = new Map();
  const re = /<img[^>]+(?:src|srcSet)=["']([^"']+)["'][^>]+alt=["']([^"']+)["']|<img[^>]+alt=["']([^"']+)["'][^>]+(?:src|srcSet)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(re)) {
    const url = (match[1] || match[4] || '').split(/\s+\d+x/)[0];
    const title = match[2] || match[3] || '';
    if (url && title) map.set(productKey(title), absoluteUrl(url, 'https://www.cimri.com'));
  }
  return map;
}

function closestImage(images, title) {
  const key = productKey(title);
  if (images.has(key)) return images.get(key);
  const tokens = new Set(key.split('-').filter((v) => v.length > 1));
  let best = ['', 0];
  for (const [candidate, url] of images) {
    const other = candidate.split('-');
    const hit = other.filter((v) => tokens.has(v)).length / Math.max(tokens.size, other.length, 1);
    if (hit > best[1]) best = [url, hit];
  }
  return best[1] >= 0.62 ? best[0] : '';
}

function parseCimriStore(html, expectedStore, pageUrl) {
  const items = [];
  const images = imageMapFromHtml(html);
  const objectRe = /\{"id":\d+,"imageId":\d+,"price":[\d.]+,"productId":\d+,"productTitle":"(?:\\.|[^"\\])*","productDetailUrl":"(?:\\.|[^"\\])*"[\s\S]*?"merchant":\{[\s\S]*?\}[\s\S]*?"offerHolder":"(?:\\.|[^"\\])*"\}/g;
  for (const match of html.matchAll(objectRe)) {
    try {
      const row = JSON.parse(match[0]);
      const title = cleanTitle(row.productTitle);
      const price = parsePrice(row.price);
      if (!validTechnology(title, price)) continue;
      const store = expectedStore;
      const comparisonUrl = absoluteUrl(row.productDetailUrl, 'https://www.cimri.com');
      const oldPrice = parsePrice(row.originalPrice) > price ? parsePrice(row.originalPrice) : 0;
      items.push({
        product_name: title, product_key: productKey(title), category: categoryFor(title), store_name: store,
        comparison_source: 'Cimri', price, old_price: oldPrice, product_url: comparisonUrl,
        comparison_url: comparisonUrl || pageUrl, image_url: closestImage(images, title),
        raw_payload: { product_id: row.productId, merchant_count: row.merchantCount || 0 }
      });
    } catch {}
  }
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.product_key}|${item.price}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function parseEpeyStore(html, store, pageUrl) {
  const clean = decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const items = [];
  const re = /(?:Telefon|Laptop|Tablet|Kulaklık|Akıllı Saat|Televizyon|Monitör)\s+(.{8,190}?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*TL/gi;
  for (const match of clean.matchAll(re)) {
    const title = cleanTitle(match[1]);
    const price = parsePrice(match[2]);
    if (!validTechnology(title, price)) continue;
    items.push({
      product_name: title, product_key: productKey(title), category: categoryFor(title), store_name: store,
      comparison_source: 'Epey', price, old_price: 0, product_url: pageUrl, comparison_url: pageUrl,
      image_url: '', raw_payload: { epey_store_page: true }
    });
  }
  const seen = new Set();
  return items.filter((item) => !seen.has(item.product_key) && seen.add(item.product_key)).slice(0, 40);
}

function parseAkakceBenchmarks(html, pageUrl) {
  const decoded = decodeHtmlMarkup(html);
  const results = [];
  for (const match of decoded.matchAll(/<li[^>]+data-pr=["']?\d+["']?[^>]*>([\s\S]{0,2200}?)<\/li>/gi)) {
    const block = match[1];
    const title = cleanTitle(block.match(/title=["']([^"']{8,220})["']/i)?.[1] || block.match(/alt=["']([^"']{8,220})["']/i)?.[1] || '');
    const href = block.match(/href=["']?([^"' >]+)/i)?.[1] || '';
    const priceText = block.match(/class=["']pt_v8["'][^>]*>[\s\S]{0,30}?(\d{1,3}(?:\.\d{3})*)\s*<i[^>]*>[\s\S]{0,30}?,?[\s\S]{0,20}?(\d{2})[\s\S]{0,20}?TL/i);
    const price = priceText ? parsePrice(`${priceText[1]},${priceText[2]}`) : 0;
    if (!validTechnology(title, price)) continue;
    const image = block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '';
    results.push({ product_key: productKey(title), product_name: title, price, url: absoluteUrl(href, pageUrl), image_url: absoluteUrl(image, 'https://www.akakce.com'), source_url: pageUrl });
  }
  return results;
}

function similarity(a = '', b = '') {
  const left = new Set(a.split('-').filter((v) => v.length > 1));
  const right = new Set(b.split('-').filter((v) => v.length > 1));
  if (!left.size || !right.size) return 0;
  const hit = [...left].filter((v) => right.has(v)).length;
  return hit / Math.max(left.size, right.size);
}

function attachBenchmarks(offers, benchmarks) {
  return offers.map((offer) => {
    let best = null; let score = 0;
    for (const benchmark of benchmarks) {
      const next = similarity(offer.product_key, benchmark.product_key);
      if (next > score) { score = next; best = benchmark; }
    }
    return { ...offer, market_lowest_price: score >= 0.72 ? best.price : 0, benchmark_url: score >= 0.72 ? best.url : '' };
  });
}

async function recordRun(source, started, offers, error = '') {
  try {
    await queryLocal(`INSERT INTO opportunity_scan_runs (source_name,status,offer_count,duration_ms,error_message)
      VALUES ($1,$2,$3,$4,$5)`, [source, error ? 'error' : 'ok', offers, Date.now() - started, error || null]);
  } catch {}
}

async function scanSource(name, fn) {
  const started = Date.now();
  try {
    const items = await fn();
    await recordRun(name, started, items.length);
    return { source: name, status: 'ok', items, count: items.length, duration_ms: Date.now() - started };
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Zaman aşımı' : (error?.message || String(error));
    await recordRun(name, started, 0, message);
    return { source: name, status: 'error', items: [], count: 0, duration_ms: Date.now() - started, error: message };
  }
}

async function persistOffers(offers) {
  const checkedAt = new Date().toISOString();
  for (const offer of offers) {
    const offerKey = hashValue(`${offer.product_key}|${offer.store_name}|${offer.comparison_source}`);
    await queryLocal(`INSERT INTO opportunity_offers
      (offer_key,product_key,product_name,category,store_name,comparison_source,price,old_price,market_lowest_price,product_url,comparison_url,image_url,checked_at,last_seen_at,raw_payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14::jsonb)
      ON CONFLICT (offer_key) DO UPDATE SET product_name=EXCLUDED.product_name,category=EXCLUDED.category,
      price=EXCLUDED.price,old_price=EXCLUDED.old_price,market_lowest_price=EXCLUDED.market_lowest_price,
      product_url=EXCLUDED.product_url,comparison_url=EXCLUDED.comparison_url,
      image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),opportunity_offers.image_url),
      checked_at=EXCLUDED.checked_at,last_seen_at=EXCLUDED.last_seen_at,raw_payload=EXCLUDED.raw_payload`, [
        offerKey, offer.product_key, offer.product_name, offer.category, offer.store_name, offer.comparison_source,
        offer.price, offer.old_price || null, offer.market_lowest_price || null, offer.product_url,
        offer.comparison_url, offer.image_url || null, checkedAt, JSON.stringify({ ...offer.raw_payload, benchmark_url: offer.benchmark_url || null })
      ]);
  }
  return checkedAt;
}

async function performScan() {
  const cimri = await Promise.all(CIMRI_PAGES.map(([store, url]) => scanSource(`Cimri · ${store}`, async () => parseCimriStore(await fetchHtml(url), store, url))));
  const epey = await Promise.all(EPEY_PAGES.map(([store, url]) => scanSource(`Epey · ${store}`, async () => parseEpeyStore(await fetchHtml(url), store, url))));
  const akakce = await Promise.all(AKAKCE_QUERIES.map((query) => {
    const url = `https://www.akakce.com/arama/?q=${encodeURIComponent(query)}`;
    return scanSource(`Akakçe · ${query}`, async () => parseAkakceBenchmarks(await fetchHtml(url), url));
  }));
  const akakceStores = await Promise.all(AKAKCE_STORE_PAGES.map(([store, url]) => scanSource(`Akakçe · ${store}`, async () => {
    const rows = parseAkakceBenchmarks(await fetchHtml(url), url);
    return rows.map((row) => ({
      product_name: row.product_name, product_key: row.product_key, category: categoryFor(row.product_name),
      store_name: store, comparison_source: 'Akakçe', price: row.price, old_price: 0,
      product_url: row.url || url, comparison_url: url, image_url: row.image_url || '',
      raw_payload: { akakce_store_page: true }
    }));
  })));
  const benchmarks = akakce.flatMap((result) => result.items);
  const offers = attachBenchmarks([...cimri, ...epey, ...akakceStores].flatMap((result) => result.items), benchmarks);
  const checkedAt = offers.length ? await persistOffers(offers) : new Date().toISOString();
  return { checked_at: checkedAt, sources: [...cimri, ...epey, ...akakceStores, ...akakce].map(({ items, ...result }) => result), found: offers.length };
}

async function maybeScan(force = false) {
  if (scanPromise) return scanPromise;
  const cooldown = Date.now() - lastScanStarted < 5 * 60 * 1000;
  if (force && cooldown) force = false;
  let fresh = false;
  try {
    const result = await queryLocal(`SELECT MAX(checked_at) AS checked_at FROM opportunity_offers`);
    const last = new Date(result.rows[0]?.checked_at || 0).getTime();
    fresh = last > Date.now() - CACHE_MINUTES * 60 * 1000;
  } catch {}
  if (!force && fresh) return null;
  lastScanStarted = Date.now();
  scanPromise = performScan().finally(() => { scanPromise = null; });
  return scanPromise;
}

function scoreOffer(item, alternatives) {
  let score = 42;
  const old = Number(item.old_price || 0);
  const price = Number(item.price || 0);
  const market = Number(item.market_lowest_price || 0);
  const discount = old > price ? Math.round((old - price) / old * 100) : 0;
  if (discount >= 20) score += 24; else if (discount >= 10) score += 14; else if (discount >= 5) score += 7;
  if (market && price <= market * 1.02) score += 18;
  if (alternatives > 1) score += 6;
  if (/iphone|galaxy|macbook|ipad|playstation|oled|huawei watch/i.test(item.product_name)) score += 7;
  return Math.min(96, score);
}

async function responseData(limit = 36) {
  const result = await queryLocal(`SELECT * FROM opportunity_offers
    WHERE last_seen_at >= NOW() - ($1::text || ' hours')::interval
    ORDER BY last_seen_at DESC, price ASC LIMIT 300`, [MAX_STALE_HOURS]);
  const rows = result.rows || [];
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.product_key)) groups.set(row.product_key, []);
    groups.get(row.product_key).push(row);
  }
  const items = [];
  for (const sourceRows of groups.values()) {
    const byStore = new Map();
    for (const row of sourceRows) {
      const current = byStore.get(row.store_name);
      if (!current || Number(row.price) < Number(current.price)) byStore.set(row.store_name, row);
    }
    const alternatives = [...byStore.values()];
    alternatives.sort((a, b) => Number(a.price) - Number(b.price));
    const best = alternatives[0];
    const old = Number(best.old_price || 0);
    const price = Number(best.price || 0);
    const score = scoreOffer(best, alternatives.length);
    const firstSeen = new Date(best.first_seen_at || 0).getTime();
    items.push({
      id: best.offer_key, product_key: best.product_key, title: best.product_name, category: best.category,
      store: best.store_name, comparison_source: best.comparison_source, sale_price: price,
      list_price: old, discount_rate: old > price ? Math.round((old - price) / old * 100) : 0,
      market_lowest_price: Number(best.market_lowest_price || 0), is_lowest: true,
      url: best.product_url, comparison_url: best.comparison_url, image_url: best.image_url || '',
      first_seen_at: best.first_seen_at, checked_at: best.checked_at,
      is_new: firstSeen > Date.now() - 8 * 60 * 60 * 1000, score,
      guidance: score >= 76 ? 'Haberleştir' : score >= 60 ? 'Takip et' : 'Fiyatı doğrula',
      alternatives: alternatives.slice(0, 4).map((alt) => ({ store: alt.store_name, price: Number(alt.price), url: alt.product_url }))
    });
  }
  items.sort((a, b) => Number(b.is_new) - Number(a.is_new) || b.score - a.score || a.sale_price - b.sale_price);

  const storeSummary = TARGET_STORES.map((store) => {
    const offers = rows.filter((row) => row.store_name === store);
    return { store, product_count: offers.length, status: offers.length ? 'Güncel fiyat var' : 'Kaynak bekleniyor', checked_at: offers[0]?.checked_at || null };
  });
  const scanRows = await queryLocal(`SELECT DISTINCT ON (source_name) source_name,status,offer_count,duration_ms,error_message,created_at
    FROM opportunity_scan_runs ORDER BY source_name,created_at DESC`);
  return {
    items: items.slice(0, limit), count: Math.min(items.length, limit), total_products: items.length,
    store_summary: storeSummary, source_status: scanRows.rows || [], checked_stores: TARGET_STORES,
    refreshed_at: rows[0]?.checked_at || null, cache: true, database: databaseStatus()
  };
}

export default async function handler(req, res) {
  try {
    const limit = Math.min(60, Math.max(6, Number(req.query?.limit || 36)));
    const force = String(req.query?.refresh || '') === '1';
    const scan = await maybeScan(force);
    const data = await responseData(limit);
    return json(res, 200, { ...data, scan: scan ? { found: scan.found, checked_at: scan.checked_at } : null });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), items: [], store_summary: TARGET_STORES.map((store) => ({ store, product_count: 0, status: 'Kullanılamıyor' })) });
  }
}
