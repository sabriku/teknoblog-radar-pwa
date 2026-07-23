import { json, queryLocal, safeText, nowIso } from './_lib.js';

const MAX_CANDIDATE_HOURS = 24;
const MAX_OWNED_HOURS = 48;
const STOP = new Set('ve veya ile için bir bu şu daha yeni son ilk olan olarak göre sonra önce hakkında üzerinde geliyor geldi olacak oldu neden nasıl hangi ne zaman teknoloji teknolojik tech says report reportedly could may its the and for from with that this have has will into over after before'.split(' '));
const NOISE = /\b(maç|macı|maci|futbol|voleybol|basketbol|kupa|canlı izle|hangi kanalda|burç|magazin|survivor)\b/i;
const TECH = /apple|iphone|ipad|ios|macbook|android|samsung|galaxy|xiaomi|huawei|honor|oppo|vivo|google|gemini|openai|chatgpt|yapay zeka|microsoft|windows|nvidia|amd|intel|whatsapp|instagram|youtube|telefon|tablet|laptop|kulaklık|akıllı saat|güvenlik|siber|uygulama|yazılım|robot|otomobil|elektrikli|uzay|nasa|spacex|oyun|playstation|xbox|nintendo|garmin|sony|kamera|cloud|bulut|çip|işlemci|ekran|batarya/i;
const URGENT = /duyurdu|tanıttı|yayınladı|başladı|çıktı|geldi|kaldırdı|yasak|açık|sızıntı|iddia|zam|fiyat|indirim|güncelleme|beta|bugün|şimdi/i;
const REELS = /tanıttı|duyurdu|ilk kez|video|kamera|tasarım|özellik|karşılaştırma|test|inceleme|nasıl|hız|performans|oyun|robot|otomobil|katlanabilir|giyilebilir|demo/i;
const SAVE_SHARE = /hangi|liste|özellik|güncelleme|fiyat|karşılaştırma|fark|nasıl|rehber|güvenlik|model|alacak|destek|bilmeniz|dikkat/i;
let liveOwnedCache = { expiresAt: 0, items: [] };

function clamp(value, max = 97) { return Math.max(0, Math.min(max, Math.round(Number(value) || 0))); }
function ageHours(item = {}) {
  const time = new Date(item.published_at || item.created_at || 0).getTime();
  return Number.isFinite(time) && time ? Math.max(0, (Date.now() - time) / 3600000) : 9999;
}
function clean(value = '') { return safeText(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
function textOf(item = {}) { return `${item.title || ''} ${item.summary || item.excerpt || ''}`.toLocaleLowerCase('tr-TR'); }
function number(item, key) { const value = Number(item?.[key]); return Number.isFinite(value) ? value : 0; }
function freshness(item = {}, range = 24) { return clamp((1 - Math.min(range, ageHours(item)) / range) * 100, 100); }
function hasImage(item = {}) { return Boolean(item.image_url); }
function logSignal(value = 0, scale = 18) { return Math.min(100, Math.log1p(Math.max(0, Number(value) || 0)) * scale); }

function titleTokens(value = '') {
  return [...new Set(String(value).toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ').split(/\s+/).filter((word) => (word.length >= 3 || /\d/.test(word)) && !STOP.has(word)))];
}
function urlKey(value = '') { return String(value || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase(); }

function keywords(item = {}) {
  const preferred = titleTokens(item.title).filter((word) => !/^(duyurdu|tanıttı|geldi|çıktı|olacak|başladı|artık)$/.test(word));
  const category = /yapay zeka|chatgpt|gemini|openai/i.test(textOf(item)) ? ['yapay zeka']
    : /iphone|ios|ipad|apple/i.test(textOf(item)) ? ['Apple']
      : /android|samsung|galaxy|xiaomi|pixel/i.test(textOf(item)) ? ['Android']
        : /güvenlik|siber/i.test(textOf(item)) ? ['siber güvenlik'] : ['teknoloji gündemi'];
  return [...new Set([...preferred.slice(0, 6), ...category])].slice(0, 7);
}

function performanceSignal(item = {}) {
  const discover = logSignal(number(item, 'discover_clicks'), 24) * .55 + logSignal(number(item, 'discover_impressions'), 8) * .45;
  const news = logSignal(number(item, 'google_news_clicks'), 22) * .60 + logSignal(number(item, 'google_news_impressions'), 7) * .40;
  const web = logSignal(number(item, 'web_clicks'), 18) * .65 + logSignal(number(item, 'web_impressions'), 6) * .35;
  return clamp(discover * .50 + news * .30 + web * .20, 100);
}

function istanbulDay(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (type) => parts.find((entry) => entry.type === type)?.value || '01';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function digestSummary(item = {}) {
  const source = summaryFor(item);
  if (!source) return 'Günün teknoloji gündeminde öne çıkan bu gelişmenin ayrıntıları Teknoblog’da.';
  const sentence = source.match(/^.{45,220}?(?:[.!?](?=\s|$)|$)/)?.[0] || source.slice(0, 180);
  return sentence.length > 180 ? `${sentence.slice(0, 177).trim()}…` : sentence.trim();
}
function digestSignals(item = {}) {
  const clicks = number(item, 'discover_clicks') + number(item, 'google_news_clicks') + number(item, 'web_clicks');
  const impressions = number(item, 'discover_impressions') + number(item, 'google_news_impressions') + number(item, 'web_impressions');
  return { clicks, impressions, available: clicks > 0 || impressions > 0 };
}
function digestScore(item = {}) {
  const text = textOf(item);
  const signal = digestSignals(item);
  const readScore = logSignal(signal.clicks, 20) * .65 + logSignal(signal.impressions, 7) * .35;
  return clamp(freshness(item, 24) * .22 + readScore * .38 + (URGENT.test(text) ? 15 : 6)
    + (TECH.test(text) ? 9 : 0) + (SAVE_SHARE.test(text) ? 7 : 2) + (hasImage(item) ? 6 : 0) + 8, 96);
}

function channelTemplate(items = [], channel = 'whatsapp') {
  const numbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
  const heading = channel === 'whatsapp' ? '🗞️ *Teknoblog | Günün Öne Çıkan 5 Haberi*' : '📌 Bugün Teknoblog’da öne çıkan 5 haber';
  const entries = items.map((item, index) => channel === 'whatsapp'
    ? `${numbers[index]} *${clean(item.title)}*\n${item.digest_summary}\n🔗 ${item.url}`
    : `${numbers[index]} ${clean(item.title)}\n${item.digest_summary}\nHaberi oku: ${item.url}`);
  const footer = channel === 'whatsapp'
    ? 'Teknoloji gündemini kaçırmamak için Teknoblog’u takipte kalın.'
    : 'Sizin için günün en önemli gelişmesi hangisi? Yanıtınızı paylaşın.';
  return [heading, ...entries, footer].join('\n\n');
}

function storyScore(item = {}) {
  const text = textOf(item);
  return clamp(freshness(item, 24) * .38 + performanceSignal(item) * .14 + number(item, 'discover_score') * .10 + number(item, 'social_score') * .08
    + (URGENT.test(text) ? 18 : 5) + (hasImage(item) ? 11 : 0) + (item.is_teknoblog ? 10 : 0) + (TECH.test(text) ? 8 : -14));
}
function reelsScore(item = {}) {
  const text = textOf(item);
  return clamp(freshness(item, 24) * .20 + performanceSignal(item) * .08 + number(item, 'social_score') * .20 + number(item, 'discover_score') * .10
    + (REELS.test(text) ? 25 : 7) + (URGENT.test(text) ? 8 : 0) + (hasImage(item) ? 12 : 0) + (item.is_teknoblog ? 7 : 0));
}
function feedScore(item = {}) {
  const text = textOf(item);
  return clamp(freshness(item, item.is_teknoblog ? 48 : 24) * .20 + performanceSignal(item) * .14 + number(item, 'discover_score') * .17
    + number(item, 'traffic_score') * .09 + number(item, 'social_score') * .10 + (SAVE_SHARE.test(text) ? 20 : 6) + (hasImage(item) ? 10 : 0) + (item.is_teknoblog ? 7 : 0));
}

function summaryFor(item = {}) {
  const summary = clean(item.summary || item.excerpt || '');
  return summary.length > 360 ? `${summary.slice(0, 357).trim()}…` : summary;
}
function hookFor(item = {}, format = 'feed') {
  const title = clean(item.title);
  const text = textOf(item);
  if (/güvenlik|siber|açık|dolandırıcılık/i.test(text)) return `Dikkat: ${title}`;
  if (/fiyat|indirim|zam|kampanya/i.test(text)) return `Fiyat gündemi: ${title}`;
  if (/tanıttı|duyurdu|çıktı|lansman/i.test(text)) return `Yeni duyuru: ${title}`;
  if (/güncelleme|beta|özellik/i.test(text)) return `Neler değişiyor? ${title}`;
  return format === 'reels' ? `60 saniyede: ${title}` : title;
}
function ctaFor(item = {}, format = 'feed') {
  if (format === 'reels') return 'Bu gelişme günlük kullanımınızı etkiler mi? Görüşünüzü yorumlarda paylaşın.';
  if (format === 'story') return 'Habere git bağlantısıyla ayrıntıları Teknoblog’da okuyun.';
  return 'En önemli ayrıntıları kaydırarak inceleyin; gönderiyi daha sonra dönmek için kaydedin.';
}
function captionFor(item = {}, format = 'feed') {
  const hook = hookFor(item, format);
  const summary = summaryFor(item);
  const context = summary || `${clean(item.title)} hakkında öne çıkan ayrıntıları Teknoblog odağıyla derledik.`;
  const searchLine = keywords(item).join(' · ');
  return `${hook}\n\n${context}\n\n${ctaFor(item, format)}\n\n${searchLine}`;
}
function storyPlan(item = {}) {
  return {
    overlay_text: hookFor(item, 'story').slice(0, 92),
    supporting_text: summaryFor(item).slice(0, 150) || 'Gelişmenin öne çıkan ayrıntıları Teknoblog’da.',
    sticker_text: 'Haberi oku',
    urgency: ageHours(item) <= 3 ? 'Hemen paylaş' : ageHours(item) <= 8 ? 'Bugün paylaş' : 'Gün içinde paylaş'
  };
}
function reelPlan(item = {}) {
  return [
    `0–3 sn · Kanca: ${hookFor(item, 'reels').slice(0, 100)}`,
    '3–12 sn · Gelişmenin ne olduğunu tek cümlede anlat',
    '12–28 sn · Kullanıcıya etkisini görsel veya ekran kaydıyla göster',
    '28–42 sn · En önemli ayrıntıyı ve varsa Türkiye bilgisini ver',
    '42–50 sn · Yorum sorusu ve Teknoblog yönlendirmesiyle bitir'
  ];
}
function carouselPlan(item = {}) {
  const text = textOf(item);
  const middle = /fiyat|indirim|zam/i.test(text) ? 'Fiyat, erişim ve satın alma etkisi' : /güncelleme|özellik|beta/i.test(text) ? 'Yeni özellikler ve kimlerin yararlanacağı' : 'Kullanıcıya ve sektöre etkisi';
  return [`Kapak · ${hookFor(item, 'feed').slice(0, 92)}`, 'Ne oldu?', middle, 'Bilinmesi gereken önemli ayrıntı', 'Teknoblog’da devamı + kaydet/paylaş çağrısı'];
}

function decorate(item = {}) {
  const story = storyScore(item);
  const reels = reelsScore(item);
  const feed = feedScore(item);
  const best = story >= reels && story >= feed ? 'story' : reels >= feed ? 'reels' : 'carousel';
  return {
    ...item,
    age_hours: Math.round(ageHours(item) * 10) / 10,
    story_score: story,
    reels_score: reels,
    feed_score: feed,
    instagram_score: Math.max(story, reels, feed),
    best_format: best,
    search_keywords: keywords(item),
    story_plan: storyPlan(item),
    reel_plan: reelPlan(item),
    carousel_plan: carouselPlan(item),
    reels_caption: captionFor(item, 'reels'),
    feed_caption: captionFor(item, 'feed'),
    why_story: `${ageHours(item) <= 6 ? 'Çok güncel' : 'Güncel'} Teknoblog yayını${URGENT.test(textOf(item)) ? ', güçlü haber anı taşıyor' : ''}${hasImage(item) ? ' ve görseli hazır' : ''}.`,
    why_reels: `${REELS.test(textOf(item)) ? 'Gösterilebilir/demonstratif bir anlatı taşıyor' : 'Kısa videoda hızlı açıklanabilir'}${hasImage(item) ? '; görsel desteği var' : ''}.`,
    why_feed: `${SAVE_SHARE.test(textOf(item)) ? 'Kaydetme ve paylaşma niyeti üreten açıklayıcı yapı' : 'Akışta özetlenebilir haber değeri'} taşıyor.`
  };
}

function unique(items = [], limit = 10) {
  const seen = new Set();
  const seenTitles = [];
  return items.filter((item) => {
    const key = String(item.url || item.title || '').replace(/\/+$/, '').toLowerCase();
    if (!key || seen.has(key)) return false;
    const words = titleTokens(item.title);
    const models = words.filter((word) => /\d/.test(word));
    const duplicateTopic = seenTitles.some((previous) => {
      const previousModels = previous.filter((word) => /\d/.test(word));
      const sharedModel = models.some((word) => previousModels.includes(word));
      const sharedSpecificModel = models.some((word) => /[a-z]/i.test(word) && /\d/.test(word) && previousModels.includes(word));
      if (models.length && previousModels.length && !sharedModel) return false;
      const previousSet = new Set(previous);
      const common = words.filter((word) => previousSet.has(word)).length;
      return (sharedSpecificModel && common >= 2) || (sharedModel && common >= 3) || common / Math.max(1, Math.min(words.length, previous.length)) >= .72;
    });
    if (duplicateTopic) return false;
    seen.add(key); seenTitles.push(words); return true;
  }).slice(0, limit);
}

async function loadOwned() {
  const result = await queryLocal(`SELECT t.title,t.url,t.excerpt AS summary,t.image_url,t.published_at,t.updated_at,
    COALESCE(p.discover_clicks,0)::int AS discover_clicks,COALESCE(p.discover_impressions,0)::int AS discover_impressions,
    COALESCE(p.google_news_clicks,0)::int AS google_news_clicks,COALESCE(p.google_news_impressions,0)::int AS google_news_impressions,
    COALESCE(p.web_clicks,0)::int AS web_clicks,COALESCE(p.web_impressions,0)::int AS web_impressions
    FROM teknoblog_content t LEFT JOIN published_performance p
      ON regexp_replace(t.url,'/+$','')=regexp_replace(p.url,'/+$','')
    WHERE t.published_at>=NOW()-INTERVAL '48 hours' ORDER BY t.published_at DESC LIMIT 160`);
  return result.rows.map((item) => ({ ...item, source_name: 'Teknoblog', is_teknoblog: true, content_origin: 'published' }));
}

async function loadLiveOwned() {
  if (liveOwnedCache.expiresAt > Date.now() && liveOwnedCache.items.length) return liveOwnedCache.items;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (type) => parts.find((entry) => entry.type === type)?.value || '01';
    const day = `${part('year')}-${part('month')}-${part('day')}`;
    const url = new URL('https://www.teknoblog.com/wp-json/wp/v2/posts');
    url.searchParams.set('after', `${day}T00:00:00+03:00`);
    url.searchParams.set('before', `${day}T23:59:59+03:00`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', '1');
    url.searchParams.set('_fields', 'id,link,date,title,excerpt,featured_media');
    url.searchParams.set('orderby', 'date');
    url.searchParams.set('order', 'desc');
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 TeknoblogRadarInstagram/1.0', accept: 'application/json, */*;q=0.8' }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Teknoblog API HTTP ${response.status}`);
    const posts = await response.json();
    const mediaIds = [...new Set((posts || []).map((post) => Number(post.featured_media) || 0).filter(Boolean))].slice(0, 100);
    const mediaMap = new Map();
    if (mediaIds.length) {
      try {
        const mediaUrl = new URL('https://www.teknoblog.com/wp-json/wp/v2/media');
        mediaUrl.searchParams.set('include', mediaIds.join(','));
        mediaUrl.searchParams.set('per_page', '100');
        mediaUrl.searchParams.set('_fields', 'id,source_url');
        const mediaResponse = await fetch(mediaUrl, { headers: { 'user-agent': 'Mozilla/5.0 TeknoblogRadarInstagram/1.0', accept: 'application/json, */*;q=0.8' }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
        if (mediaResponse.ok) {
          for (const media of await mediaResponse.json()) mediaMap.set(Number(media.id), media.source_url || '');
        }
      } catch {}
    }
    const items = (posts || []).map((post) => ({
      title: clean(post?.title?.rendered || ''),
      url: post.link || '',
      summary: clean(post?.excerpt?.rendered || ''),
      image_url: mediaMap.get(Number(post.featured_media)) || '',
      published_at: post.date ? `${post.date}+03:00` : null,
      source_name: 'Teknoblog', is_teknoblog: true, content_origin: 'published_live'
    })).filter((item) => item.title && item.url && ageHours(item) <= MAX_OWNED_HOURS);
    liveOwnedCache = { expiresAt: Date.now() + 5 * 60 * 1000, items };
    return items;
  } catch { return liveOwnedCache.items || []; }
}

async function loadCandidates() {
  const result = await queryLocal(`SELECT title,url,source_name,image_url,published_at,created_at,summary,excerpt,
    discover_score,traffic_score,social_score,editorial_score,total_score
    FROM topic_candidates WHERE status='active' AND COALESCE(published_at,created_at)>=NOW()-INTERVAL '24 hours'
    ORDER BY COALESCE(published_at,created_at) DESC LIMIT 1200`);
  return result.rows.filter((item) => TECH.test(textOf(item)) && !NOISE.test(textOf(item)))
    .map((item) => ({ ...item, is_teknoblog: /teknoblog/i.test(item.source_name || ''), content_origin: 'radar' }));
}

export default async function handler(req, res) {
  try {
    const limit = Math.min(18, Math.max(5, Number(req.query?.limit || 10)));
    const [ownedRaw, liveOwnedRaw, candidateRaw] = await Promise.all([loadOwned(), loadLiveOwned(), loadCandidates()]);
    const storedByUrl = new Map(ownedRaw.map((item) => [urlKey(item.url), item]));
    const liveKeys = new Set(liveOwnedRaw.map((item) => urlKey(item.url)));
    const mergedOwned = [
      ...liveOwnedRaw.map((item) => {
        const stored = storedByUrl.get(urlKey(item.url)) || {};
        return { ...stored, ...item, image_url: item.image_url || stored.image_url || '' };
      }),
      ...ownedRaw.filter((item) => !liveKeys.has(urlKey(item.url)))
    ];
    const owned = unique(mergedOwned.map(decorate).sort((a, b) => a.age_hours - b.age_hours), 160);
    const candidates = unique(candidateRaw.map(decorate), 1200);
    const combined = unique([...owned, ...candidates], 1300);

    const story = unique(owned.filter((item) => item.age_hours <= 24 && item.story_score >= 50).sort((a, b) => b.story_score - a.story_score || a.age_hours - b.age_hours), limit);
    const reels = unique(combined.filter((item) => item.age_hours <= 24 && item.reels_score >= 46)
      .sort((a, b) => b.reels_score - a.reels_score || a.age_hours - b.age_hours), limit);
    const reelUrls = new Set(reels.map((item) => item.url));
    const feed = unique(combined.filter((item) => item.age_hours <= 24 && item.feed_score >= 46 && !reelUrls.has(item.url))
      .sort((a, b) => b.feed_score - a.feed_score || a.age_hours - b.age_hours), limit);
    const published = unique(owned.sort((a, b) => b.feed_score - a.feed_score || a.age_hours - b.age_hours), limit);
    const today = istanbulDay();
    const dailyItems = unique(owned.filter((item) => istanbulDay(item.published_at) === today).map((item) => {
      const signal = digestSignals(item);
      return { ...item, digest_score: digestScore(item), digest_summary: digestSummary(item), read_signal_available: signal.available, total_clicks: signal.clicks, total_impressions: signal.impressions };
    }).sort((a, b) => b.digest_score - a.digest_score || b.total_clicks - a.total_clicks || a.age_hours - b.age_hours), 5);
    const actualSignalCount = dailyItems.filter((item) => item.read_signal_available).length;
    const dailyDigest = {
      items: dailyItems,
      whatsapp_template: channelTemplate(dailyItems, 'whatsapp'),
      instagram_template: channelTemplate(dailyItems, 'instagram'),
      ranking_basis: actualSignalCount
        ? 'Mevcut Search Console, Discover ve Google News etkileşimi; güncellik ve editoryal önemle birlikte değerlendirildi.'
        : 'Bugünün performans verileri henüz oluşmadığı için güncellik, editoryal önem, teknoloji odağı ve paylaşılabilirlik kullanıldı.',
      actual_signal_count: actualSignalCount,
      generated_at: nowIso()
    };

    return json(res, 200, {
      story, reels, feed, published, daily_digest: dailyDigest,
      items: feed,
      counts: { story: story.length, reels: reels.length, feed: feed.length, published: published.length, digest: dailyItems.length },
      windows: { story_hours: 24, radar_hours: MAX_CANDIDATE_HOURS, published_hours: MAX_OWNED_HOURS },
      refreshed_at: nowIso(),
      scoring: {
        story: ['Teknoblog’da yayımlanmış olma', 'tazelik', 'haber anı', 'görsel', 'Discover ve News sinyali'],
        reels: ['gösterilebilirlik', 'video kancası', 'sosyal ilgi', 'görsel', 'tazelik'],
        feed: ['kaydetme/paylaşma niyeti', 'arama bağlamı', 'karusel açıklanabilirliği', 'Discover sinyali', 'görsel']
      },
      note: 'Puanlar format uygunluğunu önceliklendirir; Instagram dağıtımı garanti edilemez.'
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error), at: nowIso(), story: [], reels: [], feed: [], published: [] });
  }
}
