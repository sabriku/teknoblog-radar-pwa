const DAY = 24 * 3600000;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

export function evaluateEditorialDecisions(rows = [], now = Date.now()) {
  const eligible = rows.filter((row) => {
    const detected = Date.parse(row.detected_at || '');
    const score = Number(row.score);
    return Number.isFinite(detected) && detected <= now - 7 * DAY && Number.isFinite(score)
      && score >= 0 && score <= 100 && row.published_at_detection !== true;
  });
  const groups = { high: [], other: [] };
  for (const row of eligible) groups[Number(row.score) >= 65 ? 'high' : 'other'].push(row);
  const summarize = (group) => {
    const published = group.filter((row) => {
      const detected = Date.parse(row.detected_at);
      const date = Date.parse(row.published_at || '');
      return Number.isFinite(date) && date >= detected && date <= detected + 7 * DAY;
    });
    const observed = published.filter((row) => Date.parse(row.published_at) <= now - 2 * DAY
      && Date.parse(row.observed_at || '') >= Date.parse(row.published_at) + 2 * DAY
      && (Number(row.discover_clicks) > 0 || Number(row.ga4_views) > 0));
    return { decisions: group.length, published: published.length,
      publication_rate: group.length ? Math.round(published.length / group.length * 100) : null,
      performance_samples: observed.length,
      median_discover_clicks: median(observed.map((row) => Math.max(0, Number(row.discover_clicks) || 0))),
      median_ga4_views: median(observed.map((row) => Math.max(0, Number(row.ga4_views) || 0))) };
  };
  return { status: groups.high.length >= 10 && groups.other.length >= 10 ? 'active' : 'collecting',
    sample_count: eligible.length, high_priority: summarize(groups.high), other: summarize(groups.other),
    note: 'Yayın oranı editoryal seçimleri gösterir; trafik medyanı yalnızca yayınlanan ve ölçümü olgunlaşan içerikleri kapsar. Nedensel başarı ölçüsü değildir.' };
}
