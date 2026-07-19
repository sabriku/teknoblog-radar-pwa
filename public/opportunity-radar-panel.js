(() => {
  const REFRESH_MS = 30 * 60 * 1000;
  const state = { loading: false, items: [], stores: [], sources: [], error: '', refreshedAt: null, category: 'all', store: 'all', sort: 'newest' };
  let started = false;

  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const token = () => localStorage.getItem('tb_radar_cron_token') || localStorage.getItem('tb_cron_token') || '';
  const fmtPrice = (value) => Number(value || 0) ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(value)) + ' TL' : '—';
  const fmtDate = (value) => {
    if (!value) return '—';
    const d = new Date(value || 0); if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(d);
  };
  const age = (value) => {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value || 0).getTime()) / 60000));
    if (!Number.isFinite(minutes)) return '';
    if (minutes < 60) return `${minutes} dk önce`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} sa önce`;
    return `${Math.round(minutes / 1440)} gün önce`;
  };

  function style() {
    if (document.getElementById('tb-opportunity-style')) return;
    const el = document.createElement('style'); el.id = 'tb-opportunity-style'; el.textContent = `
      #tb-opportunity-radar-wrap{--orange:#f04a0a;--ink:#172033;--muted:#667085;--line:#e7eaf0;background:#f8fafc;color:var(--ink);min-height:520px}
      .tb-o-shell{display:grid;gap:16px}.tb-o-hero{padding:22px;border-radius:22px;background:linear-gradient(135deg,#172033 0%,#273449 65%,#f04a0a 145%);color:#fff;display:flex;justify-content:space-between;gap:18px;align-items:center}
      .tb-o-hero h2{font:800 28px/1.05 'Fira Sans Condensed',sans-serif;margin:0 0 8px}.tb-o-hero p{margin:0;color:#dbe3ef;max-width:680px;font-size:13px;line-height:1.5}.tb-o-refresh{border:0;border-radius:12px;background:#fff;color:#c63d08;padding:11px 14px;font-weight:900;cursor:pointer;white-space:nowrap}.tb-o-refresh:disabled{opacity:.65;cursor:wait}
      .tb-o-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.tb-o-metric{background:#fff;border:1px solid var(--line);border-radius:16px;padding:13px}.tb-o-metric b{display:block;font-size:22px}.tb-o-metric span{font-size:11px;color:var(--muted)}
      .tb-o-toolbar{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px;display:flex;gap:9px;align-items:center;flex-wrap:wrap}.tb-o-toolbar select{border:1px solid #d6dae2;border-radius:10px;background:#fff;padding:9px 30px 9px 10px;font-weight:700;color:#344054}.tb-o-status{margin-left:auto;font-size:11px;color:var(--muted)}.tb-o-status.error{color:#b42318}
      .tb-o-store-strip{display:flex;gap:8px;overflow:auto;padding-bottom:2px}.tb-o-store{min-width:150px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 12px}.tb-o-store b{display:block;font-size:12px}.tb-o-store span{font-size:10px;color:var(--muted)}.tb-o-store.ok{border-color:#a7e3c0;background:#f3fff8}.tb-o-store.wait{border-color:#f1d6a8;background:#fffbf3}
      .tb-o-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.tb-o-card{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;min-width:0;box-shadow:0 5px 16px rgba(20,32,55,.05)}.tb-o-image{height:170px;width:100%;object-fit:contain;background:linear-gradient(145deg,#fff,#f4f6f9);padding:12px;box-sizing:border-box}.tb-o-no-image{height:170px;display:grid;place-items:center;background:linear-gradient(145deg,#fff7ed,#eef2ff);font-size:38px}.tb-o-body{padding:14px;display:flex;flex-direction:column;gap:9px;height:100%}.tb-o-badges{display:flex;gap:6px;flex-wrap:wrap}.tb-o-badge{border-radius:999px;background:#f2f4f7;color:#475467;padding:5px 8px;font-size:10px;font-weight:800}.tb-o-badge.lowest{background:#ecfdf3;color:#027a48}.tb-o-badge.new{background:#fff1eb;color:#c43e08}.tb-o-badge.source{background:#eef4ff;color:#3538cd}.tb-o-card h3{font:800 17px/1.28 'Fira Sans Condensed',sans-serif;margin:0}.tb-o-price{font-size:24px;font-weight:900;color:#111827}.tb-o-market{font-size:11px;color:var(--muted)}.tb-o-old{text-decoration:line-through}.tb-o-alts{display:flex;gap:5px;flex-wrap:wrap}.tb-o-alt{font-size:10px;border:1px solid var(--line);border-radius:999px;padding:4px 7px;color:#475467}.tb-o-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}.tb-o-actions a,.tb-o-actions button{border:1px solid #d6dae2;border-radius:9px;background:#fff;color:#344054;padding:8px 9px;font-size:11px;font-weight:850;text-decoration:none;cursor:pointer}.tb-o-actions .primary{background:var(--orange);border-color:var(--orange);color:#fff}.tb-o-empty{background:#fff;border:1px dashed #ccd2dc;border-radius:16px;padding:30px;text-align:center;color:var(--muted)}
      .tb-o-source-note{font-size:11px;color:var(--muted);padding:0 2px}.tb-o-source-note details{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px}.tb-o-source-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:8px}.tb-o-source-row{font-size:10px;padding:6px;border-radius:8px;background:#f8fafc}.tb-o-source-row.error{color:#b42318;background:#fff5f4}
      @media(max-width:1050px){.tb-o-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.tb-o-hero{padding:17px;align-items:flex-start;flex-direction:column}.tb-o-hero h2{font-size:24px}.tb-o-metrics{grid-template-columns:repeat(2,1fr)}.tb-o-grid{grid-template-columns:1fr}.tb-o-toolbar{align-items:stretch}.tb-o-toolbar select{flex:1;min-width:130px}.tb-o-status{width:100%;margin:0}.tb-o-image,.tb-o-no-image{height:210px}}
    `; document.head.appendChild(el);
  }

  function filtered() {
    let items = state.items.filter((item) => state.category === 'all' || item.category === state.category).filter((item) => state.store === 'all' || item.store === state.store);
    if (state.sort === 'price') items.sort((a, b) => a.sale_price - b.sale_price);
    else if (state.sort === 'score') items.sort((a, b) => b.score - a.score);
    else if (state.sort === 'discount') items.sort((a, b) => b.discount_rate - a.discount_rate || b.score - a.score);
    else {
      items.sort((a, b) => Number(b.is_new) - Number(a.is_new) || new Date(b.first_seen_at) - new Date(a.first_seen_at) || b.score - a.score);
      if (state.store === 'all') {
        const buckets = new Map();
        for (const item of items) { if (!buckets.has(item.store)) buckets.set(item.store, []); buckets.get(item.store).push(item); }
        const diverse = [];
        while ([...buckets.values()].some((list) => list.length)) {
          for (const store of state.stores.map((entry) => entry.store)) { const next = buckets.get(store)?.shift(); if (next) diverse.push(next); }
        }
        items = diverse;
      }
    }
    return items;
  }

  function queuePayload(item) {
    return esc(JSON.stringify({ candidate_id: `opportunity:${item.id}`, title: `${item.title} fırsatı: ${fmtPrice(item.sale_price)}`, url: item.comparison_url || item.url, source_name: `${item.store} · ${item.comparison_source}`, image_url: item.image_url, status: 'new', priority: item.score, notes: `Fırsat fiyatı ${fmtPrice(item.sale_price)}. ${item.market_lowest_price ? `Piyasa en düşük ${fmtPrice(item.market_lowest_price)}.` : ''}` }));
  }

  function card(item) {
    const alternatives = (item.alternatives || []).filter((alt) => alt.store !== item.store).slice(0, 3);
    const old = Number(item.list_price || 0);
    const market = Number(item.market_lowest_price || 0);
    return `<article class="tb-o-card">
      ${item.image_url ? `<img class="tb-o-image" src="${esc(item.image_url)}" alt="${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;tb-o-no-image&quot;>🏷️</div>'">` : '<div class="tb-o-no-image">🏷️</div>'}
      <div class="tb-o-body"><div class="tb-o-badges"><span class="tb-o-badge lowest">✓ Hedef mağazalarda en düşük</span>${item.is_new ? '<span class="tb-o-badge new">Yeni</span>' : ''}<span class="tb-o-badge source">${esc(item.comparison_source)}</span></div>
      <h3>${esc(item.title)}</h3><div><div class="tb-o-price">${esc(fmtPrice(item.sale_price))}</div><div class="tb-o-market">${esc(item.store)} · ${esc(age(item.checked_at))}${old ? ` · <span class="tb-o-old">${esc(fmtPrice(old))}</span> · %${Number(item.discount_rate || 0)} indirim` : ''}</div>${market ? `<div class="tb-o-market">Akakçe piyasa referansı: ${esc(fmtPrice(market))}</div>` : ''}</div>
      ${alternatives.length ? `<div class="tb-o-alts">${alternatives.map((alt) => `<span class="tb-o-alt">${esc(alt.store)} ${esc(fmtPrice(alt.price))}</span>`).join('')}</div>` : ''}
      <div class="tb-o-actions"><a class="primary" href="${esc(item.comparison_url || item.url)}" target="_blank" rel="noopener noreferrer">Fiyatı doğrula</a><button data-o-queue='${queuePayload(item)}'>＋ Yazılacaklara</button><button data-o-slack='${queuePayload(item)}'>Slack’e gönder</button></div></div></article>`;
  }

  function render() {
    style(); const host = document.getElementById('tb-opportunity-page-main'); if (!host) return false;
    let wrap = document.getElementById('tb-opportunity-radar-wrap'); if (!wrap) { wrap = document.createElement('section'); wrap.id = 'tb-opportunity-radar-wrap'; host.replaceChildren(wrap); }
    const items = filtered(); const categories = [...new Set(state.items.map((item) => item.category).filter(Boolean))].sort();
    const foundStores = state.stores.filter((item) => item.product_count > 0).length;
    const newCount = state.items.filter((item) => item.is_new).length;
    wrap.innerHTML = `<div class="tb-o-shell">
      <header class="tb-o-hero"><div><h2>🏷️ Fırsat Merkezi</h2><p>Cimri, Epey ve Akakçe fiyat sinyallerini karşılaştırır; yalnızca MediaMarkt, Teknosa, Hepsiburada, Amazon.com.tr, Samsung Shop ve Huawei Online Mağaza tekliflerini tekilleştirerek gösterir.</p></div><button class="tb-o-refresh" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Taranıyor…' : '↻ Fiyatları tara'}</button></header>
      <div class="tb-o-metrics"><div class="tb-o-metric"><b>${state.items.length}</b><span>tekilleştirilmiş ürün</span></div><div class="tb-o-metric"><b>${newCount}</b><span>son 8 saatte bulunan</span></div><div class="tb-o-metric"><b>${foundStores}/6</b><span>fiyat bulunan mağaza</span></div><div class="tb-o-metric"><b>${fmtDate(state.refreshedAt)}</b><span>son karşılaştırma</span></div></div>
      <div class="tb-o-toolbar"><select data-o-category><option value="all">Tüm kategoriler</option>${categories.map((v) => `<option value="${esc(v)}" ${state.category === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select><select data-o-store><option value="all">Tüm mağazalar</option>${state.stores.map((v) => `<option value="${esc(v.store)}" ${state.store === v.store ? 'selected' : ''}>${esc(v.store)}</option>`).join('')}</select><select data-o-sort><option value="newest" ${state.sort === 'newest' ? 'selected' : ''}>En yeni fırsatlar</option><option value="score" ${state.sort === 'score' ? 'selected' : ''}>Haber değeri</option><option value="price" ${state.sort === 'price' ? 'selected' : ''}>En düşük fiyat</option><option value="discount" ${state.sort === 'discount' ? 'selected' : ''}>En yüksek indirim</option></select><div class="tb-o-status ${state.error ? 'error' : ''}">${esc(state.loading ? 'Karşılaştırma kaynakları taranıyor…' : state.error || `${items.length} ürün gösteriliyor`)}</div></div>
      <div class="tb-o-store-strip">${state.stores.map((store) => `<div class="tb-o-store ${store.product_count ? 'ok' : 'wait'}"><b>${esc(store.store)}</b><span>${store.product_count ? `${store.product_count} güncel fiyat` : 'Kaynak bekleniyor'}${store.checked_at ? ` · ${esc(age(store.checked_at))}` : ''}</span></div>`).join('')}</div>
      ${items.length ? `<div class="tb-o-grid">${items.map(card).join('')}</div>` : `<div class="tb-o-empty">${state.loading ? 'Fiyatlar toplanıyor…' : 'Seçili filtrelerde doğrulanmış teknoloji fırsatı bulunamadı.'}</div>`}
      <div class="tb-o-source-note"><details><summary>Karşılaştırma kaynaklarının durumu</summary><div class="tb-o-source-list">${state.sources.map((source) => `<div class="tb-o-source-row ${source.status === 'error' ? 'error' : ''}"><b>${esc(source.source_name)}</b> · ${source.offer_count || 0} sonuç${source.error_message ? ` · ${esc(source.error_message)}` : ''}</div>`).join('') || 'Henüz tarama kaydı yok.'}</div></details></div>
    </div>`;
    wrap.querySelector('.tb-o-refresh')?.addEventListener('click', () => load(true));
    wrap.querySelector('[data-o-category]')?.addEventListener('change', (e) => { state.category = e.target.value; render(); });
    wrap.querySelector('[data-o-store]')?.addEventListener('change', (e) => { state.store = e.target.value; render(); });
    wrap.querySelector('[data-o-sort]')?.addEventListener('change', (e) => { state.sort = e.target.value; render(); });
    return true;
  }

  async function queue(item, button) {
    const response = await fetch(`/api/intelligence?token=${encodeURIComponent(token())}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_upsert', ...item }) });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); button.textContent = '✓ Eklendi'; button.disabled = true;
  }

  document.addEventListener('click', async (event) => {
    const queueButton = event.target.closest('[data-o-queue]'); const slackButton = event.target.closest('[data-o-slack]');
    if (!queueButton && !slackButton) return;
    const button = queueButton || slackButton; let item;
    try { item = JSON.parse(queueButton?.dataset.oQueue || slackButton?.dataset.oSlack); button.disabled = true;
      if (slackButton) { const response = await fetch('/api/push-to-slack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [item] }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); }
      await queue(item, button); if (slackButton) button.textContent = '✓ Gönderildi';
    } catch (error) { button.disabled = false; alert(`İşlem hatası: ${error.message || error}`); }
  });

  async function load(force = false) {
    if (state.loading) return; state.loading = true; state.error = ''; render();
    try {
      const url = new URL('/api/opportunity-radar', location.origin); url.searchParams.set('limit', '60'); if (force) url.searchParams.set('refresh', '1');
      const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } }); const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      state.items = Array.isArray(data.items) ? data.items : []; state.stores = Array.isArray(data.store_summary) ? data.store_summary : []; state.sources = Array.isArray(data.source_status) ? data.source_status : []; state.refreshedAt = data.refreshed_at;
    } catch (error) { state.error = `Fırsat verisi alınamadı: ${error.message || error}`; }
    finally { state.loading = false; render(); }
  }

  function start() { if (started) return; started = true; let tries = 0; const wait = setInterval(() => { tries += 1; if (render() || tries > 60) { clearInterval(wait); load(); setInterval(load, REFRESH_MS); } }, 250); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
