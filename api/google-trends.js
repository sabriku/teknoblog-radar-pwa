import { json, parseFeedItems, safeText } from './_lib.js';

const GOOGLE_TRENDS_RSS = 'https://trends.google.com/trending/rss?geo=TR';
const GOOGLE_TRENDS_TIMEOUT_MS = 12000;

const TECH_PATTERNS = [
  /yapay\s*zeka|artificial\s*intelligence|\bai\b|openai|chatgpt|gemini|claude|copilot/i,
  /google|android|chrome|youtube|apple|iphone|ios|ipad|macbook|macos/i,
  /samsung|galaxy|xiaomi|huawei|honor|oppo|vivo|pixel|one\s*ui/i,
  /windows|microsoft|nvidia|amd|intel|snapdragon|mediatek|işlemci|çip|chip|gpu|cpu/i,
  /whatsapp|instagram|tiktok|x\b|twitter|telegram|meta/i,
  /telefon|akıllı\s*telefon|tablet|laptop|dizüstü|kulaklık|akıllı\s*saat|wear\s*os/i,
  /siber|güvenlik|veri|uygulama|yazılım|robot|oyun|playstation|xbox|steam/i
];

const NOISE_PATTERNS = [
  /maç|canlı\s*izle|hangi\s*kanalda|futbol|basketbol|voleybol|transfer|kupa/i,
  /deprem|hava\s*durumu|burç|kimdir|magazin|dizi|sezon|bölüm/i,
  /altın|dolar|euro|borsa|faiz|emekli|maaş/i
];

function hasTechSignal(text = '') {
  return TECH_PATTERNS.some((pattern) => pattern.test(text));
}

function isNoise(text = '') {
  return NOISE_PATTERNS.some((pattern) => pattern.test(text)) && !hasTechSignal(text);
}

function normalizePublishedAt(value = '') {
  const date = new Date(String(value || '').trim());
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function trendScore(item = {}) {
  const text = `${item.title || ''} ${item.summary || ''}`;
  let score = 40;
  if (hasTechSignal(text)) score += 35;
  if (/openai|chatgpt|gemini|iphone|android|samsung|google|apple|whatsapp|instagram/i.test(text)) score += 15;
  if (/güncelleme|özellik|fiyat|sızıntı|iddia|duyurdu|tanıttı|yasak|güvenlik/i.test(text)) score += 10;
  if (isNoise(text)) score -= 60;
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function fetchTrends() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TRENDS_TIMEOUT_MS);
  try {
    const response = await fetch(GOOGLE_TRENDS_RSS, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0 (+https://www.teknoblog.com/)',
        accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`Google Trends HTTP ${response.status}`);
    const xml = await response.text();
    return parseFeedItems(xml);
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  try {
    const limit = Math.min(50, Math.max(5, Number(req.query?.limit || 30)));
    const raw = await fetchTrends();
    const seen = new Set();
    const items = [];

    for (const item of raw) {
      const title = safeText(item.title || '');
      const summary = safeText(item.summary || '');
      const text = `${title} ${summary}`;
      if (!title || seen.has(title.toLowerCase())) continue;
      if (isNoise(text)) continue;

      const score = trendScore({ title, summary });
      seen.add(title.toLowerCase());
      items.push({
        title,
        summary,
        url: item.url || `https://trends.google.com/trending?geo=TR&q=${encodeURIComponent(title)}`,
        source_name: 'Google Trends Türkiye',
        published_at: normalizePublishedAt(item.published_at || new Date().toISOString()),
        trend_score: score,
        is_tech: hasTechSignal(text),
        image_url: item.image_url || ''
      });
    }

    items.sort((a, b) => Number(b.is_tech) - Number(a.is_tech) || b.trend_score - a.trend_score || new Date(b.published_at || 0) - new Date(a.published_at || 0));

    return json(res, 200, {
      items: items.slice(0, limit),
      count: Math.min(items.length, limit),
      refreshed_at: new Date().toISOString(),
      source: 'Google Trends Türkiye',
      source_url: GOOGLE_TRENDS_RSS
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
