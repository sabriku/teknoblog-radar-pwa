const STOP = new Set('ve veya ile için bir bu şu daha yeni son ilk olan olarak göre sonra önce hakkında üzerinde geliyor geldi olacak oldu neden nasıl hangi ne zaman teknoloji tech says report reportedly could may its the and for from with that this have has will into over after before'.split(' '));
const GENERIC = new Set('ekim ocak subat mart nisan mayis haziran temmuz agustos eylul kasim aralik fiyat fiyatlari fiyatı listesi ozellik ozellikleri tanitildi duyuruldu geldi geliyor aciklandi yeni resmi buyuk onemli guncelleme model modelleri urun cihaz seri surum haber iste 2025 2026 2027'.split(' '));
const BRANDS = new Map(Object.entries({ mg:'mg', audi:'audi', volkswagen:'volkswagen', vw:'volkswagen', bmw:'bmw', mercedes:'mercedes', oppo:'oppo', oneplus:'oneplus', xiaomi:'xiaomi', samsung:'samsung', galaxy:'samsung', apple:'apple', iphone:'apple', ipad:'apple', google:'google', pixel:'google', microsoft:'microsoft', huawei:'huawei', honor:'honor', sony:'sony', garmin:'garmin', lenovo:'lenovo', asus:'asus', acer:'acer', hp:'hp', lg:'lg' }));

function canonicalUrl(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    url.search = '';
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch { return ''; }
}

function words(value = '') {
  return [...new Set(String(value).toLocaleLowerCase('tr-TR').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9çğıöşü\s]/gi, ' ').split(/\s+/)
    .filter((word) => (word.length >= 3 || /^\d{1,4}$/.test(word) || BRANDS.has(word)) && !STOP.has(word)))];
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
  const strongTranslation = sharedBrand && sharedSubject.length >= 1 && common >= 2 && containment >= .3;
  const strongTitle = common >= 3 && sharedSubject.length >= 1 && score >= .72;
  const shortStrong = Math.min(left.length, right.length) <= 4 && common >= 2 && sharedSubject.length >= 1 && score >= .86;
  const accepted = exactTitle || (sharedModel && common >= 3 && sharedSubject.length >= 1 && containment >= .4)
    || strongTranslation || strongTitle || shortStrong;
  return { accepted, score: exactTitle ? 1 : score, common,
    reason: accepted ? (exactTitle ? 'title_exact' : 'title_strong') : 'weak' };
}
