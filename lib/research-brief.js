const sourceTime = (source) => Date.parse(source.published_at || '') || 0;

export function buildResearchBrief(story = {}) {
  const sources = (story.sources || []).filter((source) => /^https?:\/\//i.test(String(source.url || '')))
    .map((source) => ({ name: source.name || 'Kaynak', title: source.title || story.title || '',
      url: source.url, published_at: source.published_at || null,
      type: source.type === 'official' ? 'official' : 'secondary' }))
    .sort((a, b) => sourceTime(a) - sourceTime(b));
  const official = sources.filter((source) => source.type === 'official');
  const checks = [];
  if (!official.length) checks.push('İlk açıklamayı veya resmî kaynağı bul ve temel iddiayı doğrula.');
  if (sources.length < 2) checks.push('İddiayı ikinci bir bağımsız kaynaktan kontrol et.');
  if (sources.length > 1) checks.push('Kaynakların aynı ilk açıklamaya dayanıp dayanmadığını kontrol et.');
  if (story.published_match) checks.push('Yeni bilgiyi Teknoblog’daki mevcut yayınla karşılaştır.');
  if (Number(story.signals?.turkey_interest) >= 60) checks.push('Türkiye erişimi, fiyatı veya yerel etkisini ayrıca doğrula.');
  for (const format of story.content_opportunities || []) {
    for (const check of format.checks || []) if (!checks.includes(check)) checks.push(check);
  }
  return {
    status: official.length ? 'official_source_seen' : sources.length >= 2 ? 'multiple_sources' : 'single_source',
    source_count: sources.length, official_source_count: official.length,
    earliest_source: sources[0] || null,
    sources, checks
  };
}
