(() => {
  const STORE = {
    open: 'tb_editorial_center_open',
    noise: 'tb_editorial_noise_terms',
    published: 'tb_editorial_published_items',
    priceHistory: 'tb_opportunity_price_history'
  };
  const COMPETITORS = ['ShiftDelete', 'DonanımHaber', 'Webtekno', 'LOG', 'The Verge', 'Engadget', '9to5Mac', 'Android Authority'];
  const EVERGREEN = /öğrenci indirimi|güncelleme alan|hangi modeller|nasıl|rehber|karşılaştırma|fiyat|kampanya|chatgpt|dünya kupası|4k|vpn|apple|ios|one ui|android/i;
  const TECH = /apple|iphone|ios|ipad|mac|android|samsung|galaxy|xiaomi|huawei|honor|oppo|vivo|google|gemini|openai|chatgpt|yapay zeka|microsoft|windows|nvidia|amd|intel|whatsapp|instagram|youtube|telefon|tablet|laptop|kulaklık|akıllı saat|güvenlik|siber/i;
  const state = { open: localStorage.getItem(STORE.open) !== '0', loading: false, error: '', items: [], discover: [], social: [], opportunities: [], updatedAt: null };

  function esc(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function clamp(v) { return Math.max(0, Math.min(100, Math.round(num(v)))); }
  function txt(i={}) { return [i.title,i.summary,i.excerpt,i.description,i.source_name,i.url].filter(Boolean).join(' ').toLowerCase(); }
  function age(i={}) { const t = new Date(i.published_at || i.created_at || i.updated_at || 0).getTime(); return t ? Math.max(0,(Date.now()-t)/3600000) : 999999; }
  function fresh(i) { return age(i) <= 24; }
  function score(i,k) { return num(i[k]); }
  function url(i={}) { return i.url || i.canonical_url || i.link || '#'; }
  function title(i={}) { return String(i.title || 'Başlıksız içerik'); }
  function source(i={}) { return String(i.source_name || 'Kaynak yok'); }
  function fmt(v) { const d = new Date(v || 0); return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(d); }
  function uniq(arr) { const seen = new Set(); return arr.filter(i => { const k = String(url(i) || title(i)).toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; }); }
  function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || ''); } catch { return fallback; } }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function getNoise() { return loadJson(STORE.noise, ['maç','hangi kanalda','canlı izle','futbol','voleybol','deprem','burç','kimdir']); }
  function isNoise(i) { const text = txt(i); return getNoise().some(t => t && text.includes(String(t).toLowerCase())) && !TECH.test(text); }
  function googleSiteSearch(q) { return `https://www.google.com/search?q=${encodeURIComponent(`site:teknoblog.com ${q}`)}`; }
  function googleNewsSearch(q) { return `https://news.google.com/search?q=${encodeURIComponent(q)}&hl=tr&gl=TR&ceid=TR:tr`; }

  function decision(i) {
    const d = score(i,'discover_score'), t = score(i,'traffic_score'), s = score(i,'social_score'), e = score(i,'editorial_score'), c = score(i,'conversion_score');
    if (!fresh(i)) return 'Bekle';
    if (d >= 75 || (t >= 70 && e >= 60)) return 'Yaz';
    if (s >= 72) return 'Sosyalde kullan';
    if (c >= 70) return 'Fırsat/rehber açısı';
    if (d >= 55 || t >= 55) return 'Takip et';
    return 'Geç';
  }
  function why(i) {
    const r = [];
    if (fresh(i)) r.push('son 24 saat içinde');
    if (score(i,'discover_score') >= 60) r.push(`Discover ${score(i,'discover_score')}`);
    if (score(i,'traffic_score') >= 60) r.push(`trafik ${score(i,'traffic_score')}`);
    if (score(i,'social_score') >= 60) r.push(`sosyal ${score(i,'social_score')}`);
    if (/fiyat|indirim|kampanya|stok|satış/i.test(txt(i))) r.push('ticari/satın alma sinyali');
    if (/güncelleme|özellik|hangi modeller|alacak/i.test(txt(i))) r.push('arama ve karusel potansiyeli');
    return r.length ? r.join(' · ') : 'puanlar ve konu sinyalleri sınırlı';
  }
  function angle(i) {
    const text = txt(i);
    if (/fiyat|indirim|kampanya|zam|stok/i.test(text)) return 'Fiyat, erişim ve satın alma etkisi öne çıkarılmalı.';
    if (/güncelleme|hangi modeller|alacak|beta|özellik/i.test(text)) return 'Model listesi ve kullanıcıya etkisiyle girilmeli.';
    if (/güvenlik|siber|veri|hack/i.test(text)) return 'Risk, etkilenen kullanıcılar ve alınacak önlemler anlatılmalı.';
    if (/openai|chatgpt|gemini|yapay zeka/i.test(text)) return 'Yapay zekâ ekosistemindeki etkisi sade anlatılmalı.';
    return 'Kullanıcıya etkisi ve Türkiye bağlantısı öne çıkarılmalı.';
  }
  function headlines(i) {
    const base = title(i).replace(/\s+/g,' ').trim();
    const key = base.length > 72 ? base.slice(0,69) + '...' : base;
    return [`${key}: Bilinmesi gerekenler`, `${key} ne değiştiriyor?`, `${key} için dikkat çeken detay`, `Bu gelişme teknoloji gündemini hareketlendirdi`];
  }
  function instagramPlan(i) { return ['Kapak: Çarpıcı sonuç', 'Ne oldu?', 'Kimleri etkiliyor?', 'En önemli detay', 'Teknoblog’da devamı']; }
  function shareBrief(i) { return `Editoryal not: ${decision(i)}. Açı: ${angle(i)} Gerekçe: ${why(i)} Kaynak: ${url(i)}`; }
  function publishedMap() { return loadJson(STORE.published, {}); }
  function markPublished(i) { const m = publishedMap(); m[url(i)] = { title: title(i), date: new Date().toISOString() }; saveJson(STORE.published, m); render(); }
  function updatePriceHistory(items) { const h = loadJson(STORE.priceHistory, {}); for (const i of items || []) { const k = title(i); if (!k) continue; const p = num(i.sale_price || i.price || i.current_price); if (!p) continue; h[k] = [...(h[k] || []), { p, t: Date.now(), store: source(i) }].slice(-30); } saveJson(STORE.priceHistory, h); }
  function priceSignal(i) { const h = loadJson(STORE.priceHistory, {}); const list = h[title(i)] || []; if (list.length < 2) return 'Yeni izleniyor'; const p = num(i.sale_price || i.price || i.current_price); const min = Math.min(...list.map(x=>x.p)); if (p && p <= min) return 'Son dönemin en düşük fiyatı'; return 'Fiyat geçmişi izleniyor'; }

  function card(i, extra='') {
    return `<article class="tb-ec-card"><div class="tb-ec-badges"><b>${esc(decision(i))}</b><span>G ${score(i,'total_score')}</span><span>D ${score(i,'discover_score')}</span><span>T ${score(i,'traffic_score')}</span><span>S ${score(i,'social_score')}</span></div><h4>${esc(title(i))}</h4><p>${esc(source(i))} · ${esc(fmt(i.published_at))}</p><p>${esc(angle(i))}</p>${extra}<div class="tb-ec-actions"><a href="${esc(url(i))}" target="_blank" rel="noopener noreferrer">Haberi aç</a><a href="${esc(googleSiteSearch(title(i)))}" target="_blank" rel="noopener noreferrer">Teknoblog’da ara</a><button type="button" data-copy="${esc(shareBrief(i))}">Brief kopyala</button><button type="button" data-published="${esc(url(i))}">Yayımlandı işaretle</button></div></article>`;
  }
  function panel(titleText, body, note='') { return `<section class="tb-ec-panel"><h3>${esc(titleText)}</h3>${note ? `<p class="tb-ec-note">${esc(note)}</p>` : ''}<div class="tb-ec-grid">${body || '<div class="tb-ec-empty">Veri yok.</div>'}</div></section>`; }

  function sourceQuality() {
    const map = new Map();
    state.items.forEach(i => { const s = source(i); const row = map.get(s) || { source:s, count:0, fresh:0, score:0 }; row.count++; if (fresh(i)) row.fresh++; row.score += score(i,'total_score'); map.set(s,row); });
    return [...map.values()].map(r => ({...r, avg: Math.round(r.score/Math.max(1,r.count))})).sort((a,b)=>b.avg-a.avg).slice(0,10);
  }

  function renderBody() {
    const items = uniq([...state.discover, ...state.social, ...state.items]).filter(i => fresh(i) && !isNoise(i)).sort((a,b)=>score(b,'total_score')-score(a,'total_score'));
    const today = items.filter(i => ['Yaz','Sosyalde kullan','Fırsat/rehber açısı'].includes(decision(i))).slice(0,8);
    const published = publishedMap();
    const gaps = items.filter(i => !/teknoblog/i.test(source(i))).slice(0,8);
    const evergreen = items.filter(i => EVERGREEN.test(txt(i))).slice(0,8);
    const insta = items.map(i => ({...i, ig: clamp(score(i,'social_score')*0.35 + score(i,'discover_score')*0.25 + (/güncelleme|özellik|fiyat|sızıntı|iddia|whatsapp|instagram|iphone|galaxy/i.test(txt(i))?25:0))})).sort((a,b)=>b.ig-a.ig).slice(0,8);
    const opps = state.opportunities.slice(0,8);
    const sq = sourceQuality();
    const noise = getNoise();

    return [
      panel('1. Haber Karar Skoru', today.map(i => card(i, `<p class="tb-ec-why">Neden: ${esc(why(i))}</p>`)).join(''), 'Her kart için Yaz, Bekle, Geç, Sosyalde kullan veya Fırsat/rehber açısı önerisi.'),
      panel('2. Rakip Takip Radarı', gaps.map(i => card(i, `<div class="tb-ec-actions"><a href="${esc(googleNewsSearch(title(i)))}" target="_blank" rel="noopener noreferrer">Google News’te ara</a>${COMPETITORS.map(c=>`<a href="${esc(googleNewsSearch(c+' '+title(i)))}" target="_blank" rel="noopener noreferrer">${esc(c)}</a>`).join('')}</div>`)).join(''), 'Rakip kontrol bağlantılarıyla hangi konunun kaçırılabileceğini gösterir.'),
      panel('3. Teknoblog’da Yazıldı mı?', items.slice(0,8).map(i => card(i, `<p>${published[url(i)] ? 'Yayımlandı olarak işaretli' : 'Teknoblog site aramasıyla kontrol edilmeli'}</p>`)).join('')),
      panel('4. Haber Açısı Önerileri', items.slice(0,8).map(i => card(i, `<p><b>Açı:</b> ${esc(angle(i))}</p>`)).join('')),
      panel('5. Başlık Laboratuvarı', items.slice(0,6).map(i => card(i, `<ol>${headlines(i).map(h=>`<li>${esc(h)}</li>`).join('')}</ol>`)).join('')),
      panel('6. Instagram Karusel Üretim Modu', insta.map(i => card(i, `<p><b>Instagram skoru:</b> ${i.ig}</p><ol>${instagramPlan(i).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`)).join('')),
      panel('7. Fırsat Radarı Fiyat Geçmişi', opps.map(i => card(i, `<p><b>Fiyat sinyali:</b> ${esc(priceSignal(i))}</p>`)).join(''), 'Canlı ürün sayfalarından gelen fırsatlarda local fiyat geçmişi tutulur.'),
      panel('8. Bugün Yazılacaklar', today.slice(0,5).map(i => card(i)).join('')),
      panel('9. Google News Fırsat Boşluğu', gaps.map(i => card(i, `<p>Teknoblog dışı kaynakta gündem sinyali var. Hızlı girilebilir.</p>`)).join('')),
      panel('10. Eski İçerik Güncelleme Radarı', evergreen.map(i => card(i, `<p>Yeni haber yerine mevcut evergreen içerik güncellemesi olabilir.</p>`)).join('')),
      panel('11. Kaynak Kalite Skoru', sq.map(r => `<article class="tb-ec-card"><h4>${esc(r.source)}</h4><p>Ortalama skor: ${r.avg}</p><p>Son aday: ${r.count} · Taze: ${r.fresh}</p></article>`).join('')),
      panel('12. Gürültü Filtresi Yönetimi', `<article class="tb-ec-card tb-ec-wide"><p>Aktif terimler: ${esc(noise.join(', '))}</p><input id="tb-ec-noise-input" placeholder="Yeni terim"/><button type="button" id="tb-ec-add-noise">Terim ekle</button><button type="button" id="tb-ec-reset-noise">Varsayılana dön</button></article>`),
      panel('13. Slack ve WhatsApp Paylaşım Formatları', today.slice(0,6).map(i => card(i, `<textarea readonly>${esc(shareBrief(i))}</textarea>`)).join('')),
      panel('14. Yayın Sonrası Performans Takibi', Object.values(published).slice(-8).reverse().map(p => `<article class="tb-ec-card"><h4>${esc(p.title)}</h4><p>Yayımlandı işareti: ${esc(fmt(p.date))}</p><p>Sonraki aşama: index, Google News ve ilk 2 saat trafik kontrolü.</p></article>`).join('') || '<div class="tb-ec-empty">Henüz yayımlandı işareti yok.</div>'),
      panel('15. Neden Bu Haberi Önerdi?', today.map(i => card(i, `<p class="tb-ec-why">${esc(why(i))}</p>`)).join(''))
    ].join('');
  }

  function ensureStyle() {
    if (document.getElementById('tb-editorial-center-style')) return;
    const s = document.createElement('style');
    s.id = 'tb-editorial-center-style';
    s.textContent = `#tb-editorial-center{margin:24px 0 40px;border:1px solid #c7d2fe;border-radius:22px;background:#fff;padding:16px;box-shadow:0 8px 24px rgba(79,70,229,.08)}#tb-editorial-center[data-open='0'] .tb-ec-body{display:none}.tb-ec-head{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}.tb-ec-toggle{border:1px solid #818cf8;background:#eef2ff;color:#3730a3;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.tb-ec-refresh{border:1px solid #4f46e5;background:#fff;color:#4f46e5;border-radius:12px;padding:9px 12px;font-weight:900;cursor:pointer}.tb-ec-status{font-size:12px;color:#64748b;margin-top:10px}.tb-ec-panel{margin-top:18px;border-top:1px solid #e0e7ff;padding-top:14px}.tb-ec-panel h3{font:700 22px/1.1 'Fira Sans Condensed',sans-serif;margin:0 0 8px;color:#111827}.tb-ec-note{font-size:13px;color:#64748b;margin:0 0 10px}.tb-ec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.tb-ec-card{border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:12px;box-shadow:0 4px 12px rgba(15,23,42,.04)}.tb-ec-card h4{font:700 18px/1.25 'Fira Sans Condensed',sans-serif;margin:8px 0;color:#111827}.tb-ec-card p{font-size:12px;line-height:1.5;color:#475569;margin:6px 0}.tb-ec-badges{display:flex;gap:5px;flex-wrap:wrap}.tb-ec-badges b,.tb-ec-badges span{border-radius:999px;padding:4px 7px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;font-size:11px;font-weight:900}.tb-ec-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.tb-ec-actions a,.tb-ec-actions button,.tb-ec-card button{border:1px solid #c7d2fe;background:#fff;color:#3730a3;border-radius:9px;padding:7px 8px;font-size:11px;font-weight:900;text-decoration:none;cursor:pointer}.tb-ec-card textarea{width:100%;min-height:82px;border:1px solid #e5e7eb;border-radius:10px;padding:8px;font-size:12px}.tb-ec-wide{grid-column:1/-1}.tb-ec-empty{border:1px dashed #c7d2fe;border-radius:14px;padding:14px;color:#64748b}`;
    document.head.appendChild(s);
  }

  function mount() { return document.querySelector('#tb-radar-root') || document.body; }
  function render() {
    ensureStyle();
    let el = document.getElementById('tb-editorial-center');
    if (!el) { el = document.createElement('section'); el.id = 'tb-editorial-center'; mount().appendChild(el); }
    el.setAttribute('data-open', state.open ? '1' : '0');
    el.innerHTML = `<div class="tb-ec-head"><button class="tb-ec-toggle" type="button">▾ Teknoblog Editoryal Komuta Merkezi</button><button class="tb-ec-refresh" type="button">Komuta Merkezini Yenile</button></div><div class="tb-ec-status">${esc(state.loading ? 'Veriler yükleniyor...' : state.error || `Son güncelleme: ${state.updatedAt ? fmt(state.updatedAt) : 'henüz yok'} · Haber: ${state.items.length} · Fırsat: ${state.opportunities.length}`)}</div><div class="tb-ec-body">${state.loading ? '' : renderBody()}</div>`;
    el.querySelector('.tb-ec-toggle')?.addEventListener('click', () => { state.open = !state.open; localStorage.setItem(STORE.open, state.open ? '1' : '0'); render(); });
    el.querySelector('.tb-ec-refresh')?.addEventListener('click', load);
    el.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => { await navigator.clipboard.writeText(b.getAttribute('data-copy') || ''); b.textContent='Kopyalandı'; setTimeout(()=>b.textContent='Brief kopyala',1000); }));
    el.querySelectorAll('[data-published]').forEach(b => b.addEventListener('click', () => { const u = b.getAttribute('data-published'); const i = state.items.find(x => url(x) === u) || state.discover.find(x => url(x) === u) || {}; markPublished(i); }));
    el.querySelector('#tb-ec-add-noise')?.addEventListener('click', () => { const input = el.querySelector('#tb-ec-noise-input'); const v = input?.value?.trim(); if (!v) return; saveJson(STORE.noise, [...new Set([...getNoise(), v])]); render(); });
    el.querySelector('#tb-ec-reset-noise')?.addEventListener('click', () => { localStorage.removeItem(STORE.noise); render(); });
  }

  async function get(path) { const r = await fetch(path, { cache:'no-store', headers:{accept:'application/json'} }); const d = await r.json().catch(()=>({})); if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`); return d; }
  async function load() {
    state.loading = true; state.error = ''; render();
    try {
      const [total, discover, social, opp] = await Promise.allSettled([
        get('/api/recommendations?sort=total_score&_=' + Date.now()),
        get('/api/recommendations?sort=discover_score&_=' + Date.now()),
        get('/api/recommendations?sort=social_score&_=' + Date.now()),
        get('/api/recommendations?opportunity=1&limit=24&_=' + Date.now())
      ]);
      state.items = total.status === 'fulfilled' ? (total.value.items || []) : [];
      state.discover = discover.status === 'fulfilled' ? (discover.value.items || []) : [];
      state.social = social.status === 'fulfilled' ? (social.value.items || []) : [];
      state.opportunities = opp.status === 'fulfilled' ? (opp.value.items || []) : [];
      updatePriceHistory(state.opportunities);
      state.updatedAt = new Date().toISOString();
    } catch (e) { state.error = e.message || String(e); }
    finally { state.loading = false; render(); }
  }

  function start() { render(); load(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();
