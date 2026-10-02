const sourceTime = (source) => Date.parse(source.published_at || '') || 0;
const QUANTITY = /\b(\d+(?:[.,]\d+)?)\s*(mAh|GB|TB|Hz|MP|W|inç|inch)(?![\p{L}])/giu;

function quantityValue(raw) {
  return Number(/^\d{1,3}[.,]\d{3}$/.test(raw) ? raw.replace(/[.,]/g, '') : raw.replace(',', '.'));
}

function possibleDiscrepancies(sources) {
  const byUnit = new Map();
  for (const source of sources) {
    const perSource = new Map();
    for (const match of String(source.title || '').matchAll(QUANTITY)) {
      const unit = match[2].toLocaleLowerCase('tr-TR');
      const value = quantityValue(match[1]);
      if (Number.isFinite(value)) {
        const values = perSource.get(unit) || new Set();
        values.add(value);
        perSource.set(unit, values);
      }
    }
    for (const [unit, values] of perSource) {
      if (values.size !== 1) continue;
      const mentions = byUnit.get(unit) || [];
      mentions.push({ value: [...values][0], source_name: source.name, url: source.url });
      byUnit.set(unit, mentions);
    }
  }
  return [...byUnit].filter(([, mentions]) => mentions.length >= 2 && new Set(mentions.map((item) => item.value)).size > 1)
    .map(([unit, mentions]) => ({ unit, mentions }));
}

export function buildResearchBrief(story = {}) {
  const sources = (story.sources || []).filter((source) => /^https?:\/\//i.test(String(source.url || '')))
    .map((source) => ({ name: source.name || 'Kaynak', title: source.title || story.title || '',
      url: source.url, published_at: source.published_at || null,
      type: source.type === 'official' ? 'official' : 'secondary' }))
    .sort((a, b) => sourceTime(a) - sourceTime(b));
  const official = sources.filter((source) => source.type === 'official');
  const discrepancies = possibleDiscrepancies(sources);
  const checks = [];
  if (!official.length) checks.push('İlk açıklamayı veya resmî kaynağı bul ve temel iddiayı doğrula.');
  if (sources.length < 2) checks.push('İddiayı ikinci bir bağımsız kaynaktan kontrol et.');
  if (sources.length > 1) checks.push('Kaynakların aynı ilk açıklamaya dayanıp dayanmadığını kontrol et.');
  if (discrepancies.length) checks.push('Başlıklardaki farklı rakamların aynı ürün ve sürüme ait olup olmadığını kontrol et.');
  if (story.published_match) checks.push('Yeni bilgiyi Teknoblog’daki mevcut yayınla karşılaştır.');
  if (Number(story.signals?.turkey_interest) >= 60) checks.push('Türkiye erişimi, fiyatı veya yerel etkisini ayrıca doğrula.');
  for (const format of story.content_opportunities || []) {
    for (const check of format.checks || []) if (!checks.includes(check)) checks.push(check);
  }
  return {
    status: official.length ? 'official_source_seen' : sources.length >= 2 ? 'multiple_sources' : 'single_source',
    source_count: sources.length, official_source_count: official.length,
    earliest_source: sources[0] || null,
    sources, checks, possible_discrepancies: discrepancies
  };
}
