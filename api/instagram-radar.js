import { getSupabaseAdmin, json } from './_lib.js';

const MAX_AGE_HOURS = 24;

const HARD_NOISE_PATTERNS = [
  /hull\s*city/i,
  /polonya/i,
  /voleybol/i,
  /futbol/i,
  /basketbol/i,
  /\bkupa\b/i,
  /hangi\s*kanalda/i,
  /canli\s*izle|canlı\s*izle/i,
  /\bmac[iı]\b/i,
  /\bmaç[ıi]?\b/i,
  /\bspor\b/i,
  /deprem/i,
  /hava\s*durumu/i,
  /burç/i,
  /kimdir/i
];

const TECH_PATTERNS = [
  /google|android|iphone|ios|ipad|macbook|windows|samsung|galaxy|xiaomi|huawei|oppo|vivo|honor|pixel/i,
  /openai|chatgpt|gemini|claude|yapay\s*zeka|\bai\b|copilot/i,
  /telefon|tablet|laptop|gpu|cpu|nvidia|amd|intel|snapdragon|mediatek|çip|chip|işlemci/i,
  /watch|wear\s*os|akıllı\s*saat|app\s*store|play\s*store|whatsapp|instagram|youtube|chrome/i,
  /microsoft|apple|meta|xbox|playstation|steam|güvenlik|siber|veri|uygulama|yazılım|robot/i
];

const INSTAGRAM_HOOK_PATTERNS = [
  /yapay\s*zeka|openai|chatgpt|gemini|claude|copilot/i,
  /iphone|ios|apple|samsung|galaxy|android|xiaomi|huawei|honor|pixel/i,
  /whatsapp|instagram|youtube|tiktok|meta|google/i,
  /güvenlik|siber|veri\s*sızıntısı|hack|açık|dolandırıcılık/i,
  /yasak|tepki|iddia|sızıntı|değişiklik|kapatma|ücret|zam|fiyat|indirim|kampanya/i,
  /güncelleme|özellik|beta|tanıttı|duyurdu|başladı|geliyor|alacak/i
];

const CAROUSEL_EXPLAINER_PATTERNS = [
  /neden|nasıl|hangi|ne değişti|ne zaman|liste|alacak|kaç|fark|karşılaştırma|karsilastirma/i,
  /özellik|güncelleme|fiyat|model|uygulama|ayar|adım|rehber|detay/i
];

const TRUSTED_SOURCE_PATTERNS = [
  /teknoblog/i,
  /shiftdelete|donanımhaber|webtekno|webrazzi|log\.com\.tr|chip/i,
  /the verge|verge|engadget|techcrunch|9to5|macrumors|android authority|windows central/i
];

function scoreValue(item, key) {
  const value = Number(item?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function clamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function textOf(item = {}) {
  return [
    item.title,
    item.summary,
    item.excerpt,
    item.description,
    item.source_name,
    item.url,
    item.canonical_url,
    item.link
  ].filter(Boolean).join(' ').toLowerCase();
}

function publishedAt(item = {}) {
  return item.published_at || item.created_at || item.updated_at || null;
}

function ageHours(item = {}) {
  const time = new Date(publishedAt(item) || 0).getTime();
  if (!Number.isFinite(time) || !time) return 999999;
  return Math.max(0, (Date.now() - time) / 3600000);
}

function isFresh(item = {}) {
  return ageHours(item) <= MAX_AGE_HOURS;
}

function isNoise(item = {}) {
  const text = textOf(item);
  const noise = HARD_NOISE_PATTERNS.some((pattern) => pattern.test(text));
  if (!noise) return false;
  return !TECH_PATTERNS.some((pattern) => pattern.test(text));
}

function hasTechSignal(item = {}) {
  return TECH_PATTERNS.some((pattern) => pattern.test(textOf(item)));
}

function hasImage(item = {}) {
  return Boolean(item.image_url || item.image || item.thumbnail || item.media_url);
}

function freshnessScore(item = {}) {
  const hours = ageHours(item);
  if (hours <= 2) return 18;
  if (hours <= 6) return 15;
  if (hours <= 12) return 11;
  if (hours <= 24) return 6;
  return -30;
}

function patternScore(item = {}, patterns = [], value = 20) {
  const text = textOf(item);
  return patterns.some((pattern) => pattern.test(text)) ? value : 0;
}

function titleShapeScore(item = {}) {
  const title = String(item.title || '').trim();
  let score = 0;
  if (title.length >= 35 && title.length <= 105) score += 12;
  if (/[0-9]/.test(title)) score += 6;
  if (/!|\?|:/.test(title)) score += 4;
  if (title.length > 135) score -= 10;
  return score;
}

function sourceScore(item = {}) {
  const text = textOf(item);
  return TRUSTED_SOURCE_PATTERNS.some((pattern) => pattern.test(text)) ? 8 : 0;
}

function instagramScore(item = {}) {
  const baseDiscover = scoreValue(item, 'discover_score');
  const baseSocial = scoreValue(item, 'social_score');
  const baseTraffic = scoreValue(item, 'traffic_score');
  const score = Math.round(
    (baseDiscover * 0.20) +
    (baseSocial * 0.22) +
    (baseTraffic * 0.10) +
    patternScore(item, INSTAGRAM_HOOK_PATTERNS, 24) +
    patternScore(item, CAROUSEL_EXPLAINER_PATTERNS, 16) +
    titleShapeScore(item) +
    (hasImage(item) ? 10 : 0) +
    freshnessScore(item) +
    sourceScore(item)
  );
  return clamp(score);
}

function carouselAngle(item = {}) {
  const text = textOf(item);
  if (/güvenlik|siber|veri|hack|açık|dolandırıcılık/i.test(text)) return 'Risk ve korunma odaklı karusel';
  if (/fiyat|indirim|kampanya|ücret|zam|satış/i.test(text)) return 'Fiyat ve satın alma etkisi odaklı karusel';
  if (/güncelleme|özellik|beta|alacak|geliyor/i.test(text)) return 'Ne değişti, kimleri etkiliyor karuseli';
  if (/yapay\s*zeka|openai|chatgpt|gemini|claude/i.test(text)) return 'Yapay zekâ gündemi ve etkileri karuseli';
  if (/iphone|samsung|galaxy|android|ios/i.test(text)) return 'Telefon kullanıcılarını ilgilendiren özet karusel';
  return 'Hızlı teknoloji gündemi karuseli';
}

function slidePlan(item = {}) {
  const title = String(item.title || '').trim();
  const text = textOf(item);
  const slides = [
    'Kapak: En çarpıcı sonucu tek cümleyle ver',
    'Olay: Haberde tam olarak ne oldu?',
    'Etki: Kullanıcıyı veya sektörü nasıl ilgilendiriyor?',
    'Detay: En önemli teknik veya ticari ayrıntı',
    'Son kart: Teknoblog’da detaylar ve takip çağrısı'
  ];
  if (/güvenlik|siber|hack|veri/i.test(text)) slides[2] = 'Risk: Kimler etkilenebilir, neye dikkat edilmeli?';
  if (/fiyat|indirim|kampanya|zam/i.test(text)) slides[2] = 'Fiyat etkisi: Kimler için önemli, avantaj nerede?';
  if (/güncelleme|özellik|beta/i.test(text)) slides[2] = 'Yenilik: Günlük kullanımda ne değişecek?';
  if (title.length < 50) slides[0] = `Kapak: ${title}`;
  return slides;
}

function hookText(item = {}) {
  const title = String(item.title || '').trim();
  if (/güvenlik|siber|hack|veri/i.test(textOf(item))) return 'Bu gelişme kullanıcı güvenliği açısından dikkat istiyor.';
  if (/fiyat|indirim|kampanya|zam/i.test(textOf(item))) return 'Bu fiyat veya kampanya detayı haberleştirilebilir bir açı sunuyor.';
  if (/güncelleme|özellik|beta/i.test(textOf(item))) return 'Bu yenilik günlük kullanımda fark yaratabilecek nitelikte.';
  return title || 'Bu gelişme Instagram karusel formatında hızlı anlatıma uygun görünüyor.';
}

function normalizeRawItem(item = {}, sourceMap = new Map()) {
  const sourceName = item.source_name || sourceMap.get(String(item.source_id)) || '';
  return {
    ...item,
    title: item.title || item.item_title || item.feed_title || item.name || '',
    summary: item.summary || item.description || item.excerpt || '',
    url: item.url || item.link || item.canonical_url || item.guid || '',
    source_name: sourceName,
    published_at: item.published_at || item.created_at || item.updated_at || null,
    image_url: item.image_url || item.thumbnail || item.image || null
  };
}

function dedupe(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.url || item.canonical_url || item.link || item.title || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function decorate(item = {}) {
  const score = instagramScore(item);
  return {
    ...item,
    instagram_score: score,
    carousel_potential_score: score,
    carousel_angle: carouselAngle(item),
    hook_text: hookText(item),
    slide_plan: slidePlan(item),
    max_age_hours: MAX_AGE_HOURS
  };
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const limit = Math.min(40, Math.max(6, Number(req.query?.limit || 18)));

    const [{ data: candidates, error: candidatesError }, { data: sources, error: sourcesError }, { data: rawItems, error: rawItemsError }] = await Promise.all([
      supabase.from('topic_candidates').select('*').eq('status', 'active').limit(2500),
      supabase.from('sources').select('id,name'),
      supabase.from('raw_feed_items').select('*').order('created_at', { ascending: false }).limit(25000)
    ]);

    if (candidatesError) return json(res, 500, { error: candidatesError.message });
    if (sourcesError) return json(res, 500, { error: sourcesError.message });
    if (rawItemsError) return json(res, 500, { error: rawItemsError.message });

    const sourceMap = new Map((sources || []).map((source) => [String(source.id), source.name || '']));
    const rawMap = new Map((rawItems || []).map((item) => [String(item.id), item]));

    const candidateItems = (candidates || []).map((item) => {
      const raw = rawMap.get(String(item.raw_feed_item_id || '')) || null;
      return {
        ...item,
        source_name: item.source_name || sourceMap.get(String(item.source_id)) || sourceMap.get(String(raw?.source_id || '')) || '',
        published_at: item.published_at || raw?.published_at || item.created_at || item.updated_at || null,
        image_url: item.image_url || raw?.image_url || null,
        url: item.url || item.canonical_url || raw?.url || raw?.link || item.source_url || ''
      };
    });

    const rawFallback = (rawItems || []).map((item) => normalizeRawItem(item, sourceMap));

    const items = dedupe([...candidateItems, ...rawFallback])
      .filter(isFresh)
      .filter((item) => !isNoise(item))
      .filter(hasTechSignal)
      .map(decorate)
      .filter((item) => item.instagram_score >= 35)
      .sort((a, b) => b.instagram_score - a.instagram_score || new Date(b.published_at || 0) - new Date(a.published_at || 0))
      .slice(0, limit);

    return json(res, 200, {
      items,
      count: items.length,
      max_age_hours: MAX_AGE_HOURS,
      refreshed_at: new Date().toISOString(),
      scoring: {
        focus: 'Instagram karusel, Keşfet potansiyeli, son 24 saat',
        signals: ['sosyal ilgi', 'görsel uygunluk', 'karusel açıklanabilirliği', 'başlık kancası', 'teknoloji odağı', 'tazelik']
      }
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), items: [] });
  }
}
