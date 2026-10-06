const STOP = new Set('ve veya ile için bir bu şu daha yeni son ilk olan olarak göre sonra önce hakkında üzerinde geliyor geldi olacak oldu neden nasıl hangi ne zaman teknoloji tech says report reportedly could may its the and for from with that this have has will into over after before'.split(' '));
const GENERIC = new Set('ekim ocak subat mart nisan mayis haziran temmuz agustos eylul kasim aralik fiyat fiyatlari listesi ozellik ozellikleri tanitildi duyuruldu geldi geliyor aciklandi yeni resmi buyuk onemli guncelleme model modelleri urun cihaz seri surum haber iste 2025 2026 2027 ortaya cikti cikar gecici olarak turkiye turkiyeye elektrikli milyon milyar dolar aldi duyuru yayinlandi cikiyor'.split(' '));
const BRANDS = new Map(Object.entries({ mg:'mg', audi:'audi', volkswagen:'volkswagen', vw:'volkswagen', bmw:'bmw', mercedes:'mercedes', oppo:'oppo', oneplus:'oneplus', xiaomi:'xiaomi', samsung:'samsung', galaxy:'samsung', apple:'apple', iphone:'apple', ipad:'apple', google:'google', pixel:'google', microsoft:'microsoft', windows:'microsoft', huawei:'huawei', honor:'honor', sony:'sony', garmin:'garmin', lenovo:'lenovo', asus:'asus', acer:'acer', hp:'hp', lg:'lg', qualcomm:'qualcomm', supabase:'supabase', sima:'sima', vivo:'vivo', redmagic:'redmagic', gta:'gta', mova:'mova', angelelli:'angelelli' }));
const ALIASES = new Map(Object.entries({ smart:'akilli', sleep:'uyku', system:'sistem', announced:'tanitildi', announcement:'tanitildi', beta:'beta', betas:'beta', public:'public', acik:'public', kaynak:'kaynak', source:'kaynak', software:'yazilim', bug:'hata', bounty:'odul', program:'program', temporarily:'gecici', suspended:'durduruldu', paused:'durduruldu', durdurdu:'durduruldu', kullanicisi:'kullanici', kullanicilarinin:'kullanici', kullanici:'kullanici', sayisinin:'sayi', sayisi:'sayi', bekleme:'bekleme', suresini:'sure', suresi:'sure', ram:'ram' }));

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

function words(value = '') {
  return [...new Set(plain(value).replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/)
    .map((word) => ALIASES.get(word) || word)
    .filter((word) => (word.length >= 3 || /^\d{1,4}$/.test(word) || BRANDS.has(word)) && !STOP.has(word)))];
}

function facets(value) {
  const title = plain(value);
  const patterns = {
    review: /\b(inceleme|review)\b/,
    sale: /\b(satisa|satis|fiyat|price)\b/,
    performance: /\b(performans|benchmark|test sonuclari)\b/,
    camera: /\b(kamera|camera|sensor)\b/,
    design: /\b(tasarim|design|boyut|dimension)\b/,
    leadership: /\b(ceo|mudur|yonetici|gorevi devraldi)\b/,
    agreement: /\b(patent|anlasma|agreement)\b/,
    funding: /\b(yatirim|funding|investment)\b/,
    rating: /\b(yas siniri|age rating|rating)\b/,
    release: /\b(beta|guncelleme|update)\b/,
    memory: /\b(ram|bellek|memory)\b/
  };
  return new Set(Object.entries(patterns).filter(([, pattern]) => pattern.test(title)).map(([facet]) => facet));
}

function brandSet(tokens) {
  return new Set(tokens.map((token) => BRANDS.get(token)).filter(Boolean));
}

export function publicationMatch(leftTitle = '', rightTitle = '', leftUrl = '', rightUrl = '') {
  const leftCanonical = canonicalUrl(leftUrl);
  if (leftCanonical && leftCanonical === canonicalUrl(rightUrl)) return { accepted: true, score: 1, common: 99, reason: 'url' };
  const left = words(leftTitle);
  const right = words(rightTitle);
  if (!left.length || !right.length) return { accepted: false, score: 0, common: 0, reason: 'empty' };
  const leftBrands = brandSet(left);
  const rightBrands = brandSet(right);
  if (leftBrands.size && rightBrands.size && ![...leftBrands].some((brand) => rightBrands.has(brand))) {
    return { accepted: false, score: 0, common: 0, reason: 'brand_mismatch' };
  }
  const rightSet = new Set(right);
  const commonTokens = left.filter((word) => rightSet.has(word));
  const common = commonTokens.length;
  const containment = common / Math.max(1, Math.min(left.length, right.length));
  const jaccard = common / Math.max(1, new Set([...left, ...right]).size);
  const score = containment * .72 + jaccard * .28;
  const modelLike = (word) => /\d/.test(word) && !/^20\d\d$/.test(word);
  const leftModels = left.filter(modelLike);
  const rightModels = right.filter(modelLike);
  if (leftModels.length && rightModels.length && !leftModels.some((word) => rightModels.includes(word))) {
    return { accepted: false, score: score * .2, common, reason: 'model_mismatch' };
  }
  const sharedSubject = commonTokens.filter((word) => !GENERIC.has(word) && !BRANDS.has(word) && !modelLike(word));
  const sharedBrand = [...leftBrands].some((brand) => rightBrands.has(brand));
  const exactTitle = left.join(' ') === right.join(' ');
  const sharedModel = leftModels.some((word) => rightModels.includes(word));
  const leftFacets = facets(leftTitle);
  const rightFacets = facets(rightTitle);
  if (!exactTitle && leftFacets.size && rightFacets.size && ![...leftFacets].some((facet) => rightFacets.has(facet))) {
    return { accepted: false, score, common, reason: 'different_event' };
  }
  const softwareVersion = (value) => plain(value).match(/\b(ios|ipados|android)\s+(\d+(?:[.]\d+)*)\s*(?:beta\s*(\d+))?/);
  const leftVersion = softwareVersion(leftTitle);
  const rightVersion = softwareVersion(rightTitle);
  if (leftVersion && rightVersion && leftVersion[1] === rightVersion[1] &&
    (leftVersion[2] !== rightVersion[2] || (leftVersion[3] && rightVersion[3] && leftVersion[3] !== rightVersion[3]))) {
    return { accepted: false, score, common, reason: 'version_mismatch' };
  }
  const strongSubject = sharedSubject.length >= 2 && common >= 3 && score >= .5;
  const namedModel = sharedModel && leftModels.some((word) => rightModels.includes(word) && /[a-z]/.test(word));
  const modelEvent = namedModel && sharedBrand && sharedSubject.length >= 2;
  const accepted = exactTitle || strongSubject || modelEvent;
  return { accepted, score: exactTitle ? 1 : score, common,
    reason: accepted ? (exactTitle ? 'title_exact' : 'title_strong') : 'weak' };
}
