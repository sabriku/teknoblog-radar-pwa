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
      && Date.parse(row.observed_at || '') >= Date.parse(row.published_at) + 2 * DAY);
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

export function summarizeReviewTimings(rows = []) {
  const started = new Map();
  const completed = new Set();
  const hours = [];
  for (const row of [...rows].sort((a, b) => Date.parse(a.changed_at || '') - Date.parse(b.changed_at || ''))) {
    if (!row.story_id || completed.has(row.story_id)) continue;
    const time = Date.parse(row.changed_at || '');
    if (!Number.isFinite(time)) continue;
    if (row.to_status === 'researching' && !started.has(row.story_id)) started.set(row.story_id, time);
    if (row.to_status === 'ready' && started.has(row.story_id)) {
      const duration = (time - started.get(row.story_id)) / 3600000;
      if (duration >= 0 && duration <= 30 * 24) hours.push(duration);
      completed.add(row.story_id);
    }
  }
  const middle = median(hours);
  return { status: hours.length >= 10 ? 'active' : 'collecting', sample_count: hours.length,
    median_hours_to_ready: middle === null ? null : Math.round(middle * 10) / 10 };
}
