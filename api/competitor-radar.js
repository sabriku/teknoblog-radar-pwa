import { json, queryLocal, safeText } from './_lib.js';

const STOP = new Set('bir bu şu ve veya ile için gibi daha en son yeni olan olarak da de mı mi mu mü ne nasıl neden hangi işte işteki göre kadar sonra önce artık diye'.split(' '));
const TECH = /\b(yapay zeka|ai|telefon|akıllı|iphone|ipad|macbook|android|ios|windows|uygulama|güncelleme|yazılım|donanım|işlemci|çip|gpu|ekran|kamera|batarya|otomobil|elektrikli|robot|uydu|uzay|internet|siber|güvenlik|oyun|playstation|xbox|nintendo|google|apple|samsung|xiaomi|huawei|oppo|vivo|honor|meta|openai|microsoft|nvidia|amd|intel|tesla|byd|garmin)\b/i;
const NOISE = /\b(maç|macı|maci|futbol|basketbol|voleybol|hangi kanalda|canlı izle|transfer|magazin|burç|survivor|dizi|sevgilisi)\b/i;
const DISCOVER = /\b(sızıntı|şaşırt|ilk kez|ortaya çıktı|büyük|kritik|değişiyor|yasak|ücretsiz|fiyat|özellik|model|liste|rekor|devrim|rakip|gelecek|gizli|beklenmedik)\b/i;
const NEWS = /\b(duyurdu|tanıttı|çıktı|yayınlandı|başladı|satışa|güncelleme|anlaşma|satın aldı|açık|saldırı|dava|karar|yasak|zam|indirim|lansman|resmî|ifaşa|sızıntı)\b/i;

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
function freshness(hours) { return hours <= 2 ? 100 : hours <= 6 ? 90 : hours <= 12 ? 78 : hours <= 24 ? 62 : hours <= 36 ? 45 : 30; }
function performanceStrength(row) {
  return clamp(Math.log1p(Number(row.discover_impressions) || 0) * 8 + Math.log1p(Number(row.discover_clicks) || 0) * 11 + Math.log1p(Number(row.google_news_impressions) || 0) * 6 + Math.log1p(Number(row.google_news_clicks) || 0) * 10, 0, 100);
}
function headline(title = '') { return safeText(title).replace(/\s*[|–—-]\s*(LOG|Webtekno|Webrazzi|ShiftDelete(?:\.Net)?|DonanımHaber).*$/i, '').trim(); }

function promptFor(item) {
  const refs = item.references.map((ref) => `- ${ref.source_name}: ${ref.title}\n  ${ref.url}`).join('\n');
  return `Sen Teknoblog için çalışan kıdemli bir teknoloji editörüsün. Aşağıdaki rakip haberlerinden yararlanarak özgün, doğrulanmış ve kaynaklara dayalı bir Türkçe haber taslağı hazırla.\n\nKONU: ${item.title}\nFIRSAT: ${item.opportunity_label}\nDISCOVER PUANI: ${item.discover_score}/100\nGOOGLE NEWS PUANI: ${item.news_score}/100\nDEĞERLENDİRME: ${item.reasons.join(' ')}\n\nREFERANS HABERLER:\n${refs}\n\nKURALLAR:\n- Referanslarda bulunmayan hiçbir ayrıntıyı uydurma. Çelişen iddiaları açıkça belirt.\n- Rakip metinlerini kopyalama; bilgiyi yeniden doğrula ve Teknoblog üslubuyla özgünleştir.\n- Önce 3 Discover başlığı, 2 Google News başlığı ve 1 SEO başlığı öner.\n- En güçlü başlığı seçip kısa spot, haber gövdesi ve madde madde doğrulama notları üret.\n- Türkiye'deki kullanıcı açısından etkisini ve haberin neden şimdi önemli olduğunu açıkla.\n- Kullanılan referans URL'lerini taslağın sonunda listele.`;
}

function diversify(items, limit) {
  const selected = []; const deferred = []; const counts = new Map();
  for (const item of items) {
    const count = counts.get(item.source_name) || 0;
    if (count < 4) { selected.push(item); counts.set(item.source_name, count + 1); }
    else deferred.push(item);
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
    const [news, history, own, queue, sourceRows] = await Promise.all([
      queryLocal(`SELECT r.id,r.source_id,r.source_name,r.title,r.url,r.summary,r.image_url,r.published_at,r.created_at,
        COALESCE(c.discover_score,0) AS stored_discover,COALESCE(c.editorial_score,0) AS stored_editorial,
        COALESCE(s.trust_score,70) AS trust_score,COALESCE(s.priority_weight,70) AS priority_weight
        FROM raw_feed_items r JOIN sources s ON s.id=r.source_id
        LEFT JOIN LATERAL (SELECT MAX(discover_score) AS discover_score,MAX(editorial_score) AS editorial_score
          FROM topic_candidates tc WHERE tc.raw_feed_item_id=r.id) c ON true
        WHERE COALESCE(r.published_at,r.created_at)>=NOW()-($1::text||' hours')::interval AND s.is_active=true
          AND (s.source_type='competitor' OR lower(s.name)~'(log|shiftdelete|webtekno|donanımhaber|donanimhaber|webrazzi|chip|hardware plus|hwp)')
        ORDER BY COALESCE(r.published_at,r.created_at) DESC LIMIT 700`, [hours]),
      queryLocal(`SELECT title,discover_clicks,discover_impressions,google_news_clicks,google_news_impressions FROM published_performance
        WHERE title IS NOT NULL AND published_at>=NOW()-INTERVAL '120 days' AND (discover_impressions>0 OR google_news_impressions>0)
        ORDER BY observed_at DESC LIMIT 800`),
      queryLocal(`SELECT title,url,published_at FROM teknoblog_content WHERE published_at>=NOW()-INTERVAL '45 days' ORDER BY published_at DESC LIMIT 2500`),
      queryLocal(`SELECT url,status FROM editorial_queue WHERE created_at>=NOW()-INTERVAL '14 days'`),
      queryLocal(`SELECT id,name FROM sources WHERE is_active=true AND (source_type='competitor' OR lower(name)~'(log|shiftdelete|webtekno|donanımhaber|donanimhaber|webrazzi|chip|hardware plus|hwp)') ORDER BY priority_weight DESC`)
    ]);
    const queueMap = new Map(queue.rows.map((row) => [canonical(row.url), row.status]));
    const ownTokens = own.rows.map((row) => ({ ...row, words: tokens(row.title) }));
    const winners = history.rows.map((row) => ({ ...row, words: tokens(row.title), strength: performanceStrength(row) })).filter((row) => row.strength >= 25);
    const raw = []; const seen = new Set();
    for (const row of news.rows) {
      const url = canonical(row.url); const title = headline(row.title); const text = `${title} ${row.summary || ''}`;
      if (!url || !title || seen.has(url) || (NOISE.test(text) && !TECH.test(text))) continue;
      seen.add(url);
      const words = tokens(title); const hoursOld = ageHours(row.published_at || row.created_at); const fresh = freshness(hoursOld);
      let bestHistory = 0;
      for (const winner of winners) bestHistory = Math.max(bestHistory, similarity(words, winner.words) * winner.strength);
      let written = null; let writtenScore = 0;
      for (const post of ownTokens) { const score = similarity(words, post.words); if (score > writtenScore) { writtenScore = score; written = post; } }
      if (writtenScore < .58) written = null;
      const related = news.rows.filter((other) => other.id !== row.id && similarity(words, tokens(other.title)) >= .52).slice(0, 5);
      const sourceCount = new Set([row.source_name, ...related.map((entry) => entry.source_name)]).size;
      const tech = TECH.test(text) ? 100 : 48; const discoverIntent = DISCOVER.test(text) ? 100 : 48; const newsIntent = NEWS.test(text) ? 100 : 42;
      const trust = (Number(row.trust_score) || 70) * .7 + (Number(row.priority_weight) || 70) * .3;
      const image = row.image_url ? 100 : 25;
      let discoverScore = clamp(fresh * .24 + discoverIntent * .22 + bestHistory * .24 + Math.min(100, 35 + sourceCount * 20) * .12 + trust * .10 + image * .08, 20, 98);
      let newsScore = clamp(fresh * .28 + newsIntent * .25 + Math.min(100, 30 + sourceCount * 23) * .19 + bestHistory * .14 + trust * .10 + tech * .04, 20, 98);
      if (written) { discoverScore = clamp(discoverScore - 20, 10, 98); newsScore = clamp(newsScore - 24, 10, 98); }
      const opportunity = Math.max(discoverScore, newsScore);
      const opportunityKey = written ? 'written' : opportunity >= 82 ? 'critical' : opportunity >= 70 ? 'high' : opportunity >= 58 ? 'opportunity' : 'watch';
      const opportunityLabel = written ? 'Teknoblog’da yazıldı' : opportunityKey === 'critical' ? 'Kritik fırsat' : opportunityKey === 'high' ? 'Yüksek öncelik' : opportunityKey === 'opportunity' ? 'Fırsat' : 'Takip et';
      const reasons = [fresh >= 78 ? 'Haber çok yeni.' : 'Haber son 48 saat içinde.', sourceCount > 1 ? `${sourceCount} rakip kaynak aynı konuyu doğruluyor.` : 'Şimdilik tek rakip kaynakta.', bestHistory >= 40 ? 'Benzer konular Teknoblog’da daha önce Discover veya News performansı üretti.' : 'Geçmiş performans benzerliği sınırlı.', DISCOVER.test(text) ? 'Başlık güçlü merak ve kullanıcı etkisi sinyali taşıyor.' : 'Discover için daha güçlü bir kullanıcı açısı gerekiyor.', NEWS.test(text) ? 'Somut ve zaman duyarlı haber olayı içeriyor.' : 'Google News için ek doğrulama gerekebilir.'];
      const references = [{ source_name: row.source_name, title, url: row.url }, ...related.map((entry) => ({ source_name: entry.source_name, title: headline(entry.title), url: entry.url }))].filter((entry, index, list) => entry.url && list.findIndex((x) => canonical(x.url) === canonical(entry.url)) === index);
      const item = { id: row.id, title, url: row.url, source_name: row.source_name, image_url: row.image_url || '', summary: safeText(row.summary || ''), published_at: row.published_at || row.created_at, age_hours: Math.round(hoursOld * 10) / 10, discover_score: discoverScore, news_score: newsScore, opportunity_score: opportunity, opportunity_key: opportunityKey, opportunity_label: opportunityLabel, source_count: sourceCount, reasons, references, queue_status: queueMap.get(url) || null, written_match: written ? { title: written.title, url: written.url, score: Math.round(writtenScore * 100) } : null };
      item.prompt = promptFor(item);
      raw.push(item);
    }
    raw.sort((a, b) => (a.opportunity_key === 'written') - (b.opportunity_key === 'written') || b.opportunity_score - a.opportunity_score || new Date(b.published_at) - new Date(a.published_at));
    const items = diversify(raw, limit);
    return json(res, 200, { generated_at: new Date().toISOString(), hours, count: items.length, sources: sourceRows.rows, summary: { critical: items.filter((x) => x.opportunity_key === 'critical').length, high: items.filter((x) => x.opportunity_key === 'high').length, opportunities: items.filter((x) => x.opportunity_key === 'opportunity').length, written: items.filter((x) => x.opportunity_key === 'written').length }, items });
  } catch (error) { return json(res, 500, { error: error?.message || String(error) }); }
}
