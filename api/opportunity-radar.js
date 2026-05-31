import { json, safeText, hashValue } from './_lib.js';

const SOURCES = [
  {
    name: 'Amazon.com.tr',
    base: 'https://www.amazon.com.tr',
    urls: [
      'https://www.amazon.com.tr/s?k=iphone+telefon',
      'https://www.amazon.com.tr/s?k=samsung+galaxy',
      'https://www.amazon.com.tr/s?k=laptop',
      'https://www.amazon.com.tr/s?k=ak%C4%B1ll%C4%B1+saat',
      'https://www.amazon.com.tr/s?k=kulakl%C4%B1k'
    ]
  },
  {
    name: 'MediaMarkt',
    base: 'https://www.mediamarkt.com.tr',
    urls: [
      'https://www.mediamarkt.com.tr/tr/search.html?query=iphone',
      'https://www.mediamarkt.com.tr/tr/search.html?query=samsung%20galaxy',
      'https://www.mediamarkt.com.tr/tr/search.html?query=laptop',
      'https://www.mediamarkt.com.tr/tr/search.html?query=ak%C4%B1ll%C4%B1%20saat',
      'https://www.mediamarkt.com.tr/tr/search.html?query=kulakl%C4%B1k'
    ]
  },
  {
    name: 'Hepsiburada',
    base: 'https://www.hepsiburada.com',
    urls: [
      'https://www.hepsiburada.com/ara?q=iphone',
      'https://www.hepsiburada.com/ara?q=samsung+galaxy',
      'https://www.hepsiburada.com/ara?q=laptop',
      'https://www.hepsiburada.com/ara?q=ak%C4%B1ll%C4%B1+saat',
      'https://www.hepsiburada.com/ara?q=kulakl%C4%B1k'
    ]
  },
  {
    name: 'N11',
    base: 'https://www.n11.com',
    urls: [
      'https://www.n11.com/arama?q=iphone',
      'https://www.n11.com/arama?q=samsung+galaxy',
      'https://www.n11.com/arama?q=laptop',
      'https://www.n11.com/arama?q=ak%C4%B1ll%C4%B1+saat',
      'https://www.n11.com/arama?q=kulakl%C4%B1k'
    ]
  },
  {
    name: 'Teknosa',
    base: 'https://www.teknosa.com',
    urls: [
      'https://www.teknosa.com/arama/?s=iphone',
      'https://www.teknosa.com/arama/?s=samsung%20galaxy',
      'https://www.teknosa.com/arama/?s=laptop',
      'https://www.teknosa.com/arama/?s=ak%C4%B1ll%C4%B1%20saat',
      'https://www.teknosa.com/arama/?s=kulakl%C4%B1k'
    ]
  },
  {
    name: 'Huawei Online Mağaza',
    base: 'https://consumer.huawei.com/tr',
    urls: [
      'https://consumer.huawei.com/tr/offer/',
      'https://consumer.huawei.com/tr/wearables/',
      'https://consumer.huawei.com/tr/tablets/',
      'https://consumer.huawei.com/tr/audio/'
    ]
  }
];

const TECH_WORDS = /iphone|ipad|macbook|samsung|galaxy|xiaomi|huawei|honor|oppo|vivo|telefon|akıllı telefon|tablet|laptop|notebook|bilgisayar|monitör|monitor|kulaklık|earbuds|airpods|watch|akıllı saat|televizyon|tv|oled|qled|ssd|ram|router|modem|playstation|xbox|nintendo|kamera|printer|yazıcı/i;
const NOISE_WORDS = /kılıf|kilif|cam koruyucu|şarj kablosu|sarj kablosu|adaptör|adapter|askı|stand|çanta|canta|temizlik|yedek parça|oyuncak|bebek|kozmetik|deterjan|kitap/i;

function absoluteUrl(url = '', base = '') {
  const clean = String(url || '').trim();
  if (!clean) return '';
  try { return new URL(clean, base).toString(); } catch { return clean; }
}

function decode(value = '') {
  return safeText(String(value || '').replace(/\\u002F/g, '/').replace(/\\u0026/g, '&'));
}

function priceNumber(value = '') {
  const text = String(value || '').replace(/&nbsp;/g, ' ');
  const match = text.match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{4,})(?:\s*)?(?:TL|₺|TRY)/i);
  if (!match) return 0;
  return Number(match[1].replace(/[.\s]/g, '').replace(',', '.')) || 0;
}

function extractAround(html = '', index = 0, radius = 1200) {
  return html.slice(Math.max(0, index - radius), Math.min(html.length, index + radius));
}

function findImage(block = '', base = '') {
  const patterns = [
    /<img[^>]+src=["']([^"']+)["']/i,
    /<img[^>]+data-src=["']([^"']+)["']/i,
    /"image"\s*:\s*"([^"]+)"/i,
    /"imageUrl"\s*:\s*"([^"]+)"/i
  ];
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) return absoluteUrl(decode(match[1]), base);
  }
  return '';
}

function findUrl(block = '', base = '') {
  const patterns = [
    /<a[^>]+href=["']([^"']+)["']/i,
    /"url"\s*:\s*"([^"]+)"/i,
    /"productUrl"\s*:\s*"([^"]+)"/i
  ];
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) return absoluteUrl(decode(match[1]), base);
  }
  return base;
}

function findTitle(block = '') {
  const patterns = [
    /"name"\s*:\s*"([^"]{8,160})"/i,
    /"title"\s*:\s*"([^"]{8,160})"/i,
    /title=["']([^"']{8,160})["']/i,
    /alt=["']([^"']{8,160})["']/i,
    /<h[23][^>]*>([\s\S]{8,260}?)<\/h[23]>/i,
    /<span[^>]*>([^<]{8,160})<\/span>/i
  ];
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) return decode(match[1]).slice(0, 180);
  }
  return '';
}

function findListPrice(block = '', salePrice = 0) {
  const prices = [...block.matchAll(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{4,})(?:\s*)?(?:TL|₺|TRY)/gi)]
    .map((m) => priceNumber(m[0]))
    .filter((n) => n > salePrice && n < salePrice * 3)
    .sort((a, b) => b - a);
  return prices[0] || 0;
}

function discountRate(listPrice = 0, salePrice = 0) {
  if (!listPrice || !salePrice || listPrice <= salePrice) return 0;
  return Math.round(((listPrice - salePrice) / listPrice) * 100);
}

function productScore(item = {}) {
  let score = 30;
  if (item.discount_rate >= 30) score += 32;
  else if (item.discount_rate >= 20) score += 24;
  else if (item.discount_rate >= 10) score += 14;
  if (item.sale_price >= 30000) score += 12;
  else if (item.sale_price >= 12000) score += 8;
  else if (item.sale_price >= 5000) score += 4;
  if (/iphone|galaxy|macbook|ipad|playstation|oled|qled|huawei watch|airpods/i.test(item.title)) score += 12;
  if (/amazon|mediamarkt|teknosa|hepsiburada/i.test(item.store)) score += 5;
  return Math.max(0, Math.min(100, score));
}

function guidance(score = 0) {
  if (score >= 72) return 'Mutlaka haberleştir';
  if (score >= 55) return 'Takip et';
  return 'Düşük öncelik';
}

function validItem(item = {}) {
  const text = `${item.title || ''} ${item.store || ''}`;
  if (!item.title || item.title.length < 8) return false;
  if (!item.sale_price || item.sale_price < 300) return false;
  if (!TECH_WORDS.test(text)) return false;
  if (NOISE_WORDS.test(text) && item.sale_price < 5000) return false;
  return true;
}

function parseProducts(html = '', source = {}) {
  const items = [];
  const priceMatches = [...html.matchAll(/(?:₺|TL|TRY|price|Price)[^\d]{0,24}(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{4,})|((?:\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{4,})(?:\s*)?(?:TL|₺|TRY))/gi)];

  for (const match of priceMatches.slice(0, 140)) {
    const idx = match.index || 0;
    const block = extractAround(html, idx);
    const rawPrice = match[0] || '';
    const sale = priceNumber(rawPrice.includes('TL') || rawPrice.includes('₺') || rawPrice.includes('TRY') ? rawPrice : `${match[1] || match[2]} TL`);
    if (!sale) continue;

    const title = findTitle(block);
    const url = findUrl(block, source.base);
    const image = findImage(block, source.base);
    const list = findListPrice(block, sale);
    const rate = discountRate(list, sale);

    const item = {
      id: hashValue(`${source.name}|${title}|${sale}|${url}`).slice(0, 16),
      store: source.name,
      title,
      url,
      image_url: image,
      sale_price: sale,
      list_price: list,
      discount_rate: rate,
      discount_amount: list > sale ? Math.round(list - sale) : 0,
      checked_at: new Date().toISOString()
    };
    item.score = productScore(item);
    item.guidance = guidance(item.score);
    item.reason = rate ? `%${rate} indirim ve ${item.store} kaynağı` : `${item.store} içinde teknoloji ürünü fiyat sinyali`;
    if (validItem(item)) items.push(item);
  }

  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.store}|${item.title.toLowerCase()}|${item.sale_price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

async function fetchSource(source = {}) {
  const items = [];
  const debug = [];
  for (const url of source.urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0 (+https://www.teknoblog.com/)',
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.5'
        }
      });
      clearTimeout(timer);
      if (!response.ok) {
        debug.push({ source: source.name, url, status: response.status });
        continue;
      }
      const html = await response.text();
      const parsed = parseProducts(html, source);
      items.push(...parsed);
      debug.push({ source: source.name, url, status: response.status, count: parsed.length });
    } catch (error) {
      debug.push({ source: source.name, url, error: error?.message || String(error) });
    }
  }
  return { items, debug };
}

export default async function handler(req, res) {
  try {
    const limit = Math.min(60, Math.max(6, Number(req.query?.limit || 36)));
    const results = await Promise.all(SOURCES.map(fetchSource));
    const items = results.flatMap((result) => result.items)
      .sort((a, b) => b.score - a.score || b.discount_rate - a.discount_rate || b.sale_price - a.sale_price)
      .slice(0, limit);

    return json(res, 200, {
      items,
      count: items.length,
      refreshed_at: new Date().toISOString(),
      debug: results.flatMap((result) => result.debug)
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), items: [] });
  }
}
