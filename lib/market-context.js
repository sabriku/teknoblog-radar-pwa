export function marketContextFor(story = {}) {
  const sources = story.sources || [];
  const competitorCount = Number(story.source_type_counts?.competitor) || sources.filter((source) => source.type === 'competitor').length;
  const officialCount = Number(story.source_type_counts?.official) || sources.filter((source) => source.type === 'official').length;
  const observedCount = Number(story.source_count) || sources.length;
  const saturation = competitorCount >= 4 ? 'high' : competitorCount >= 2 ? 'medium' : 'low';
  const monitoredGap = competitorCount === 0 && Number(story.turkey_interest) >= 45
    && Number(story.freshness) >= 60 && Number(story.source_quality) >= 60
    && observedCount >= 1;
  return {
    observed_source_count: observedCount,
    monitored_competitor_count: competitorCount,
    official_source_count: officialCount,
    monitored_saturation: saturation,
    monitored_competitor_gap: monitoredGap,
    scope_note: 'Yalnızca Radar’ın izlediği akış kaynakları karşılaştırıldı.'
  };
}
