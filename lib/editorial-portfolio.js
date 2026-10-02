const BEATS = [
  ['apple', /\bapple\b|iphone|ipad|macbook|macos|\bios\b|vision pro/i],
  ['android_mobile', /android|samsung|galaxy|pixel|xiaomi|oneplus|oppo|vivo|honor|huawei/i],
  ['ai', /yapay zek[aâ]|artificial intelligence|\bai\b|openai|chatgpt|gemini|claude|copilot/i],
  ['gaming', /oyun|playstation|xbox|nintendo|steam|gaming|game\b/i],
  ['apps', /whatsapp|instagram|youtube|spotify|telegram|tiktok|uygulama|app\b/i],
  ['hardware', /işlemci|chip|nvidia|amd|intel|laptop|bilgisayar|processor|cpu|gpu/i]
];

export function editorialBeat(title = '') {
  const text = String(title || '');
  return BEATS.find(([, pattern]) => pattern.test(text))?.[0] || 'other';
}

export function portfolioSummary(lanes = {}) {
  const cards = Object.values(lanes).flat();
  const counts = {};
  for (const card of cards) counts[card.beat || editorialBeat(card.title)] = (counts[card.beat || editorialBeat(card.title)] || 0) + 1;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null;
  return { total: cards.length, beats: counts, dominant_beat: dominant?.[0] || null,
    dominant_share: dominant && cards.length ? Math.round(dominant[1] / cards.length * 100) : 0,
    concentrated: Boolean(dominant && cards.length >= 8 && dominant[1] / cards.length >= .5) };
}
