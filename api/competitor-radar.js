import { json, queryLocal, safeText } from './_lib.js';
import { loadIntelligenceModel, modelInfluence, predictWithModel } from './_intelligence-model.js';

const STOP = new Set('bir bu şu ve veya ile için gibi daha en son yeni olan olarak da de mı mi mu mü ne nasıl neden hangi göre kadar sonra önce artık diye the and for from into over after before report reportedly'.split(' '));
const TECH = /\b(yapay zeka|ai|telefon|akıllı|iphone|ipad|macbook|android|ios|windows|uygulama|güncelleme|yazılım|donanım|işlemci|çip|gpu|ekran|kamera|batarya|otomobil|elektrikli|robot|uydu|uzay|internet|siber|güvenlik|oyun|playstation|xbox|nintendo|google|apple|samsung|xiaomi|huawei|oppo|vivo|honor|meta|openai|microsoft|nvidia|amd|intel|tesla|byd|garmin|bmw|volkswagen|hyundai|honda|renault|citro[eë]n|spotify|netflix|disney|telegram|linkedin|reddit|booking|startup|girişim|fintech|e-ticaret|dijital platform|sosyal medya|streaming|havacılık|savunma)\b/i;
const NOISE = /\b(maç|macı|maci|futbol|basketbol|voleybol|hangi kanalda|canlı izle|transfer|magazin|burç|survivor|dizi|sevgilisi)\b/i;
const DISCOVER = /\b(sızıntı|şaşırt|ilk kez|ortaya çıktı|büyük|kritik|değişiyor|yasak|ücretsiz|fiyat|özellik|model|liste|rekor|rakip|gelecek|gizli|beklenmedik|kullanıcı|pil|kamera)\b/i;
const NEWS = /\b(duyurdu|tanıttı|çıktı|yayınlandı|başladı|satışa|güncelleme|anlaşma|satın aldı|açık|saldırı|dava|karar|yasak|zam|indirim|lansman|resmî|ifaşa|sızıntı)\b/i;
const TURKEY_CONTEXT = /\b(türkiye|türk(?:iye'de|iye’de|iye için|iye pazarı)?|tl|türk lirası|btk|rekabet kurumu|resm[iî] gazete|e-devlet|trendyol|hepsiburada|n11|teknosa|mediamarkt türkiye|amazon\.com\.tr|turkcell|türk telekom|vodafone türkiye)\b/i;
const COMPETITOR_SQL = `(^log(\\.com\\.tr)?$|shiftdelete|webtekno|donanımhaber|donanimhaber|webrazzi|chip( online)?|hardware plus|^hwp$|tamindir|technopat)`;

function norm(value = '') { return safeText(value).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü\s]/gi, ' ').replace(/\s+/g, ' ').trim(); }
function tokens(value = '') { return new Set(norm(value).split(' ').filter((word) => word.length > 2 && !STOP.has(word))); }
function similarity(a, b) {
  const left = a instanceof Set ? a : tokens(a); const right = b instanceof Set ? b : tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0; for (const word of left) if (right.has(word)) common += 1;
  return common / Math.max(2, Math.min(left.size, right.size));
}
function clamp(value, min = 0, max = 98) { return Math.max(min, Math.min(max, Math.round(Number(value) || 0))); }
function canonical(value = '') { try { const url = new URL(value); return `${url.origin}${url.pathname}`.replace(/\/+$/, ''); } catch { return String(value).split(/[?#]/)[0].replace(/\/+$/, ''); } }
function ageHours(value) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 3600000) : 99; }
function freshness(hours) { return hours <= 2 ? 100 : hours <= 6 ? 91 : hours <= 12 ? 80 : hours <= 24 ? 66 : hours <= 36 ? 49 : 32; }
function headline(title = '') { return safeText(title).replace(/\s*[|–—-]\s*(LOG|Webtekno|Webrazzi|ShiftDelete(?:\.Net)?|DonanımHaber).*$/i, '').trim(); }
function logScore(value, scale) { return Math.min(100, Math.log1p(Math.max(0, Number(value) || 0)) * scale); }

export function performanceProfile(row = {}) {
  const discover = clamp(logScore(row.discover_clicks, 13) * .48 + logScore(row.discover_impressions, 8) * .37 + Math.min(100, Number(row.discover_ctr || 0) * 900) * .15, 0, 100);
  const news = clamp(logScore(row.google_news_clicks, 14) * .56 + logScore(row.google_news_impressions, 8) * .44, 0, 100);
  const audience = clamp(logScore(row.ga4_views, 10) * .55 + logScore(row.ga4_active_users, 12) * .30 + Math.min(100, Number(row.ga4_engagement_rate || 0) * 100) * .15, 0, 100);
  return { discover, news, audience, combined: clamp(discover * .46 + news * .24 + audience * .30, 0, 100) };
}

export function hasTurkeyContext(item = {}) { return TURKEY_CONTEXT.test(`${item.title || ''} ${item.summary || ''}`); }

export function promptFor(item) {
  const refs = (item.references || []).map((ref, index) => `${index + 1}. ${ref.source_name}: ${ref.title}\n${ref.url}`).join('\n\n');
  const locationRule = hasTurkeyContext(item)
    ? 'Konu doğrudan Türkiye bağlantılı. Yalnızca doğrulanmış yerel fiyat, erişim, takvim veya mevzuat etkisini doğal biçimde açıkla.'
    : 'Konu küresel. Yapay bir Türkiye bağlantısı kurma; Türkiye fiyatı, erişimi veya etkisini ancak güvenilir bir kaynak doğruluyorsa ekle.';
  const match = item.performance_match
    ? `Teknoblog geçmişinde benzer başarılı konu: ${item.performance_match.title} (Discover ${item.performance_match.discover_score}, News ${item.performance_match.news_score}, GA4 ilgi ${item.performance_match.audience_score}).`
    : 'Teknoblog geçmişinde güçlü ve doğrudan bir performans eşleşmesi bulunmadı.';
  return `Bu görev, özel GPT'ndeki “Sabri Küstür gibi yazan Teknoblog editörü” yapılandırmasıyla birlikte uygulanmalıdır. Mevcut GPT yapılandırması üslup, imla ve format açısından ana otoritedir.

GÖREV
Rakip yayınlardaki aşağıdaki gelişmeyi başlangıç sinyali kabul et. Web'de araştır; mümkünse üreticinin resmî açıklamasına, destek sayfasına, basın bültenine veya birincil belgeye ulaş. Rakip metinlerini kopyalama. Kaynaklarda olmayan hiçbir ayrıntıyı uydurma. Haber içinde Radar puanlarından veya rakip yayınlardan söz etme.

KONU
${item.title}

RADAR ANALİZİ
- Discover olasılığı: ${item.discover_score}/100
- Google News olasılığı: ${item.news_score}/100
- Çoklu kaynak hızı: ${item.velocity_score || 0}/100
- Değerlendirme: ${(item.reasons || []).join(' ')}
- Geçmiş öğrenme: ${match}
- Yerel bağlam kuralı: ${locationRule}

BAŞLANGIÇ KAYNAKLARI
${refs}

YAZIM KONTROL LİSTESİ
- Türkçe, doğal, güvenilir ve Teknoblog üslubunda yaz; okura doğrudan seslen ve yalnızca etken çatı kullan.
- “yapay zeka” ifadesini küçük harfle yaz. Uzun tire kullanma. Ölçüleri metrik sisteme, saatleri Türkiye saatine dönüştür.
- Ana başlık tercihen 55–65 karakter olsun; açık, somut ve doğal olsun, iki nokta kullanma.
- Giriş 60–90 kelime ve 3–4 cümle olsun; en önemli bilgiyi ilk paragrafta ver.
- Paragrafları çoğunlukla 4–8 cümle tut. Gerektiğinde doğal H2 ara başlıklar kullan; haberi liste biçimine dönüştürme.
- Teknik ayrıntıyı, sektör bağlamını ve kullanıcı etkisini dengeli biçimde açıkla. Test etmediğin bir üründe kişisel deneyim iddia etme.
- ${locationRule}
- Yayından önce isimleri, model numaralarını, tarihleri, fiyatları ve iddiaları kaynaklar arasında doğrula.

ÇIKTI SIRASI
1. Ana başlık
2. SEO meta açıklaması: 150–160 karakter, ana arama niyetini doğal biçimde içeren tek açıklama; bu alanı kesinlikle atlama
3. Yayına hazır haber metni
4. Kaynaklar: yararlanılan kaynak adları ve doğrudan tam URL'leri
5. Facebook özeti: 2–3 cümle, emoji ve hashtag yok
6. X özeti: ilk cümle 📰 ile başlayan çarpıcı bir cümle; ardından en az 5 adet 📌 madde, her madde 2 cümle; hashtag yok

Yalnızca nihai çıktıyı bu sırayla ver. Ek editoryal not, puan tablosu veya doğrulama günlüğü gösterme.`;
}

export function clusterCompetitorRows(rows = []) {
  const clusters = [];
  const seen = new Set();
  for (const row of rows) {
    const url = canonical(row.url); const title = headline(row.title); const text = `${title} ${row.summary || ''}`;
    if (!url || !title || seen.has(url) || !TECH.test(text) || NOISE.test(text)) continue;
    seen.add(url);
    const words = tokens(title);
    let cluster = null; let score = 0;
    for (const candidate of clusters) {
      const current = similarity(words, candidate.words);
      if (current > score) { score = current; cluster = candidate; }
    }
    if (!cluster || score < .52) {
      clusters.push({ lead: { ...row, title }, rows: [{ ...row, title }], words });
      continue;
    }
    cluster.rows.push({ ...row, title });
    const leadQuality = (Number(cluster.lead.trust_score) || 70) + (cluster.lead.image_url ? 12 : 0) - ageHours(cluster.lead.published_at || cluster.lead.created_at) * .2;
    const rowQuality = (Number(row.trust_score) || 70) + (row.image_url ? 12 : 0) - ageHours(row.published_at || row.created_at) * .2;
    if (rowQuality > leadQuality) { cluster.lead = { ...row, title }; cluster.words = words; }
  }
  return clusters;
}

export function classifyOpportunity({ channelScore = 0, velocity = 0, sourceCount = 1, performanceMatch = null, written = false } = {}) {
  if (written) return { score: clamp(channelScore - 18, 10, 98), key: 'written', label: 'Teknoblog’da yazıldı' };
  const history = performanceMatch ? Math.max(Number(performanceMatch.discover_score || 0), Number(performanceMatch.news_score || 0), Number(performanceMatch.audience_score || 0)) : 0;
  const corroboration = Math.min(10, Math.max(0, Number(sourceCount || 1) - 1) * 4);
  const score = clamp(3 + Number(channelScore) * .72 + Number(velocity) * .16 + history * .06 + corroboration, 20, 98);
  if (score >= 77) return { score, key: 'critical', label: 'Kritik fırsat' };
  if (score >= 69) return { score, key: 'high', label: 'Yüksek öncelik' };
  if (score >= 57) return { score, key: 'opportunity', label: 'Fırsat' };
  return { score, key: 'watch', label: 'Takip et' };
}

function bestPerformanceMatch(words, profiles) {
  let best = null; let score = 0;
  for (const profile of profiles) {
    const sim = similarity(words, profile.words);
    const candidate = sim * profile.profile.combined;
    if (candidate > score) { score = candidate; best = profile; }
  }
  return score >= 18 && best ? { row: best, similarity: Math.round(similarity(words, best.words) * 100), affinity: clamp(score, 0, 100) } : null;
}

function diversify(items, limit) {
  const selected = []; const deferred = []; const counts = new Map();
  for (const item of items) {
    const count = counts.get(item.source_name) || 0;
    if (count < 5) { selected.push(item); counts.set(item.source_name, count + 1); } else deferred.push(item);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) selected.push(...deferred.slice(0, limit - selected.length));
  return selected;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const hours = Math.max(6, Math.min(72, Number(req.query?.hours) || 36));
    const limit = Math.max(12, Math.min(80, Number(req.query?.limit) || 48));
    const [news, history, own, queue, sourceRows, activeModel] = await Promise.all([
      queryLocal(`SELECT r.id,r.source_id,r.source_name,r.title,r.url,r.summary,r.image_url,r.published_at,r.created_at,
        COALESCE(c.discover_score,0) AS stored_discover,COALESCE(c.editorial_score,0) AS stored_editorial,
        COALESCE(s.trust_score,70) AS trust_score,COALESCE(s.priority_weight,70) AS priority_weight
        FROM raw_feed_items r JOIN sources s ON s.id=r.source_id
        LEFT JOIN LATERAL (SELECT MAX(discover_score) AS discover_score,MAX(editorial_score) AS editorial_score FROM topic_candidates tc WHERE tc.raw_feed_item_id=r.id) c ON true
        WHERE COALESCE(r.published_at,r.created_at)>=NOW()-($1::text||' hours')::interval AND s.is_active=true AND lower(s.name)~$2
        ORDER BY COALESCE(r.published_at,r.created_at) DESC LIMIT 900`, [hours, COMPETITOR_SQL]),
      queryLocal(`SELECT title,url,discover_clicks,discover_impressions,discover_ctr,google_news_clicks,google_news_impressions,
        ga4_views,ga4_active_users,ga4_engagement_rate FROM published_performance
        WHERE title IS NOT NULL AND published_at>=NOW()-INTERVAL '365 days'
          AND (discover_impressions>0 OR google_news_impressions>0 OR ga4_views>0)
        ORDER BY (discover_clicks*12+google_news_clicks*10+LN(1+ga4_views)*8) DESC,observed_at DESC LIMIT 1200`),
      queryLocal(`SELECT title,url,published_at FROM teknoblog_content WHERE published_at>=NOW()-INTERVAL '60 days' ORDER BY published_at DESC LIMIT 3000`),
      queryLocal(`SELECT url,status FROM editorial_queue WHERE created_at>=NOW()-INTERVAL '21 days'`),
      queryLocal(`SELECT id,name FROM sources WHERE is_active=true AND lower(name)~$1 ORDER BY priority_weight DESC`, [COMPETITOR_SQL]),
      loadIntelligenceModel().catch(() => null)
    ]);
    const queueMap = new Map(queue.rows.map((row) => [canonical(row.url), row.status]));
    const ownTokens = own.rows.map((row) => ({ ...row, words: tokens(row.title) }));
    const profiles = history.rows.map((row) => ({ ...row, words: tokens(row.title), profile: performanceProfile(row) })).filter((row) => row.profile.combined >= 20);
    const clusters = clusterCompetitorRows(news.rows);
    const raw = [];
    for (const cluster of clusters) {
      const row = cluster.lead; const title = row.title; const text = `${title} ${row.summary || ''}`; const words = tokens(title);
      const hoursOld = Math.min(...cluster.rows.map((entry) => ageHours(entry.published_at || entry.created_at)));
      const fresh = freshness(hoursOld); const match = bestPerformanceMatch(words, profiles);
      let written = null; let writtenScore = 0;
      for (const post of ownTokens) { const score = similarity(words, post.words); if (score > writtenScore) { writtenScore = score; written = post; } }
      if (writtenScore < .58) written = null;
      const references = cluster.rows.map((entry) => ({ source_name: entry.source_name, title: headline(entry.title), url: entry.url, published_at: entry.published_at || entry.created_at }))
        .filter((entry, index, list) => entry.url && list.findIndex((other) => canonical(other.url) === canonical(entry.url)) === index).slice(0, 8);
      const sourceCount = new Set(references.map((entry) => entry.source_name)).size;
      const recentCount = cluster.rows.filter((entry) => ageHours(entry.published_at || entry.created_at) <= 8).length;
      const velocity = clamp(20 + sourceCount * 19 + Math.min(4, recentCount) * 8 + (hoursOld <= 4 ? 16 : hoursOld <= 12 ? 8 : 0), 20, 100);
      const tech = TECH.test(text) ? 100 : 48; const discoverIntent = DISCOVER.test(text) ? 100 : 48; const newsIntent = NEWS.test(text) ? 100 : 42;
      const trust = (Number(row.trust_score) || 70) * .7 + (Number(row.priority_weight) || 70) * .3; const image = row.image_url ? 100 : 25;
      // Missing history is neutral, not a penalty. Only a real matched winner may
      // lift the score; sparse GSC/GA4 history must not hide a breaking story.
      const historyDiscover = match ? Math.max(45, match.row.profile.discover * match.similarity / 100) : 45;
      const historyNews = match ? Math.max(42, match.row.profile.news * match.similarity / 100) : 42;
      const historyAudience = match ? Math.max(45, match.row.profile.audience * match.similarity / 100) : 45;
      let discoverScore = clamp(fresh * .17 + discoverIntent * .15 + historyDiscover * .24 + historyAudience * .13 + velocity * .15 + trust * .08 + image * .08, 20, 98);
      let newsScore = clamp(fresh * .20 + newsIntent * .18 + historyNews * .23 + velocity * .18 + trust * .09 + tech * .07 + historyAudience * .05, 20, 98);
      let intelligence = null;
      if (activeModel) {
        intelligence = predictWithModel({ title, summary: row.summary, image_url: row.image_url, source_name: row.source_name, published_at: row.published_at || row.created_at }, activeModel, { discover: discoverScore, news: newsScore, editorial: Math.max(discoverScore, newsScore) });
        const discoverWeight = Math.min(.32, modelInfluence(activeModel, 'discover', .22)); const newsWeight = Math.min(.30, modelInfluence(activeModel, 'news', .2));
        // The learned model is a corroborating signal. A model trained on sparse
        // historical coverage may lift a candidate, but cannot bury a fresh,
        // multi-source breaking story by more than three points.
        discoverScore = clamp(Math.max(discoverScore - 3, discoverScore * (1 - discoverWeight) + intelligence.discover_probability * discoverWeight), 20, 98);
        newsScore = clamp(Math.max(newsScore - 3, newsScore * (1 - newsWeight) + intelligence.news_probability * newsWeight), 20, 98);
      }
      if (written) { discoverScore = clamp(discoverScore - 20, 10, 98); newsScore = clamp(newsScore - 24, 10, 98); }
      const performanceMatch = match ? { title: match.row.title, url: match.row.url, similarity: match.similarity, discover_score: match.row.profile.discover, news_score: match.row.profile.news, audience_score: match.row.profile.audience, discover_clicks: Number(match.row.discover_clicks || 0), news_clicks: Number(match.row.google_news_clicks || 0), ga4_views: Number(match.row.ga4_views || 0) } : null;
      const channelScore = Math.max(discoverScore, newsScore);
      const tier = classifyOpportunity({ channelScore, velocity, sourceCount, performanceMatch, written: Boolean(written) });
      const tierReason = tier.key === 'critical' ? 'Çoklu kanıt ve yüksek yayılma hızı acil yayın penceresi oluşturuyor.' : tier.key === 'high' ? 'Güçlü kanal puanı veya rakip yayılımı yüksek öncelik oluşturuyor.' : tier.key === 'opportunity' ? 'Haber değerlendirilebilir, ancak ek doğrulama veya daha güçlü açı gerekiyor.' : 'Sinyal izlenmeli; yayın için henüz yeterli kanıt yok.';
      const reasons = [tierReason, fresh >= 80 ? 'Haber ilk 12 saatinde.' : 'Haber güncel zaman penceresinde.', sourceCount > 1 ? `${sourceCount} rakip yayın aynı konu kümesinde.` : 'Şimdilik tek rakip kaynakta.', velocity >= 72 ? 'Rakipler arasında hızlı yayılıyor.' : 'Yayılma hızı henüz sınırlı.', match?.row.profile.discover >= 55 ? 'Benzer konu Teknoblog’da güçlü Discover performansı üretti.' : match?.row.profile.news >= 55 ? 'Benzer konu Teknoblog’da Google News performansı üretti.' : match?.row.profile.audience >= 55 ? 'Benzer konu Teknoblog’da yüksek GA4 ilgisi gördü.' : 'Güçlü geçmiş performans eşleşmesi yok.', DISCOVER.test(text) ? 'Başlık kullanıcı etkisi ve merak sinyali taşıyor.' : NEWS.test(text) ? 'Somut, zaman duyarlı haber olayı içeriyor.' : 'Açı ve birincil kaynak doğrulaması gerekiyor.'];
      const item = { id: String(row.id), title, url: row.url, source_name: row.source_name, image_url: row.image_url || cluster.rows.find((entry) => entry.image_url)?.image_url || '', summary: safeText(row.summary || ''), published_at: row.published_at || row.created_at, age_hours: Math.round(hoursOld * 10) / 10, discover_score: discoverScore, news_score: newsScore, channel_score: channelScore, opportunity_score: tier.score, opportunity_key: tier.key, opportunity_label: tier.label, source_count: sourceCount, velocity_score: velocity, reasons, references, performance_match: performanceMatch, intelligence: intelligence ? { model_version: intelligence.model_version, confidence: intelligence.confidence } : null, queue_status: queueMap.get(canonical(row.url)) || null, written_match: written ? { title: written.title, url: written.url, score: Math.round(writtenScore * 100) } : null };
      item.prompt = promptFor(item); raw.push(item);
    }
    raw.sort((a, b) => (a.opportunity_key === 'written') - (b.opportunity_key === 'written') || b.opportunity_score - a.opportunity_score || b.velocity_score - a.velocity_score || new Date(b.published_at) - new Date(a.published_at));
    const items = diversify(raw, limit);
    return json(res, 200, { generated_at: new Date().toISOString(), hours, count: items.length, sources: sourceRows.rows, model_version: activeModel?.model_version || 'heuristic-fallback', summary: { critical: items.filter((x) => x.opportunity_key === 'critical').length, high: items.filter((x) => x.opportunity_key === 'high').length, discover_hot: items.filter((x) => x.discover_score >= 80 && x.opportunity_key !== 'written').length, news_hot: items.filter((x) => x.news_score >= 80 && x.opportunity_key !== 'written').length, multi_source: items.filter((x) => x.source_count > 1).length, opportunities: items.filter((x) => x.opportunity_key === 'opportunity').length, written: items.filter((x) => x.opportunity_key === 'written').length }, items });
  } catch (error) { return json(res, 500, { error: error?.message || String(error) }); }
}
