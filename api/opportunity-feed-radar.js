import { json, safeText, hashValue } from './_lib.js';

const FEEDS = [
  {
    store: 'Teknosa',
    url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6151&feedId=631&format=xml&utm=%3Fref%3Dgo%26utm_source%3Dgo%26pfx%3D%7Btransaction_id%7D%26utm_medium%3Daffiliate%26utm_campaign%3D%7Baff_id%7D%26utm_term%3D%7Btransaction_id%7D'
  },
  {
    store: 'MediaMarkt',
    url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6816&feedId=716&format=xml&utm=%3Futm_source%3Dgelirortaklari%26utm_medium%3Daffiliate%26utm_campaign%3D%7Baffiliate_name%7D%26pfx%3D%7Btransaction_id%7D%26utm_term%3D%7Btransaction_id%7D'
  },
  {
    store: 'Huawei',
    url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6747&feedId=91&format=xml&utm=%3Fcid%3D500888%26utm_medium%3Daffiliate%26utm_source%3Dgelirortaklari%26utm_campaign%3D%7Baffiliate_name%7D%26pfx%3D%7Btransaction_id%7D%26utm_term%3D%7Btransaction_id%7D'
  },
  {
    store: 'Huawei Akakçe',
    url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6747&feedId=44&format=xml&utm=%3Fcid%3D500888%26utm_medium%3D%7Baffiliate_name%7D%26utm_source%3Dgelirortaklari%26utm_term%3D%7Baff_id%7D%26pfx%3D%7Btransaction_id%7D%26utm_content%3D%7Btransaction_id%7D&publisher=akakce'
  },
  {
    store: 'Huawei Cimri',
    url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6747&feedId=664&format=xml&utm=%3Fcid%3D500888%26utm_source%3Dgelirortaklari%26utm_campaign%3D%7Baffiliate_name%7D%26utm_medium%3Daffiliate%26pfx%3D%7Btransaction_id%7D%26utm_term%3D%7Btransaction_id%7D'
  },
  {
    store: 'Huawei Avantajix',
    url: 'https://feed.gelirortaklari.com/api/v1/product?affId=23243&offerId=6747&feedId=667&format=xml&utm=%3Fcid%3D500888%26utm_source%3Dgelirortaklari%26utm_campaign%3D%7Baffiliate_name%7D%26utm_medium%3Daffiliate%26pfx%3D%7Btransaction_id%7D%26utm_term%3D%7Btransaction_id%7D'
  }
];

const TECH_WORDS = /iphone|ipad|macbook|samsung|galaxy|xiaomi|huawei|honor|oppo|vivo|telefon|akıllı telefon|tablet|laptop|notebook|bilgisayar|monitör|monitor|kulaklık|earbuds|airpods|watch|akıllı saat|televizyon|tv|oled|qled|ssd|ram|router|modem|playstation|xbox|nintendo|kamera|printer|yazıcı|matebook|matepad|freebuds|band/i;
const NOISE_WORDS = /kılıf|kilif|cam koruyucu|şarj kablosu|sarj kablosu|adaptör|adapter|askı|stand|çanta|canta|temizlik|yedek parça|oyuncak|bebek|kozmetik|deterjan|kitap/i;

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

function price(value = '') {
  const text = String(value || '').replace(/[^0-9,\.]/g, '');
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) return Number(text.replace(/\./g, '').replace(',', '.')) || 0;
  if (text.includes(',')) return Number(text.replace(',', '.')) || 0;
  return Number(text) || 0;
}

function discountRate(list = 0, sale = 0) {
  if (!list || !sale || list <= sale) return 0;
  return Math.round(((list - sale) / list) * 100);
}

function guidance(score = 0) {
  if (score >= 72) return 'Mutlaka haberleştir';
  if (score >= 55) return 'Takip et';
  return 'Düşük öncelik';
}

function scoreItem(item = {}) {
  let score = 28;
  if (item.discount_rate >= 35) score += 36;
  else if (item.discount_rate >= 25) score += 28;
  else if (item.discount_rate >= 15) score += 20;
  else if (item.discount_rate >= 8) score += 10;
  if (item.sale_price >= 30000) score += 12;
  else if (item.sale_price >= 12000) score += 8;
  else if (item.sale_price >= 5000) score += 5;
  if (/iphone|galaxy|macbook|ipad|playstation|oled|qled|huawei watch|matebook|matepad|freebuds/i.test(item.title)) score += 12;
  if (/teknosa|mediamarkt/i.test(item.store)) score += 6;
  if (/huawei/i.test(item.store)) score += 4;
  return Math.max(0, Math.min(100, score));
}

function valid(item = {}) {
  const text = `${item.title || ''} ${item.category || ''} ${item.brand || ''} ${item.store || ''}`;
  if (!item.title || item.title.length < 6) return false;
  if (!item.sale_price || item.sale_price < 300) return false;
  if (!TECH_WORDS.test(text)) return false;
  if (NOISE_WORDS.test(text) && item.sale_price < 5000) return false;
  return true;
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
  const blocks = itemBlocks(xml);
  const items = [];
  for (const block of blocks) {
    const title = tag(block, ['name', 'title', 'product_name', 'productName', 'urunadi', 'urunAdi']);
    const url = tag(block, ['url', 'link', 'product_url', 'productUrl', 'deeplink', 'affiliate_url', 'affiliateUrl']) || attr(block, ['href']);
    const image = tag(block, ['image', 'image_url', 'imageUrl', 'picture', 'thumbnail', 'thumbnail_url', 'img', 'g:image_link']) || attr(block, ['src']);
    const brand = tag(block, ['brand', 'manufacturer', 'marka']);
    const category = tag(block, ['category', 'category_name', 'categoryName', 'kategori']);
    const sale = price(tag(block, ['price', 'sale_price', 'salePrice', 'discounted_price', 'discountPrice', 'final_price', 'finalPrice', 'fiyat', 'g:price']));
    const list = price(tag(block, ['old_price', 'oldPrice', 'list_price', 'listPrice', 'market_price', 'marketPrice', 'original_price', 'originalPrice', 'g:sale_price'])) || 0;
    const resolvedList = list > sale ? list : 0;
    const rate = discountRate(resolvedList, sale);
    const item = {
      id: hashValue(`${feed.store}|${title}|${sale}|${url}`).slice(0, 16),
      store: feed.store,
      title,
      url,
      image_url: image,
      brand,
      category,
      sale_price: sale,
      list_price: resolvedList,
      discount_rate: rate,
      discount_amount: resolvedList > sale ? Math.round(resolvedList - sale) : 0,
      checked_at: new Date().toISOString(),
      feed_type: 'xml'
    };
    item.score = scoreItem(item);
    item.guidance = guidance(item.score);
    item.reason = rate ? `%${rate} indirim, ${feed.store} XML feed kaynağı` : `${feed.store} XML feed içinde teknoloji ürünü`;
    if (valid(item)) items.push(item);
  }
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.store}|${item.title.toLowerCase()}|${item.sale_price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchFeed(feed = {}) {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    const response = await fetch(feed.url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0 (+https://www.teknoblog.com/)',
        accept: 'application/xml,text/xml,*/*;q=0.8'
      }
    });
    clearTimeout(timer);
    if (!response.ok) {
      return { store: feed.store, items: [], debug: { store: feed.store, status: response.status, count: 0, note: `HTTP ${response.status}`, ms: Date.now() - started } };
    }
    const xml = await response.text();
    const items = parseFeed(xml, feed);
    return { store: feed.store, items, debug: { store: feed.store, status: response.status, count: items.length, xml_length: xml.length, note: items.length ? 'XML feed parse edildi' : 'XML alındı, uygun teknoloji ürünü bulunamadı', ms: Date.now() - started } };
  } catch (error) {
    return { store: feed.store, items: [], debug: { store: feed.store, count: 0, error: error?.message || String(error), note: 'XML feed erişim hatası', ms: Date.now() - started } };
  }
}

function storeSummary(results = []) {
  return FEEDS.map((feed) => {
    const result = results.find((item) => item.store === feed.store) || { items: [], debug: {} };
    const count = result.items.length;
    const status = count ? 'Ürün bulundu' : (result.debug?.error || result.debug?.status >= 400 ? 'Erişim sorunu' : 'Ürün çıkarılamadı');
    return {
      store: feed.store,
      checked_urls: 1,
      ok_responses: result.debug?.status >= 200 && result.debug?.status < 400 ? 1 : 0,
      product_count: count,
      error_count: result.debug?.error || result.debug?.status >= 400 ? 1 : 0,
      status,
      note: count ? `${count} teknoloji fırsatı XML feed üzerinden bulundu` : (result.debug?.note || 'XML feed kontrol edildi')
    };
  });
}

function diversify(items = [], limit = 36) {
  const byStore = new Map();
  for (const item of items) {
    if (!byStore.has(item.store)) byStore.set(item.store, []);
    byStore.get(item.store).push(item);
  }
  for (const list of byStore.values()) list.sort((a, b) => b.score - a.score || b.discount_rate - a.discount_rate || b.sale_price - a.sale_price);
  const picked = [];
  for (const feed of FEEDS) {
    const first = byStore.get(feed.store)?.shift();
    if (first) picked.push(first);
  }
  const rest = [...byStore.values()].flat().sort((a, b) => b.score - a.score || b.discount_rate - a.discount_rate || b.sale_price - a.sale_price);
  for (const item of rest) {
    if (picked.length >= limit) break;
    picked.push(item);
  }
  return picked.slice(0, limit);
}

export default async function handler(req, res) {
  try {
    const limit = Math.min(80, Math.max(6, Number(req.query?.limit || 36)));
    const results = await Promise.all(FEEDS.map(fetchFeed));
    const allItems = results.flatMap((result) => result.items);
    const items = diversify(allItems, limit);
    return json(res, 200, {
      items,
      count: items.length,
      store_summary: storeSummary(results),
      checked_stores: FEEDS.map((feed) => feed.store),
      source_type: 'xml_feed',
      refreshed_at: new Date().toISOString(),
      debug: results.map((result) => result.debug)
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), items: [], store_summary: storeSummary([]) });
  }
}
