import { chooseFeedUrl, hashValue, json, parseFeedItems, queryLocal, safeText } from './_lib.js';

const CACHE_MINUTES = 20;
const FETCH_TIMEOUT = 12000;
const MAX_ARTICLES = 80;
const ALGORITHM_VERSION = 'product-radar-v3-wide';

const BRAND_REGISTRY = [
  ['Apple', /\bapple\b|apple\.com/], ['Samsung', /\bsamsung\b|galaxy/], ['Google', /\bgoogle\b|android|pixel/],
  ['Microsoft', /\bmicrosoft\b|windows|copilot|surface|xbox/], ['OpenAI', /\bopenai\b|chatgpt|\bgpt\b/], ['NVIDIA', /\bnvidia\b|geforce/],
  ['Garmin', /\bgarmin\b|\bcirqa\b/], ['Fitbit', /\bfitbit\b/], ['Polar', /\bpolar\b/], ['WHOOP', /\bwhoop\b/], ['Oura', /\boura\b/],
  ['Amazfit', /\bamazfit\b/], ['Suunto', /\bsuunto\b/], ['COROS', /\bcoros\b/], ['Huawei', /\bhuawei\b/], ['Xiaomi', /\bxiaomi\b|\bredmi\b/],
  ['Honor', /\bhonor\b/], ['OPPO', /\boppo\b/], ['OnePlus', /\boneplus\b/], ['vivo', /\bvivo\b/], ['realme', /\brealme\b/],
  ['Nothing', /\bnothing\b/], ['Motorola', /\bmotorola\b|\bmoto\b/], ['Sony', /\bsony\b|playstation/], ['Nintendo', /\bnintendo\b/],
  ['Valve', /\bvalve\b|steam deck/], ['ASUS', /\basus\b|\brog\b/], ['Acer', /\bacer\b/], ['Lenovo', /\blenovo\b|thinkpad/],
  ['Dell', /\bdell\b|alienware/], ['HP', /\bhp\b|hewlett.packard|omen/], ['MSI', /\bmsi\b/], ['Razer', /\brazer\b/],
  ['Logitech', /\blogitech\b/], ['Intel', /\bintel\b/], ['AMD', /\bamd\b|\bryzen\b|\bradeon\b/], ['Qualcomm', /\bqualcomm\b|snapdragon/],
  ['MediaTek', /\bmediatek\b|dimensity/], ['Arm', /\barm\b/], ['Meta', /\bmeta\b|quest|instagram|whatsapp/], ['Amazon', /\bamazon\b|\balexa\b|\bkindle\b/],
  ['Anthropic', /\banthropic\b|\bclaude\b/], ['Adobe', /\badobe\b/], ['DJI', /\bdji\b/], ['GoPro', /\bgopro\b/],
  ['Canon', /\bcanon\b/], ['Nikon', /\bnikon\b/], ['Fujifilm', /\bfujifilm\b|\bfuji\b/], ['Tesla', /\btesla\b/],
  ['Rivian', /\brivian\b/], ['BYD', /\bbyd\b/], ['Bose', /\bbose\b/], ['Sonos', /\bsonos\b/], ['JBL', /\bjbl\b/],
  ['Philips Hue', /philips hue|\bsignify\b/], ['GitHub', /\bgithub\b/], ['Cloudflare', /\bcloudflare\b/]
];

const OFFICIAL_DISCOVERY_GROUPS = [
  ['wearables-mobile', ['garmin.com/en-US/newsroom', 'news.samsung.com/global', 'consumer.huawei.com/en/press', 'mi.com/global/event', 'oneplus.com/global/launch', 'nothing.tech/pages/newsroom']],
  ['computing', ['newsroom.intel.com', 'amd.com/en/newsroom', 'qualcomm.com/news/releases', 'news.lenovo.com', 'asus.com/news', 'news.acer.com']],
  ['ai-platforms', ['openai.com/index', 'blog.google/technology', 'blogs.microsoft.com', 'about.fb.com/news', 'anthropic.com/news', 'news.adobe.com']],
  ['gaming', ['blog.playstation.com', 'news.xbox.com', 'nintendo.com/us/whatsnew', 'store.steampowered.com/news', 'razer.com/newsroom']],
  ['camera-audio', ['dji.com/media-center', 'gopro.com/en/us/news', 'global.canon/en/news', 'nikon.com/company/news', 'bose.com/pressroom', 'sonos.com/en-us/newsroom']],
  ['devices-auto', ['aboutamazon.com/news/devices', 'tesla.com/blog', 'rivian.com/newsroom', 'bydglobal.com/en/news', 'media.ford.com', 'newsroom.porsche.com']],
  ['mobile-makers', ['oppo.com/en/newsroom', 'vivo.com/en/about-vivo/news', 'realme.com/global/newsroom', 'motorola.com/blog', 'honor.com/global/news']],
  ['hardware-home', ['nvidia.com/en-us/geforce/news', 'logitech.com/blog', 'newsroom.hp.com', 'dell.com/en-us/blog', 'signify.com/global/our-company/news/press-releases']]
];

const FALLBACK_OFFICIAL_SOURCES = [
  { id: 'apple-newsroom', name: 'Apple Newsroom', feed_url: 'https://www.apple.com/newsroom/rss-feed.rss', site_url: 'https://www.apple.com/newsroom/', source_type: 'official' },
  { id: 'openai-news', name: 'OpenAI News', feed_url: 'https://openai.com/news/rss.xml', site_url: 'https://openai.com/news', source_type: 'official' },
  { id: 'google-blog', name: 'Google Blog', feed_url: 'https://blog.google/rss/', site_url: 'https://blog.google', source_type: 'official' },
  { id: 'microsoft-blog', name: 'Microsoft Blog', feed_url: 'https://blogs.microsoft.com/feed/', site_url: 'https://blogs.microsoft.com', source_type: 'official' },
  { id: 'nvidia-blog', name: 'NVIDIA Blog', feed_url: 'https://blogs.nvidia.com/feed/', site_url: 'https://blogs.nvidia.com', source_type: 'official' },
  { id: 'android-developers', name: 'Android Developers', feed_url: 'https://android-developers.googleblog.com/feeds/posts/default', site_url: 'https://android-developers.googleblog.com', source_type: 'official' },
  { id: 'github-blog', name: 'GitHub Blog', feed_url: 'https://github.blog/feed/', site_url: 'https://github.blog', source_type: 'official' },
  { id: 'cloudflare-blog', name: 'Cloudflare Blog', feed_url: 'https://blog.cloudflare.com/rss/', site_url: 'https://blog.cloudflare.com', source_type: 'official' }
];

const OFFICIAL_YOUTUBE_FEEDS = [
  { brand: 'Apple', name: 'Apple', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCE_M8A5yxnLfW0KghEeajjw' },
  { brand: 'Google', name: 'Google', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCK8sQmJBp8GCxrOtXWBpyEA' },
  { brand: 'Google', name: 'Google for Developers', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw' },
  { brand: 'OpenAI', name: 'OpenAI', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCXZCJLdBC09xxGZ6gcdrc6A' },
  { brand: 'Microsoft', name: 'Microsoft', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCFtEEv80fQVKkD4h1PF-Xqw' }
];

const LAUNCH_STRONG = /\b(announce[sd]?|introduc(?:e[sd]?|ing)|unveil(?:s|ed)?|launch(?:es|ed|ing)?|debut(?:s|ed)?|release[sd]?|available now|meet the new|present(?:s|ed)?|duyur(?:du|uyor)|tanıt(?:tı|ıyor)|lansman|satışa sun(?:du|uluyor)|kullanıma sun(?:du|uluyor)|yeni ürün|yeni hizmet)\b/i;
const LAUNCH_OBJECT = /\b(product|device|phone|smartphone|tablet|laptop|notebook|headset|watch|smartwatch|tracker|smart band|fitness band|wearable|earbuds?|headphones?|camera|lens|chip|chipset|processor|gpu|soc|display|monitor|rangefinder|drone|router|platform|service|subscription|app|application|model|api|feature|update|console|controller|robot|vehicle|car|smart ring|glasses|flight deck|appliance|tv|streaming device|ürün|cihaz|telefon|kulaklık|saat|bileklik|takip cihazı|işlemci|ekran kartı|monitör|kamera|platform|hizmet|uygulama|model|özellik|güncelleme|otomobil)\b/i;
const EXCLUDE = /\b(earnings|quarterly results|investor|dividend|policy update|event recap|interview|podcast|award|careers?|hiring|research paper|vulnerability|security bulletin|finansal sonuç|yatırımcı|ödül|röportaj|iş ilanı)\b/i;
const SERVICE = /\b(service|subscription|platform|api|app|application|software|feature|update|cloud|model|assistant|hizmet|abonelik|platform|uygulama|yazılım|özellik|güncelleme|bulut|yapay zek[âa] modeli)\b/i;
const NAMED_PRODUCT = /\b(chatgpt|gpt[- ]?\d|gemini|galaxy|iphone|ipad|macbook|imac|mac mini|apple watch|vision pro|pixel(?: \d+)?|android \d+|windows \d+|copilot|surface|xbox|playstation|geforce|rtx ?\d+|github copilot|cloudflare workers?)\b/i;
const GUIDE_TITLE = /^(build|building|how to|using|create|creating|get started|a guide|developer|protect|protecting|integrate|integrating)\b/i;
const STOP = new Set('the a an and or for with from this that new now its our your to of in on by as is are be ile ve veya bir yeni için olan olarak da de bu şu'.split(' '));

function authorized(req) {
  const expected = process.env.CRON_TOKEN || '';
  const supplied = String(req.query?.token || req.headers?.['x-cron-token'] || '');
  return Boolean(expected && supplied && supplied === expected);
}

function normalizeUrl(value = '') {
  try { const url = new URL(String(value).replace(/\\\//g, '/').replace(/&amp;/g, '&')); url.hash = ''; return url.toString(); } catch { return ''; }
}

function brandFor(source = {}, text = '') {
  const haystack = `${source.name || ''} ${source.site_url || ''} ${text}`.toLowerCase();
  return BRAND_REGISTRY.find(([, pattern]) => pattern.test(haystack))?.[0] || String(source.name || '').replace(/\s+(Newsroom|News|Blog|Developers).*$/i, '').trim() || 'Diğer';
}

function cleanDiscoveryTitle(value = '') {
  return safeText(value).replace(/\s+-\s+[^-]{2,80}$/u, '').trim();
}

function productKey(item) {
  const normalized = cleanDiscoveryTitle(item.title).toLowerCase()
    .replace(LAUNCH_STRONG, ' ').replace(/[^a-z0-9çğıöşüâ]+/gi, ' ').replace(/\s+/g, ' ').trim();
  return `${item.brand}:${normalized}`;
}

function launchCandidate(item, source) {
  const discovery = Boolean(source.is_discovery);
  const rawTitle = safeText(item.title || '');
  const title = discovery ? cleanDiscoveryTitle(rawTitle) : rawTitle;
  const text = safeText(`${title} ${item.summary || ''}`);
  if (!item.url || !item.title || EXCLUDE.test(text)) return null;
  const strong = LAUNCH_STRONG.test(text);
  const object = LAUNCH_OBJECT.test(text);
  const titleStrong = LAUNCH_STRONG.test(title);
  const namedProduct = NAMED_PRODUCT.test(title);
  if (!strong || !object || (!discovery && !titleStrong && (!namedProduct || GUIDE_TITLE.test(title)))) return null;
  const published = new Date(item.published_at || 0);
  if (!Number.isFinite(published.getTime()) || Date.now() - published.getTime() > 14 * 86400000) return null;
  const ageHours = Math.max(0, (Date.now() - published.getTime()) / 3600000);
  const brand = brandFor(source, text);
  if (discovery && brand === 'Diğer') return null;
  const reasons = [discovery ? 'Resmî üretici alan adı üzerinden keşfedildi' : 'Doğrudan resmî üretici kaynağı', titleStrong ? 'Başlık doğrudan lansman bildiriyor' : 'Tanımlı ürün/hizmet adı içeriyor'];
  if (ageHours <= 6) reasons.push('Son 6 saatte yayımlandı');
  else if (ageHours <= 24) reasons.push('Son 24 saatte yayımlandı');
  const freshness = Math.max(3, Math.round(28 - ageHours * 0.35));
  const score = Math.min(96, Math.round(39 + freshness + (titleStrong ? 12 : 5) + (namedProduct ? 8 : 3) + (discovery ? 7 : 10) + (item.image_url ? 5 : 0)));
  const url = normalizeUrl(item.url);
  if (!url) return null;
  return { fingerprint: hashValue(url), title, summary: safeText(item.summary || '').slice(0, 1200), url, image_url: normalizeUrl(item.image_url), brand, launch_type: SERVICE.test(text) ? 'service' : 'product', source_name: discovery ? `${brand} · Resmî duyuru` : source.name, official_source_url: source.site_url || item.url, published_at: published.toISOString(), launch_score: score, reasons, _direct: !discovery };
}

async function fetchText(url, accept = 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8') {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT), headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; TeknoblogRadar/2.0; +https://www.teknoblog.com)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function videoIdFromUrl(value = '') {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
    if (/youtube\.com$/i.test(url.hostname.replace(/^www\./, ''))) return url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/i)?.[1] || '';
  } catch {}
  return '';
}

function socialLinks(html = '') {
  const decoded = String(html).replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const pattern = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)[^"'<>\s\\]+|youtu\.be\/[^"'<>\s\\]+|(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+[^"'<>\s\\]*|instagram\.com\/(?:p|reel|tv)\/[^"'<>\s\\]+)/gi;
  const out = [];
  for (const raw of decoded.match(pattern) || []) {
    const url = normalizeUrl(raw.replace(/[),.;]+$/, ''));
    if (!url || out.some((item) => item.url === url)) continue;
    const platform = /youtu/i.test(url) ? 'youtube' : /instagram/i.test(url) ? 'instagram' : 'x';
    const id = platform === 'youtube' ? videoIdFromUrl(url) : '';
    out.push({ platform, url, title: '', thumbnail_url: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '', author_name: '', published_at: null, is_official: true });
  }
  return out.slice(0, 8);
}

function tokens(value = '') {
  return [...new Set(safeText(value).toLowerCase().replace(/[^a-z0-9çğıöşüâ]+/gi, ' ').split(/\s+/).filter((token) => token.length > 2 && !STOP.has(token)))];
}

function matchVideo(launch, video) {
  if (launch.brand !== video.brand) return 0;
  const a = tokens(launch.title); const b = new Set(tokens(video.title));
  const overlap = a.filter((token) => b.has(token)).length;
  return overlap >= 2 ? overlap * 20 + (LAUNCH_STRONG.test(video.title) ? 10 : 0) : 0;
}

async function youtubeVideos() {
  const results = await Promise.allSettled(OFFICIAL_YOUTUBE_FEEDS.map(async (channel) => {
    const xml = await fetchText(channel.url, 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8');
    return parseFeedItems(xml).slice(0, 15).map((item) => {
      const id = videoIdFromUrl(item.url);
      return { ...item, brand: channel.brand, author_name: channel.name, platform: 'youtube', thumbnail_url: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : item.image_url || '', is_official: true };
    });
  }));
  return results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
}

function discoveryFeed(group, domains) {
  const sites = domains.map((domain) => `site:${domain}`).join(' OR ');
  const q = `(${sites}) (announces OR unveils OR introduces OR launches OR "available now" OR "meet the new") when:7d`;
  const params = new URLSearchParams({ q, hl: 'en-US', gl: 'US', ceid: 'US:en' });
  return { id: `official-discovery-${group}`, name: `Resmî Üretici Keşfi · ${group}`, feed_url: `https://news.google.com/rss/search?${params}`, site_url: '', source_type: 'official-discovery', is_discovery: true };
}

async function sourceList() {
  const rows = (await queryLocal(`SELECT id,name,COALESCE(rss_url,feed_url) AS feed_url,site_url,source_type FROM sources WHERE is_active=TRUE AND source_type='official' ORDER BY priority_weight DESC LIMIT 30`)).rows;
  const merged = [...rows];
  for (const source of FALLBACK_OFFICIAL_SOURCES) if (!merged.some((item) => item.id === source.id || chooseFeedUrl(item) === source.feed_url)) merged.push(source);
  for (const [group, domains] of OFFICIAL_DISCOVERY_GROUPS) merged.push(discoveryFeed(group, domains));
  return merged;
}

async function syncRadar() {
  const sources = await sourceList();
  const feedResults = await Promise.allSettled(sources.map(async (source) => {
    const feedUrl = chooseFeedUrl(source);
    if (!feedUrl) return [];
    const xml = await fetchText(feedUrl, 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8');
    return parseFeedItems(xml).map((item) => launchCandidate(item, source)).filter(Boolean);
  }));
  const candidates = feedResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []).sort((a, b) => Number(b._direct) - Number(a._direct) || new Date(b.published_at) - new Date(a.published_at));
  const unique = [...new Map(candidates.map((item) => [productKey(item), item])).values()].sort((a, b) => new Date(b.published_at) - new Date(a.published_at)).slice(0, MAX_ARTICLES);
  const recentVideos = await youtubeVideos();
  const articleResults = await Promise.allSettled(unique.map(async (launch) => ({ url: launch.url, assets: socialLinks(await fetchText(launch.url)) })));
  const articleAssets = new Map(articleResults.flatMap((result) => result.status === 'fulfilled' ? [[result.value.url, result.value.assets]] : []));
  let stored = 0; let assets = 0;
  for (const launch of unique) {
    delete launch._direct;
    const linked = [...(articleAssets.get(launch.url) || [])];
    const directYoutube = linked.some((item) => item.platform === 'youtube');
    if (!directYoutube) {
      const match = recentVideos.map((video) => ({ video, score: matchVideo(launch, video) })).sort((a, b) => b.score - a.score)[0];
      if (match?.score >= 40) linked.push({ platform: 'youtube', url: normalizeUrl(match.video.url), title: match.video.title, thumbnail_url: match.video.thumbnail_url, author_name: match.video.author_name, published_at: match.video.published_at || null, is_official: true });
    }
    if (linked.length) {
      launch.launch_score = Math.min(100, launch.launch_score + Math.min(9, linked.length * 3));
      launch.reasons = [...launch.reasons, `${linked.length} resmî sosyal paylaşım doğrulandı`];
    }
    const row = (await queryLocal(`INSERT INTO product_launches(fingerprint,title,summary,url,image_url,brand,launch_type,source_name,official_source_url,published_at,launch_score,reasons,synced_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,NOW()) ON CONFLICT(url) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),product_launches.image_url),brand=EXCLUDED.brand,launch_type=EXCLUDED.launch_type,source_name=EXCLUDED.source_name,official_source_url=EXCLUDED.official_source_url,published_at=EXCLUDED.published_at,launch_score=EXCLUDED.launch_score,reasons=EXCLUDED.reasons,synced_at=NOW() RETURNING id`, [launch.fingerprint,launch.title,launch.summary,launch.url,launch.image_url,launch.brand,launch.launch_type,launch.source_name,launch.official_source_url,launch.published_at,launch.launch_score,JSON.stringify(launch.reasons)])).rows[0];
    stored += 1;
    for (const asset of linked) {
      if (!asset.url) continue;
      await queryLocal(`INSERT INTO product_social_assets(launch_id,platform,url,title,thumbnail_url,author_name,published_at,is_official) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(url) DO UPDATE SET launch_id=EXCLUDED.launch_id,title=COALESCE(NULLIF(EXCLUDED.title,''),product_social_assets.title),thumbnail_url=COALESCE(NULLIF(EXCLUDED.thumbnail_url,''),product_social_assets.thumbnail_url),author_name=COALESCE(NULLIF(EXCLUDED.author_name,''),product_social_assets.author_name),is_official=TRUE`, [row.id,asset.platform,asset.url,asset.title || '',asset.thumbnail_url || '',asset.author_name || launch.brand,asset.published_at, true]);
      assets += 1;
    }
  }
  if (unique.length) await queryLocal(`DELETE FROM product_launches WHERE published_at>=NOW()-INTERVAL '14 days' AND NOT(url=ANY($1::text[]))`, [unique.map((item) => item.url)]);
  await queryLocal(`DELETE FROM product_launches WHERE published_at<NOW()-INTERVAL '30 days'`);
  await queryLocal(`INSERT INTO product_radar_runs(status,source_count,candidate_count,asset_count,notes) VALUES('completed',$1,$2,$3,$4)`, [sources.length, unique.length, assets, `${ALGORITHM_VERSION};stored=${stored}`]);
  await queryLocal(`DELETE FROM product_radar_runs WHERE created_at<NOW()-INTERVAL '30 days'`);
  return { sources: sources.length, candidates: unique.length, stored, assets, brands_monitored: BRAND_REGISTRY.length, discovery_groups: OFFICIAL_DISCOVERY_GROUPS.length };
}

async function itemsFor(req) {
  const hours = Math.min(168, Math.max(6, Number(req.query?.hours || 72)));
  const type = ['product','service'].includes(String(req.query?.type || '')) ? String(req.query.type) : '';
  const media = ['youtube','instagram','x'].includes(String(req.query?.media || '')) ? String(req.query.media) : '';
  const brand = safeText(req.query?.brand || '').slice(0, 80);
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 48)));
  const params = [hours]; let where = `p.published_at>=NOW()-($1::text||' hours')::interval`;
  if (type) { params.push(type); where += ` AND p.launch_type=$${params.length}`; }
  if (brand) { params.push(brand); where += ` AND p.brand=$${params.length}`; }
  if (media) { params.push(media); where += ` AND EXISTS(SELECT 1 FROM product_social_assets f WHERE f.launch_id=p.id AND f.platform=$${params.length})`; }
  params.push(limit);
  const rows = (await queryLocal(`SELECT p.*,COALESCE(json_agg(json_build_object('platform',a.platform,'url',a.url,'title',a.title,'thumbnail_url',a.thumbnail_url,'author_name',a.author_name,'published_at',a.published_at,'is_official',a.is_official) ORDER BY CASE a.platform WHEN 'youtube' THEN 1 WHEN 'instagram' THEN 2 ELSE 3 END) FILTER(WHERE a.id IS NOT NULL),'[]'::json) AS social_assets FROM product_launches p LEFT JOIN product_social_assets a ON a.launch_id=p.id WHERE ${where} GROUP BY p.id ORDER BY p.launch_score DESC,p.published_at DESC LIMIT $${params.length}`, params)).rows;
  const brandRows = (await queryLocal(`SELECT DISTINCT brand FROM product_launches WHERE published_at>=NOW()-($1::text||' hours')::interval AND brand IS NOT NULL AND brand<>'' ORDER BY brand`, [hours])).rows;
  return { hours, items: rows, brands: brandRows.map((row) => row.brand) };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const last = (await queryLocal(`SELECT created_at AS synced_at FROM product_radar_runs WHERE status='completed' AND notes LIKE $1 ORDER BY created_at DESC LIMIT 1`, [`${ALGORITHM_VERSION};%`])).rows[0];
    const stale = !last?.synced_at || Date.now() - new Date(last.synced_at).getTime() > CACHE_MINUTES * 60000;
    const force = String(req.query?.refresh || '') === '1';
    if (force && !authorized(req)) return json(res, 401, { error: 'Yetkisiz istek' });
    let sync = null;
    if (stale || force) sync = await syncRadar();
    const result = await itemsFor(req);
    return json(res, 200, { ok: true, source: 'Resmî üretici haber odaları, resmî alan adı keşfi ve doğrulanmış sosyal bağlantılar', coverage: { brands_monitored: BRAND_REGISTRY.length, discovery_groups: OFFICIAL_DISCOVERY_GROUPS.length }, refreshed_at: new Date().toISOString(), sync, count: result.items.length, hours: result.hours, brands: result.brands, items: result.items });
  } catch (error) { return json(res, 500, { error: error?.message || String(error) }); }
}
