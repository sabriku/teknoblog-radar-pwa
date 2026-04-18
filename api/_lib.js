function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function getEnv() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(k => !process.env[k]);
  return { ok: missing.length === 0, missing };
}

async function supabaseFetch(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  }
  return data;
}

function normalizeText(text = '') {
  return text
    .toLowerCase()
    .replace(/&[^;]+;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectContentType(text) {
  if (/(indirim|fiyat|kampanya|satın al|en ucuz|prime day|kupon|aksesuar)/.test(text)) return 'deal';
  if (/(karşılaştırma|vs\b|hangisi|farkı ne)/.test(text)) return 'comparison';
  if (/(nedir|nasıl|rehber|ipuçları|liste|en iyi)/.test(text)) return 'guide';
  if (/(tanıt|duyurdu|unveils|announces|launch|introduces)/.test(text)) return 'launch';
  if (/(güncelleme|update|one ui|ios|android|windows|chrome|gemini|chatgpt|copilot)/.test(text)) return 'update';
  if (/(sızıntı|leak|render|renk|tasarım|iddiaya göre)/.test(text)) return 'analysis';
  return 'hot_news';
}

function clusterKey(title = '') {
  return normalizeText(title)
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 8)
    .join('-')
    .slice(0, 120);
}

function scoreItem(item, blacklistTerms = []) {
  const title = normalizeText(item.title || '');
  const summary = normalizeText(item.summary || '');
  const text = `${title} ${summary}`;
  const publishedAt = item.published_at ? new Date(item.published_at) : null;
  const ageHours = publishedAt ? (Date.now() - publishedAt.getTime()) / 36e5 : 999;

  let traffic = 15;
  let conversion = 5;
  let discover = 5;
  let social = 5;
  let editorial = 10;

  const bigBrands = /(apple|iphone|ipad|mac|samsung|galaxy|google|android|pixel|microsoft|windows|openai|chatgpt|meta|instagram|whatsapp|qualcomm|intel|xiaomi|huawei|adobe|oneplus|sony|nintendo|tesla)/;
  const coreProducts = /(one ui|ios|ipados|macos|watchos|visionos|wear os|chrome|gemini|copilot|threads|xbox|playstation|airpods|galaxy s|iphone 1[6-9]|pixel \d|windows 11)/;
  const turkeySignals = /(türkiye|turkey|tl\b|fiyat|ön sipariş|önsipariş|satış|stok|verg|kdv|resmi|dağıtım|operatör)/;
  const hotNewsSignals = /(duyurdu|tanıttı|başlattı|yayınladı|sunuyor|getiriyor|launch|announces|introduces|rolls out|now available)/;
  const discoverSignals = /(nedir|nasıl|rehber|karşılaştırma|hangi|en iyi|liste|özellikleri|uyumlu cihazlar)/;
  const socialSignals = /(sızıntı|leak|render|renk|tasarım|görsel|first look|hands on|video)/;
  const conversionSignals = /(indirim|kampanya|satın al|satın alma|fiyatı|aksesuar|karşılaştırma|hangi model|uygun fiyat|amazon|hepsiburada|mediamarkt)/;
  const bannedPatterns = /(affiliate|commission junction|plr|email marketing|content creator tools|best wordpress plugin|blogger)/;

  if (bigBrands.test(text)) { traffic += 20; editorial += 16; social += 8; }
  if (coreProducts.test(text)) { traffic += 14; discover += 8; social += 6; }
  if (turkeySignals.test(text)) { conversion += 18; editorial += 18; discover += 6; }
  if (hotNewsSignals.test(text)) { traffic += 12; social += 10; }
  if (discoverSignals.test(text)) { discover += 24; conversion += 6; }
  if (socialSignals.test(text)) { social += 20; }
  if (conversionSignals.test(text)) { conversion += 28; discover += 5; }

  if (item.source_type === 'official') { editorial += 18; traffic += 8; }
  if (item.market_relevance === 'turkey') { editorial += 20; conversion += 10; }
  if (item.market_relevance === 'mixed') { editorial += 10; }

  if (typeof item.trust_score === 'number') editorial += Math.round((item.trust_score - 50) / 5);
  if (typeof item.priority_weight === 'number') traffic += Math.round((item.priority_weight - 50) / 5);

  if (ageHours <= 6) { traffic += 18; social += 8; }
  else if (ageHours <= 24) { traffic += 10; social += 4; }
  else if (ageHours <= 72) { traffic += 4; }
  else if (ageHours > 24 * 30) { traffic -= 30; editorial -= 10; }

  if (/\b(2022|2023|2024)\b/.test(text)) {
    traffic -= 40; discover -= 20; editorial -= 20;
  }

  if (bannedPatterns.test(text)) {
    traffic -= 35; conversion -= 25; discover -= 25; editorial -= 35;
  }

  for (const term of blacklistTerms) {
    if (term && text.includes(term)) {
      traffic -= 35;
      conversion -= 20;
      discover -= 20;
      editorial -= 35;
      break;
    }
  }

  const contentType = detectContentType(text);
  if (!bigBrands.test(text) && !turkeySignals.test(text) && !conversionSignals.test(text)) {
    editorial -= 25;
    traffic -= 15;
  }

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  traffic = clamp(traffic);
  conversion = clamp(conversion);
  discover = clamp(discover);
  social = clamp(social);
  editorial = clamp(editorial);

  const total = clamp((traffic * 0.25) + (conversion * 0.20) + (discover * 0.15) + (social * 0.10) + (editorial * 0.30));

  return {
    traffic_score: traffic,
    conversion_score: conversion,
    discover_score: discover,
    social_score: social,
    editorial_score: editorial,
    total_score: total,
    content_type_hint: contentType,
    canonical_topic_title: item.title,
    topic_cluster_key: clusterKey(item.title || '')
  };
}

module.exports = { json, getEnv, supabaseFetch, scoreItem, normalizeText, detectContentType, clusterKey };
