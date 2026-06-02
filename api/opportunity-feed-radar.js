import { json, safeText, hashValue } from './_lib.js';

const FEEDS = [
  { store: 'Teknosa', url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6151&feedId=631&format=xml&utm=%3Fref%3Dgo%26utm_source%3Dgo%26pfx%3D%7Btransaction_id%7D%26utm_medium%3Daffiliate%26utm_campaign%3D%7Baff_id%7D%26utm_term%3D%7Btransaction_id%7D' },
  { store: 'MediaMarkt', url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6816&feedId=716&format=xml&utm=%3Futm_source%3Dgelirortaklari%26utm_medium%3Daffiliate%26utm_campaign%3D%7Baffiliate_name%7D%26pfx%3D%7Btransaction_id%7D%26utm_term%3D%7Btransaction_id%7D' },
  { store: 'Huawei', url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6747&feedId=91&format=xml&utm=%3Fcid%3D500888%26utm_medium%3Daffiliate%26utm_source%3Dgelirortaklari%26utm_campaign%3D%7Baffiliate_name%7D%26pfx%3D%7Btransaction_id%7D%26utm_term%3D%7Btransaction_id%7D' },
  { store: 'Huawei Akakçe', url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6747&feedId=44&format=xml&utm=%3Fcid%3D500888%26utm_medium%3D%7Baffiliate_name%7D%26utm_source%3Dgelirortaklari%26utm_term%3D%7Baff_id%7D%26pfx%3D%7Btransaction_id%7D%26utm_content%3D%7Btransaction_id%7D&publisher=akakce' },
  { store: 'Huawei Cimri', url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6747&feedId=664&format=xml&utm=%3Fcid%3D500888%26utm_source%3Dgelirortaklari%26utm_campaign%3D%7Baffiliate_name%7D%26utm_medium%3Daffiliate%26pfx%3D%7Btransaction_id%7D%26utm_term%3D%7Btransaction_id%7D' },
  { store: 'Huawei Avantajix', url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6747&feedId=667&format=xml&utm=%3Fcid%3D500888%26utm_source%3Dgelirortaklari%26utm_campaign%3D%7Baffiliate_name%7D%26utm_medium%3Daffiliate%26pfx%3D%7Btransaction_id%7D%26utm_term%3D%7Btransaction_id%7D' }
];

const SHOPPING_FALLBACKS = [
  { store: 'Amazon.com.tr', domain: 'amazon.com.tr', queries: ['site:amazon.com.tr iphone indirim', 'site:amazon.com.tr samsung galaxy indirim', 'site:amazon.com.tr laptop indirim', 'site:amazon.com.tr akıllı saat indirim', 'site:amazon.com.tr kulaklık indirim'] },
  { store: 'Hepsiburada', domain: 'hepsiburada.com', queries: ['site:hepsiburada.com iphone indirim', 'site:hepsiburada.com samsung galaxy indirim', 'site:hepsiburada.com laptop indirim', 'site:hepsiburada.com akıllı saat indirim', 'site:hepsiburada.com kulaklık indirim'] },
  { store: 'N11', domain: 'n11.com', queries: ['site:n11.com iphone indirim', 'site:n11.com samsung galaxy indirim', 'site:n11.com laptop indirim', 'site:n11.com akıllı saat indirim', 'site:n11.com kulaklık indirim'] }
];

const TECH_WORDS = /iphone|ipad|macbook|samsung|galaxy|xiaomi|huawei|honor|oppo|vivo|telefon|akıllı telefon|tablet|laptop|notebook|bilgisayar|monitör|monitor|kulaklık|earbuds|airpods|watch|akıllı saat|televizyon|tv|oled|qled|ssd|ram|router|modem|playstation|xbox|nintendo|kamera|printer|yazıcı|matebook|matepad|freebuds|band/i;
const NOISE_WORDS = /kılıf|kilif|cam koruyucu|şarj kablosu|sarj kablosu|adaptör|adapter|askı|stand|çanta|canta|temizlik|yedek parça|oyuncak|bebek|kozmetik|deterjan|kitap/i;
const MIN_DISCOUNT_RATE = 8;
const MIN_DISCOUNT_AMOUNT = 300;

function decodeXml(value = '') {
  return safeText(String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' '));
}

function tag(block = '', names = []) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match?.[1]) return decodeXml(match[1]);
  }
  return '';
}

function attr(block = '', names = []) {
  for (const name of names) {
    const match = block.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));
    if (match?.[1]) return decodeXml(match[1]);
  }
  return '';
}

function stripHtml(value = '') {
  return safeText(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '));
}

function price(value = '') {
  const raw = String(value || '');
  const match = raw.match(/\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{4,}(?:,\d{2})?/);
  const text = (match?.[0] || raw).replace(/[^0-9,\.]/g, '');
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) return Number(text.replace(/\./g, '').replace(',', '.')) || 0;
  if (text.includes(',')) return Number(text.replace(',', '.')) || 0;
  return Number(text) || 0;
}

function priceFromText(value = '') {
  const match = String(value || '').match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{4,})(?:\s*)?(?:TL|₺|TRY)/i);
  return match ? price(match[0]) : 0;
}

function discountRate(list = 0, sale = 0) {
  if (!list || !sale || list <= sale) return 0;
  return Math.round(((list - sale) / list) * 100);
}

function isRealDiscount(item = {}) {
  return Number(item.list_price || 0) > Number(item.sale_price || 0)
    && Number(item.discount_rate || 0) >= MIN_DISCOUNT_RATE
    && Number(item.discount_amount || 0) >= MIN_DISCOUNT_AMOUNT;
}

function guidance(score = 0) {
  if (score >= 72) return 'Mutlaka haberleştir';
  if (score >= 55) return 'Takip et';
  return 'Düşük öncelik';
}

function scoreItem(item = {}) {
  let score = 0;
  if (!isRealDiscount(item)) return 0;
  if (item.discount_rate >= 40) score += 42;
  else if (item.discount_rate >= 30) score += 34;
  else if (item.discount_rate >= 20) score += 26;
  else if (item.discount_rate >= 12) score += 18;
  else score += 10;

  if (item.discount_amount >= 10000) score += 18;
  else if (item.discount_amount >= 5000) score += 14;
  else if (item.discount_amount >= 1500) score += 10;
  else score += 5;

  if (item.sale_price >= 30000) score += 12;
  else if (item.sale_price >= 12000) score += 8;
  else if (item.sale_price >= 5000) score += 5;

  if (/iphone|galaxy|macbook|ipad|playstation|oled|qled|huawei watch|matebook|matepad|freebuds/i.test(item.title)) score += 14;
  if (/teknosa|mediamarkt/i.test(item.store)) score += 8;
  if (/huawei/i.test(item.store)) score += 5;
  return Math.max(0, Math.min(100, score));
}

function validProduct(item = {}) {
  const text = `${item.title || ''} ${item.category || ''} ${item.brand || ''} ${item.store || ''}`;
  if (!item.title || item.title.length < 6) return false;
  if (!item.sale_price || item.sale_price < 300) return false;
  if (!TECH_WORDS.test(text)) return false;
  if (NOISE_WORDS.test(text) && item.sale_price < 5000) return false;
  return true;
}

function validOpportunity(item = {}) {
  return validProduct(item) && isRealDiscount(item) && scoreItem(item) >= 40;
}

function googleSearchUrl(query = '') {
  return `https://www.google.com/search?tbm=shop&hl=tr&gl=TR&q=${encodeURIComponent(query)}`;
}

function itemBlocks(xml = '') {
  const patterns = [
    /<product\b[\s\S]*?<\/product>/gi,
    /<item\b[\s\S]*?<\/item>/gi,
    /<entry\b[\s\S]*?<\/entry>/gi,
    /<row\b[\s\S]*?<\/row>/gi
  ];
  for (const pattern of patterns) {
    const matches = xml.match(pattern) || [];
    if (matches.length) return matches;
  }
  return [];
}

function parseFeed(xml = '', feed = {}) {
  const products = [];
  const opportunities = [];

  for (const block of itemBlocks(xml)) {
    const title = tag(block, ['name', 'title', 'product_name', 'productName', 'urunadi', 'urunAdi']);
    const url = tag(block, ['url', 'link', 'product_url', 'productUrl', 'deeplink', 'affiliate_url', 'affiliateUrl']) || attr(block, ['href']);
    const image = tag(block, ['image', 'image_url', 'imageUrl', 'picture', 'thumbnail', 'thumbnail_url', 'img', 'g:image_link']) || attr(block, ['src']);
    const brand = tag(block, ['brand', 'manufacturer', 'marka']);
    const category = tag(block, ['category', 'category_name', 'categoryName', 'kategori']);
    const sale = price(tag(block, ['sale_price', 'salePrice', 'discounted_price', 'discountPrice', 'final_price', 'finalPrice', 'price', 'fiyat', 'g:sale_price', 'g:price']));
    const oldCandidates = [
      tag(block, ['old_price', 'oldPrice', 'list_price', 'listPrice', 'market_price', 'marketPrice', 'original_price', 'originalPrice', 'retail_price', 'retailPrice']),
      tag(block, ['g:price'])
    ].map(price).filter(Boolean);
    const list = Math.max(0, ...oldCandidates.filter((value) => value > sale));
    const rate = discountRate(list, sale);
    const item = {
      id: hashValue(`${feed.store}|${title}|${sale}|${url}`).slice(0, 16),
      store: feed.store,
      title,
      url,
      image_url: image,
      brand,
      category,
      sale_price: sale,
      list_price: list,
      discount_rate: rate,
      discount_amount: list > sale ? Math.round(list - sale) : 0,
      checked_at: new Date().toISOString(),
      feed_type: 'xml',
      reference_only: false
    };
    item.score = scoreItem(item);
    item.guidance = guidance(item.score);
    item.reason = isRealDiscount(item)
      ? `%${item.discount_rate} indirim, ${item.discount_amount.toLocaleString('tr-TR')} TL fiyat avantajı, ${feed.store} XML feed referansı`
      : `${feed.store} XML feed içinde ürün var, ancak gerçek indirim koşulu oluşmadı`;
    if (validProduct(item)) products.push(item);
    if (validOpportunity(item)) opportunities.push(item);
  }

  return { products: dedupe(products), opportunities: dedupe(opportunities) };
}

function dedupe(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.store}|${String(item.title || '').toLowerCase()}|${item.sale_price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0 (+https://www.teknoblog.com/)',
        accept,
        'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.5'
      }
    });
    clearTimeout(timer);
    if (!response.ok) return { ok: false, status: response.status, text: '' };
    return { ok: true, status: response.status, text: await response.text() };
  } catch (error) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: error?.message || String(error), text: '' };
  }
}

async function fetchFeed(feed = {}) {
  const started = Date.now();
  const response = await fetchText(feed.url, 'application/xml,text/xml,*/*;q=0.8', 18000);
  if (!response.ok) return { store: feed.store, products: [], items: [], debug: { store: feed.store, status: response.status, count: 0, product_count: 0, error: response.error, note: response.error || `HTTP ${response.status}`, ms: Date.now() - started, source_type: 'xml_feed' } };
  const parsed = parseFeed(response.text, feed);
  return {
    store: feed.store,
    products: parsed.products,
    items: parsed.opportunities,
    debug: {
      store: feed.store,
      status: response.status,
      count: parsed.opportunities.length,
      product_count: parsed.products.length,
      xml_length: response.text.length,
      note: parsed.opportunities.length ? 'Gerçek indirim fırsatı bulundu' : 'XML ürünleri alındı, gerçek indirim koşulu sağlayan fırsat bulunamadı',
      ms: Date.now() - started,
      source_type: 'xml_feed'
    }
  };
}

function parseShoppingHtml(html = '', fallback = {}) {
  const plain = stripHtml(html);
  const priceMatches = [...plain.matchAll(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{4,})(?:\s*)?(?:TL|₺|TRY)/gi)].slice(0, 30);
  const items = [];
  for (const match of priceMatches) {
    const idx = match.index || 0;
    const context = plain.slice(Math.max(0, idx - 600), Math.min(plain.length, idx + 600));
    if (!new RegExp(fallback.domain.replace('.', '\\.'), 'i').test(context)) continue;
    if (!/indirim|kampanya|fırsat|firsat|kupon|sepette|%/i.test(context)) continue;
    const sale = priceFromText(match[0]);
    const percent = Number((context.match(/%\s*(\d{1,2})/) || [])[1] || 0);
    if (!percent || percent < MIN_DISCOUNT_RATE) continue;
    const list = Math.round(sale / (1 - percent / 100));
    const title = safeText(context.replace(match[0], ' ').split(/\s+/).filter(Boolean).slice(0, 20).join(' ')).slice(0, 160);
    const item = {
      id: hashValue(`${fallback.store}|${title}|${sale}`).slice(0, 16),
      store: fallback.store,
      title,
      url: googleSearchUrl(`${fallback.store} ${title}`),
      image_url: '',
      brand: '',
      category: 'Google Alışveriş',
      sale_price: sale,
      list_price: list,
      discount_rate: percent,
      discount_amount: Math.max(0, list - sale),
      checked_at: new Date().toISOString(),
      feed_type: 'google_shopping_fallback',
      reference_only: true
    };
    item.score = scoreItem(item);
    item.guidance = guidance(item.score);
    item.reason = `%${percent} indirim sinyali, Google Alışveriş yedek referansı. Yayın öncesi mağaza fiyatı kontrol edilmeli`;
    if (validOpportunity(item)) items.push(item);
  }
  return dedupe(items).slice(0, 6);
}

async function fetchShoppingFallback(fallback = {}) {
  const started = Date.now();
  const items = [];
  const debug = [];
  for (const query of fallback.queries) {
    const response = await fetchText(googleSearchUrl(query), 'text/html,*/*;q=0.8', 12000);
    if (!response.ok) {
      debug.push({ store: fallback.store, status: response.status, error: response.error, count: 0, product_count: 0, note: response.error || `HTTP ${response.status}`, source_type: 'google_shopping_fallback' });
      continue;
    }
    const parsed = parseShoppingHtml(response.text, fallback);
    items.push(...parsed);
    debug.push({ store: fallback.store, status: response.status, count: parsed.length, product_count: parsed.length, note: parsed.length ? 'Google Alışveriş yedek indirim sinyali bulundu' : 'Google Alışveriş kontrol edildi, güvenilir indirim sinyali bulunamadı', html_length: response.text.length, source_type: 'google_shopping_fallback' });
  }
  return { store: fallback.store, products: items, items: dedupe(items), debug, ms: Date.now() - started };
}

function storeSummary(results = []) {
  const stores = [...FEEDS.map((feed) => feed.store), ...SHOPPING_FALLBACKS.map((fallback) => fallback.store)];
  return stores.map((store) => {
    const result = results.find((item) => item.store === store) || { items: [], products: [], debug: [] };
    const debugList = Array.isArray(result.debug) ? result.debug : [result.debug].filter(Boolean);
    const opportunityCount = result.items?.length || 0;
    const productCount = result.products?.length || 0;
    const ok = debugList.filter((item) => Number(item.status || 0) >= 200 && Number(item.status || 0) < 400).length;
    const errors = debugList.filter((item) => item.error || (item.status && (item.status < 200 || item.status >= 400))).length;
    const status = opportunityCount ? 'Fırsat bulundu' : (productCount ? 'Ürün var, fırsat yok' : (ok ? 'Fırsat bulunamadı' : 'Erişim sorunu'));
    return {
      store,
      checked_urls: Math.max(1, debugList.length),
      ok_responses: ok,
      product_count: productCount,
      opportunity_count: opportunityCount,
      error_count: errors,
      status,
      note: opportunityCount
        ? `${opportunityCount} gerçek indirim fırsatı bulundu`
        : productCount
          ? `${productCount} teknoloji ürünü referansı var, ancak indirim eşiği sağlanmadı`
          : (debugList[0]?.note || 'Kaynak kontrol edildi')
    };
  });
}

function diversify(items = [], limit = 36) {
  const byStore = new Map();
  for (const item of items) {
    if (!byStore.has(item.store)) byStore.set(item.store, []);
    byStore.get(item.store).push(item);
  }
  for (const list of byStore.values()) list.sort((a, b) => b.score - a.score || b.discount_rate - a.discount_rate || b.discount_amount - a.discount_amount);
  const order = [...FEEDS.map((feed) => feed.store), ...SHOPPING_FALLBACKS.map((fallback) => fallback.store)];
  const picked = [];
  for (const store of order) {
    const first = byStore.get(store)?.shift();
    if (first) picked.push(first);
  }
  const rest = [...byStore.values()].flat().sort((a, b) => b.score - a.score || b.discount_rate - a.discount_rate || b.discount_amount - a.discount_amount);
  for (const item of rest) {
    if (picked.length >= limit) break;
    picked.push(item);
  }
  return picked.slice(0, limit);
}

export default async function handler(req, res) {
  try {
    const limit = Math.min(80, Math.max(6, Number(req.query?.limit || 36)));
    const xmlResults = await Promise.all(FEEDS.map(fetchFeed));
    const shoppingResults = await Promise.all(SHOPPING_FALLBACKS.map(fetchShoppingFallback));
    const results = [...xmlResults, ...shoppingResults];
    const allItems = results.flatMap((result) => result.items || []);
    const items = diversify(allItems, limit);
    return json(res, 200, {
      items,
      count: items.length,
      store_summary: storeSummary(results),
      checked_stores: storeSummary(results).map((row) => row.store),
      source_type: 'discount_verified_xml_and_fallback',
      discount_rules: { min_discount_rate: MIN_DISCOUNT_RATE, min_discount_amount: MIN_DISCOUNT_AMOUNT },
      refreshed_at: new Date().toISOString(),
      debug: results.flatMap((result) => Array.isArray(result.debug) ? result.debug : [result.debug].filter(Boolean))
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), items: [], store_summary: storeSummary([]) });
  }
}
