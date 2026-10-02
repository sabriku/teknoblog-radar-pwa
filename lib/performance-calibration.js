const STOP = new Set('ve veya ile için yeni son ilk bir bu şu olarak daha sonra önce artık bugün the and for with from new has have will its that this teknoloji haberleri'.split(' '));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function tokens(value = '') {
  return new Set(String(value).toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word)));
}

function outcome(row) {
  const clicks = Math.max(0, Number(row.discover_clicks) || 0);
  const views = Math.max(0, Number(row.ga4_views) || 0);
  return Math.log1p(clicks) + .65 * Math.log1p(views);
}

export function buildPerformanceCalibration(rows = []) {
  const samples = rows.filter((row) => row.title && (Number(row.discover_clicks) > 0 || Number(row.ga4_views) > 0))
    .map((row) => ({ title: row.title, words: tokens(row.title), outcome: outcome(row) }))
    .filter((row) => row.words.size >= 2);
  if (samples.length < 20) return { status: 'insufficient_data', sample_count: samples.length, samples: [], median: 0 };
  const sorted = samples.map((row) => row.outcome).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { status: 'active', sample_count: samples.length, samples, median };
}

export function calibrateFit(title = '', baseFit = 50, model = null) {
  if (model?.status !== 'active') return { fit: Math.round(baseFit), adjustment: 0, matched_samples: 0, status: 'insufficient_data' };
  const target = tokens(title);
  const matches = [];
  for (const sample of model.samples) {
    const common = [...target].filter((word) => sample.words.has(word)).length;
    const similarity = common / Math.max(1, Math.min(target.size, sample.words.size));
    if (common >= 2 && similarity >= .45) matches.push({ ...sample, similarity });
  }
  matches.sort((a, b) => b.similarity - a.similarity);
  const relevant = matches.slice(0, 8);
  if (relevant.length < 2) return { fit: Math.round(baseFit), adjustment: 0, matched_samples: relevant.length, status: 'insufficient_matches' };
  const weighted = relevant.reduce((sum, row) => sum + row.outcome * row.similarity, 0)
    / relevant.reduce((sum, row) => sum + row.similarity, 0);
  const raw = (weighted - model.median) * 2.5;
  const confidence = clamp(relevant.length / 5, 0, 1);
  const adjustment = Math.round(clamp(raw * confidence, -8, 8));
  return { fit: Math.round(clamp(baseFit + adjustment, 0, 100)), adjustment, matched_samples: relevant.length, status: 'active' };
}
