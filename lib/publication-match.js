const STOP = new Set('ve veya ile için bir bu şu daha yeni son ilk olan olarak göre sonra önce hakkında üzerinde geliyor geldi olacak oldu neden nasıl hangi ne zaman teknoloji tech says report reportedly could may its the and for from with that this have has will into over after before'.split(' '));
const GENERIC = new Set('ekim ocak subat mart nisan mayis haziran temmuz agustos eylul kasim aralik fiyat fiyatlari listesi ozellik ozellikleri tanitildi duyuruldu geldi geliyor aciklandi yeni resmi buyuk onemli guncelleme model modelleri urun cihaz seri surum haber iste pro max ultra mate find 2025 2026 2027 ortaya cikti cikar gecici olarak turkiye turkiyeye elektrikli milyon milyar dolar aldi duyuru yayinlandi cikiyor'.split(' '));
const BRANDS = new Map(Object.entries({ mg:'mg', audi:'audi', volkswagen:'volkswagen', vw:'volkswagen', bmw:'bmw', mercedes:'mercedes', oppo:'oppo', oneplus:'oneplus', xiaomi:'xiaomi', samsung:'samsung', galaxy:'samsung', apple:'apple', iphone:'apple', ipad:'apple', google:'google', pixel:'google', fitbit:'fitbit', youtube:'youtube', microsoft:'microsoft', windows:'microsoft', nvidia:'nvidia', amd:'amd', intel:'intel', huawei:'huawei', honor:'honor', sony:'sony', playstation:'sony', garmin:'garmin', lenovo:'lenovo', asus:'asus', acer:'acer', hp:'hp', lg:'lg', qualcomm:'qualcomm', gran:'gran-turismo', turismo:'gran-turismo', supabase:'supabase', sima:'sima', vivo:'vivo', redmagic:'redmagic', gta:'gta', mova:'mova', angelelli:'angelelli' }));
const ALIASES = new Map(Object.entries({ smart:'akilli', sleep:'uyku', system:'sistem', announced:'tanit', announces:'tanit', announcement:'tanit', tanitildi:'tanit', tanitti:'tanit', tanitiyor:'tanit', available:'sunul', released:'sunul', releases:'sunul', beta:'beta', betas:'beta', public:'public', acik:'public', kaynak:'kaynak', source:'kaynak', software:'yazilim', bug:'hata', bounty:'odul', program:'program', temporarily:'gecici', suspended:'durduruldu', paused:'durduruldu', durdurdu:'durduruldu', added:'ekle', adding:'ekle', adds:'ekle', eklenen:'ekle', ekliyor:'ekle', ekledi:'ekle', comment:'yorum', comments:'yorum', gifler:'gif', repair:'onarim', repairing:'onarim', repairs:'onarim', imaging:'kamera', image:'kamera', images:'kamera', photo:'kamera', photos:'kamera', fotograflari:'kamera', true:'dogal', camera:'kamera', microphone:'mikrofon', microphones:'mikrofon', wireless:'kablosuz', sales:'satis', sold:'satis', selling:'satis', satisa:'satis', satildi:'satis', satislar:'satis', satislari:'satis', adedi:'adet', update:'guncelleme', updates:'guncelleme', updated:'guncelleme', support:'destek', supports:'destek', supported:'destek', health:'health', coach:'koc', coaching:'koc', running:'kosu', chip:'islemci', processor:'islemci', benchmarked:'benchmark', geekbench:'benchmark', controller:'kontrolcu', display:'ekran', screen:'ekran', kullanicisi:'kullanici', kullanicilarinin:'kullanici', kullanici:'kullanici', sayisinin:'sayi', sayisi:'sayi', bekleme:'bekleme', suresini:'sure', suresi:'sure', ram:'ram' }));

function plain(value = '') {
  return String(value).toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ıİ]/g, 'i').replace(/ğ/g, 'g').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u');
}

function canonicalUrl(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    url.search = '';
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch { return ''; }
}

function normalizedWord(word = '') {
  let value = ALIASES.get(word) || word;
  if (BRANDS.has(value) || /\d/.test(value) || value.length <= 5) return value;
  const suffixes = ['larinin', 'lerinin', 'larina', 'lerine', 'larini', 'lerini', 'lari', 'leri', 'lar', 'ler', 'sinin', 'sunun', 'unun', 'inin', 'nin', 'nun', 'dan', 'den', 'dir', 'tir', 'yor', 'yla', 'yle', 'si', 'su'];
  for (const suffix of suffixes) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 4) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }
  return ALIASES.get(value) || value;
}

function words(value = '') {
  return [...new Set(plain(value).replace(/[^a-z0-9.\s]/gi, ' ').split(/\s+/).map((word) => word.replace(/^\.+|\.+$/g, ''))
    .map(normalizedWord)
    .filter((word) => (word.length >= 3 || /^\d{1,4}$/.test(word) || BRANDS.has(word)) && !STOP.has(word)))];
}

export function publicationTerms(value = '') { return words(value).filter((word) => !GENERIC.has(word)); }

function facets(value) {
  const title = plain(value);
  const patterns = {
    review: /\b(inceleme|review)\b/,
    sale: /\b(satisa|satis|fiyat|price)\b/,
    performance: /\b(performans|benchmark|test sonuclari)\b/,
    camera: /\b(kamera|camera|imaging|sensor)\b/,
    design: /\b(tasarim|design|boyut|dimension)\b/,
    leadership: /\b(ceo|mudur|yonetici|gorevi devraldi)\b/,
    agreement: /\b(patent|anlasma|agreement)\b/,
    funding: /\b(yatirim|funding|investment)\b/,
    rating: /\b(yas siniri|age rating|rating)\b/,
    release: /\b(beta|guncelleme|update)\b/,
    memory: /\b(ram|bellek|memory)\b/,
    comparison: /\b(vs|versus|beats|rival|karsilastir)/,
    launch: /\b(launch|tanitil|duyurul|piyasaya sur)/,
    sales: /\b(satislar|satislari|sales|deal|geriledi)/
  };
  return new Set(Object.entries(patterns).filter(([, pattern]) => pattern.test(title)).map(([facet]) => facet));
}

function brandSet(tokens) {
  return new Set(tokens.map((token) => BRANDS.get(token)).filter(Boolean));
}

function modelIdentifiers(value = '') {
  const title = plain(value);
  const found = new Set();
  for (const token of title.match(/[a-z0-9.]+/g) || []) {
    if ((/[a-z]/.test(token) && /\d/.test(token)) || /^\d+[.]\d+$/.test(token)) found.add(token);
  }
  const productVersion = /\b(ios|ipados|android|pixel|iphone|ipad|galaxy|oneplus|xiaomi|redmi|poco|watch|mate|find|reno|honor|magic|rtx|gtx|snapdragon)\s+([a-z]?\d+(?:[.]\d+)*)/g;
  for (const match of title.matchAll(productVersion)) found.add(`${match[1]}:${match[2]}`);
  return found;
}

const ANALYSIS_CACHE = new Map();
function titleAnalysis(value = '') {
  const key = String(value || '');
  const cached = ANALYSIS_CACHE.get(key);
  if (cached) return cached;
  const tokens = words(key);
  const result = { tokens, brands: brandSet(tokens), models: modelIdentifiers(key), titleFacets: facets(key),
    version: plain(key).match(/\b(ios|ipados|android)\s+(\d+(?:[.]\d+)*)\s*(?:beta\s*(\d+))?/) };
  if (ANALYSIS_CACHE.size >= 12000) ANALYSIS_CACHE.clear();
  ANALYSIS_CACHE.set(key, result);
  return result;
}

export function publicationMatch(leftTitle = '', rightTitle = '', leftUrl = '', rightUrl = '') {
  const leftCanonical = canonicalUrl(leftUrl);
  if (leftCanonical && leftCanonical === canonicalUrl(rightUrl)) return { accepted: true, score: 1, common: 99, reason: 'url' };
  const leftAnalysis = titleAnalysis(leftTitle);
  const rightAnalysis = titleAnalysis(rightTitle);
  const left = leftAnalysis.tokens;
  const right = rightAnalysis.tokens;
  if (!left.length || !right.length) return { accepted: false, score: 0, common: 0, reason: 'empty' };
  const leftBrands = leftAnalysis.brands;
  const rightBrands = rightAnalysis.brands;
  if (leftBrands.size && rightBrands.size && ![...leftBrands].some((brand) => rightBrands.has(brand))) {
    return { accepted: false, score: 0, common: 0, reason: 'brand_mismatch' };
  }
  if (leftBrands.size && rightBrands.size && (leftBrands.size !== rightBrands.size ||
    ![...leftBrands].every((brand) => rightBrands.has(brand)))) {
    return { accepted: false, score: 0, common: 0, reason: 'entity_mismatch' };
  }
  const rightSet = new Set(right);
  const commonTokens = left.filter((word) => rightSet.has(word));
  const common = commonTokens.length;
  const containment = common / Math.max(1, Math.min(left.length, right.length));
  const jaccard = common / Math.max(1, new Set([...left, ...right]).size);
  const score = containment * .72 + jaccard * .28;
  const modelLike = (word) => /\d/.test(word) && !/^20\d\d$/.test(word);
  const leftModels = [...leftAnalysis.models];
  const rightModels = [...rightAnalysis.models];
  if (leftModels.length && rightModels.length && !leftModels.some((word) => rightModels.includes(word))) {
    return { accepted: false, score: score * .2, common, reason: 'model_mismatch' };
  }
  const sharedSubject = commonTokens.filter((word) => !GENERIC.has(word) && !BRANDS.has(word) && !modelLike(word));
  const sharedBrand = [...leftBrands].some((brand) => rightBrands.has(brand));
  const exactTitle = left.join(' ') === right.join(' ');
  const sharedModel = leftModels.some((word) => rightModels.includes(word));
  const leftFacets = leftAnalysis.titleFacets;
  const rightFacets = rightAnalysis.titleFacets;
  if (!exactTitle && leftFacets.size && rightFacets.size && ![...leftFacets].some((facet) => rightFacets.has(facet))) {
    return { accepted: false, score, common, reason: 'different_event' };
  }
  const leftVersion = leftAnalysis.version;
  const rightVersion = rightAnalysis.version;
  if (leftVersion && rightVersion && leftVersion[1] === rightVersion[1] &&
    (leftVersion[2] !== rightVersion[2] || (leftVersion[3] && rightVersion[3] && leftVersion[3] !== rightVersion[3]))) {
    return { accepted: false, score, common, reason: 'version_mismatch' };
  }
  const strongSubject = common >= 3 && ((sharedSubject.length >= 3 && score >= .38) || (sharedSubject.length >= 2 && score >= .55));
  const namedModel = sharedModel && leftModels.some((word) => rightModels.includes(word) && /[a-z]/.test(word));
  const sameFacet = [...leftFacets].some((facet) => rightFacets.has(facet));
  const modelEvent = namedModel && sharedBrand && common >= 3 && (sharedSubject.length >= 3 || (sameFacet && sharedSubject.length >= 2));
  const versionedProduct = sharedModel && sharedBrand && common >= 3 && sharedSubject.length >= 1
    && leftModels.some((word) => word.includes('.') && rightModels.includes(word)) && score >= .3;
  const distinctiveEvent = sharedSubject.length >= 3 && common >= 3 && containment >= .3;
  const sharedBrandCount = [...leftBrands].filter((brand) => rightBrands.has(brand)).length;
  const multiEntityEvent = sharedBrandCount >= 2 && sharedSubject.length >= 1 && common >= 3 && score >= .4
    && ((!leftModels.length && !rightModels.length) || sharedModel);
  const accepted = exactTitle || strongSubject || modelEvent || versionedProduct || distinctiveEvent || multiEntityEvent;
  return { accepted, score: exactTitle ? 1 : score, common,
    reason: accepted ? (exactTitle ? 'title_exact' : 'title_strong') : 'weak' };
}
