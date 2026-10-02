import { createHash } from 'node:crypto';
import { buildPerformanceCalibration, calibrateFit } from './performance-calibration.js';
import { contentOpportunitiesFor } from './content-opportunities.js';
import { buildResearchBrief } from './research-brief.js';
import { marketContextFor } from './market-context.js';
import { editorialPackageFor } from './editorial-package.js';
import { editorialBeat, portfolioSummary } from './editorial-portfolio.js';

const STOP = new Set('ve veya ile için yeni son ilk bir bu şu olarak daha sonra önce artık geliyor geldi olacak çıktı bugün the and for with from new has have will its that this launched announces announced update updates teknoloji haberleri'.split(' '));
const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const number = (value, fallback = 0) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
const time = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

function words(title = '') {
  return new Set(String(title).toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word)));
}

function similarity(left, right) {
  const common = [...left].filter((word) => right.has(word)).length;
  return { common, ratio: common / Math.max(1, Math.min(left.size, right.size)) };
}

function ageHours(item, now) {
  const stamp = time(item.published_at || item.created_at);
  return stamp ? Math.max(0, (now - stamp) / 3600000) : 168;
}

function sourceScore(item) {
  const trust = number(item.trust_score, 70);
  const health = number(item.health_quality_score, 50);
  const official = item.source_type === 'official' ? 8 : 0;
  return clamp(trust * .65 + health * .35 + official);
}

function turkeyScore(item) {
  const text = `${item.title || ''} ${item.summary || ''}`;
  const local = item.market_relevance === 'local' ? 72 : item.market_relevance === 'mixed' ? 50 : 24;
  return clamp(local + (/türkiye|türkçe|tl\b|₺|bt[km]|resm[iî] gazete|e-devlet|turkey|turkish/i.test(text) ? 24 : 0));
}

function editorialFit(item) {
  const base = number(item.editorial_score, 45);
  const text = `${item.title || ''} ${item.summary || ''}`;
  const tech = /telefon|iphone|ipad|android|yapay zek[aâ]|ai\b|uygulama|yazılım|güncelleme|kamera|işlemci|laptop|bilgisayar|tablet|giyilebilir|akıllı saat|phone|software|chip|security|console|oyun/i.test(text);
  return clamp(base * .8 + (tech ? 20 : 8));
}

export function clusterStories(rows = [], now = Date.now()) {
  const clusters = [];
  const tokenIndex = new Map();
  const ordered = [...rows].filter((row) => row.title && row.url).sort((a, b) => time(a.published_at || a.created_at) - time(b.published_at || b.created_at));
  for (const row of ordered) {
    const tokens = words(row.title);
    const candidates = new Set();
    for (const token of tokens) for (const index of tokenIndex.get(token) || []) candidates.add(index);
    let match = -1;
    let best = 0;
    for (const index of candidates) {
      const cluster = clusters[index];
      const overlap = similarity(tokens, cluster.tokens);
      const closeInTime = Math.abs(time(row.published_at || row.created_at) - time(cluster.first_seen_at)) <= 72 * 3600000;
      if (closeInTime && overlap.common >= 3 && overlap.ratio >= .68 && overlap.ratio > best) {
        match = index; best = overlap.ratio;
      }
    }
    if (match < 0) {
      match = clusters.length;
      clusters.push({ tokens, rows: [], first_seen_at: row.published_at || row.created_at, key_url: row.url });
      for (const token of tokens) {
        const entries = tokenIndex.get(token) || [];
        entries.push(match);
        tokenIndex.set(token, entries);
      }
    }
    clusters[match].rows.push(row);
  }
  return clusters.map((cluster) => {
    const sources = [...new Map(cluster.rows.map((row) => [row.source_id || row.source_name || row.url, row])).values()];
    const lead = [...cluster.rows].sort((a, b) => sourceScore(b) - sourceScore(a) || time(b.published_at) - time(a.published_at))[0];
    const lastSeen = Math.max(...cluster.rows.map((row) => time(row.published_at || row.created_at)));
    const recentSources = sources.filter((row) => ageHours(row, now) <= 6).length;
    return {
      id: createHash('sha1').update(cluster.key_url).digest('hex').slice(0, 16),
      title: lead.title,
      url: lead.url,
      image_url: lead.image_url || null,
      summary: lead.summary || '',
      first_seen_at: cluster.first_seen_at,
      last_seen_at: new Date(lastSeen || now).toISOString(),
      source_count: sources.length,
      source_type_counts: Object.fromEntries(['competitor', 'official'].map((type) =>
        [type, sources.filter((row) => row.source_type === type).length])),
      item_count: cluster.rows.length,
      recent_source_count: recentSources,
      sources: [...sources].sort((a, b) => Number(b.source_type === 'official') - Number(a.source_type === 'official'))
        .slice(0, 8).map((row) => ({ name: row.source_name, title: row.title, url: row.url,
        site_url: row.site_url || null,
        published_at: row.published_at || row.created_at, type: row.source_type || 'news',
        quality: sourceScore(row) })),
      lead,
      rows: cluster.rows
    };
  });
}

function publicationMatch(story, posts) {
  const storyWords = words(story.title);
  return posts.find((post) => {
    if (post.url && story.url && post.url === story.url) return true;
    const overlap = similarity(storyWords, words(post.title));
    return overlap.common >= 3 && overlap.ratio >= .74;
  }) || null;
}

export function buildEditorialDashboard(rows = [], posts = [], now = Date.now(), performanceRows = []) {
  const clusters = clusterStories(rows, now);
  const performanceModel = buildPerformanceCalibration(performanceRows);
  const cards = clusters.map((cluster) => {
    const lead = cluster.lead;
    const freshness = clamp(100 * Math.exp(-Math.max(0, (now - time(cluster.last_seen_at)) / 3600000) / 14));
    const discover = clamp(number(lead.discover_score, 40));
    const turkey = Math.max(...cluster.rows.map(turkeyScore));
    const quality = clamp(cluster.sources.reduce((sum, source) => sum + source.quality, 0) / Math.max(1, cluster.sources.length));
    const velocity = clamp(15 + Math.max(0, cluster.recent_source_count - 1) * 28 + Math.max(0, cluster.source_count - 1) * 10);
    const calibration = calibrateFit(cluster.title, Math.max(...cluster.rows.map(editorialFit)), performanceModel);
    const fit = calibration.fit;
    const score = clamp(freshness * .22 + discover * .25 + turkey * .14 + quality * .14 + velocity * .13 + fit * .12);
    const published = publicationMatch(cluster, posts);
    const contentType = String(lead.content_type_hint || '');
    const publishedMatch = published ? { title: published.title, url: published.url, published_at: published.published_at || null } : null;
    const formats = contentOpportunitiesFor({ title: cluster.title, summary: cluster.summary,
      image_url: cluster.image_url, source_count: cluster.source_count, score,
      signals: { freshness, discover, turkey_interest: turkey, source_quality: quality, spread_velocity: velocity, teknoblog_fit: fit },
      published_match: publishedMatch, content_type_hint: contentType });
    const productionOpportunity = score >= 50 && freshness >= 45 && quality >= 60
      && formats.some((format) => !['news', 'update'].includes(format.key) && format.confidence >= 68);
    const lane = published ? 'update' : score >= 60 && freshness >= 55 && discover >= 60 && quality >= 55 ? 'write_now'
      : velocity >= 35 && freshness >= 25 ? 'rising' : productionOpportunity ? 'produce' : null;
    const research = buildResearchBrief({ ...cluster, signals: { turkey_interest: turkey },
      published_match: publishedMatch, content_opportunities: formats });
    const marketContext = marketContextFor({ sources: cluster.sources, source_count: cluster.source_count,
      source_type_counts: cluster.source_type_counts,
      turkey_interest: turkey, freshness, source_quality: quality });
    const productionPackage = editorialPackageFor({ title: cluster.title, image_url: cluster.image_url,
      research, published_match: publishedMatch });
    return {
      id: cluster.id, lane, beat: editorialBeat(cluster.title), title: cluster.title, url: cluster.url, image_url: cluster.image_url,
      summary: cluster.summary, first_seen_at: cluster.first_seen_at, last_seen_at: cluster.last_seen_at,
      source_count: cluster.source_count, item_count: cluster.item_count, recent_source_count: cluster.recent_source_count,
      sources: cluster.sources, published_match: publishedMatch, content_opportunities: formats, research,
      market_context: marketContext, production_package: productionPackage,
      score, signals: { freshness, discover, turkey_interest: turkey, source_quality: quality, spread_velocity: velocity, teknoblog_fit: fit },
      calibration: { status: calibration.status, adjustment: calibration.adjustment, matched_samples: calibration.matched_samples }
    };
  }).sort((a, b) => b.score - a.score || time(b.last_seen_at) - time(a.last_seen_at));
  const lanes = { write_now: [], rising: [], update: [], produce: [] };
  for (const card of cards) if (card.lane) lanes[card.lane].push(card);
  return { lanes, observed_cards: cards, portfolio: portfolioSummary(lanes),
    counts: Object.fromEntries(Object.entries(lanes).map(([key, items]) => [key, items.length])), total: cards.filter((card) => card.lane).length, scanned_count: cards.length,
    model: { version: 'editorial_v6', performance_status: performanceModel.status, performance_samples: performanceModel.sample_count,
      weights: { freshness: .22, discover: .25, turkey_interest: .14, source_quality: .14, spread_velocity: .13, teknoblog_fit: .12 } } };
}
