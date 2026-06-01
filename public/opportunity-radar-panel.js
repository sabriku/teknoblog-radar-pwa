(() => {
  const STORAGE_KEY = 'tb_opportunity_radar_open';
  const REFRESH_MS = 60 * 60 * 1000;
  const state = {
    open: localStorage.getItem(STORAGE_KEY) === '1',
    loading: false,
    items: [],
    stores: [],
    error: '',
    refreshedAt: null
  };
  let started = false;
  let timer = null;

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtPrice(value) {
    const n = Number(value || 0);
    if (!n) return '-';
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n) + ' TL';
  }

  function fmtDate(value) {
    const d = new Date(value || 0);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul'
    }).format(d);
  }

  function fallbackImage(item = {}) {
    const text = encodeURIComponent((item.store || 'Fırsat').slice(0, 24));
    return `https://placehold.co/640x360/f8fafc/334155?text=${text}`;
  }

  function findMountTarget() {
    return document.querySelector('#tb-layout main') || document.querySelector('main') || document.querySelector('#tb-grid')?.parentElement;
  }

  function ensureStyle() {
    if (document.getElementById('tb-opportunity-radar-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-opportunity-radar-style';
    style.textContent = `
      #tb-opportunity-radar-wrap{margin:18px 0;border:1px solid #fed7aa;border-radius:20px;background:#fff;padding:16px;box-shadow:0 8px 24px rgba(240,74,10,.08)}
      #tb-opportunity-radar-wrap[data-open='0'] .tb-opportunity-body{display:none}
      #tb-opportunity-radar-wrap .tb-opportunity-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      #tb-opportunity-radar-wrap .tb-opportunity-toggle{display:flex;align-items:center;gap:10px;cursor:pointer;background:#fff7ed;border:1px solid #fed7aa;border-radius:999px;padding:10px 14px;font-weight:800;color:#c2410c}
      #tb-opportunity-radar-wrap .tb-opportunity-toggle b{font:700 20px/1 'Fira Sans Condensed',sans-serif}
      #tb-opportunity-radar-wrap .tb-opportunity-refresh{border:1px solid #f04a0a;background:#fff;color:#f04a0a;padding:9px 12px;border-radius:12px;font-weight:800;cursor:pointer}
      #tb-opportunity-radar-wrap .tb-opportunity-refresh:disabled{opacity:.7;cursor:wait}
      #tb-opportunity-radar-wrap .tb-opportunity-status{font-size:12px;color:#64748b;margin-top:10px}
      #tb-opportunity-radar-wrap .tb-opportunity-status[data-error='1']{color:#b91c1c}
      #tb-opportunity-radar-wrap .tb-store-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:12px}
      #tb-opportunity-radar-wrap .tb-store-card{border:1px solid #ffedd5;border-radius:14px;background:#fffaf5;padding:10px}
      #tb-opportunity-radar-wrap .tb-store-card strong{display:block;font-size:12px;color:#111827;margin-bottom:4px}
      #tb-opportunity-radar-wrap .tb-store-card span{display:block;font-size:11px;color:#64748b;line-height:1.4}
      #tb-opportunity-radar-wrap .tb-store-card[data-status='Ürün bulundu']{background:#f0fdf4;border-color:#bbf7d0}
      #tb-opportunity-radar-wrap .tb-store-card[data-status='Erişim sorunu']{background:#fef2f2;border-color:#fecaca}
      #tb-opportunity-radar-wrap .tb-opportunity-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:16px}
      #tb-opportunity-radar-wrap article{border:1px solid #ffedd5;border-radius:16px;background:#fff;box-shadow:0 4px 12px rgba(15,23,42,.04);overflow:hidden}
      #tb-opportunity-radar-wrap .tb-opportunity-image{width:100%;aspect-ratio:16/9;background:#f8fafc;object-fit:cover;display:block;border-bottom:1px solid #ffedd5}
      #tb-opportunity-radar-wrap .tb-opportunity-inner{padding:12px}
      #tb-opportunity-radar-wrap h3{font:700 17px/1.35 'Fira Sans Condensed',sans-serif;color:#111827;margin:8px 0}
      #tb-opportunity-radar-wrap .tb-opportunity-badge{display:inline-flex;border-radius:999px;padding:6px 9px;background:#fff1eb;color:#c2410c;border:1px solid #fdba74;font-size:11px;font-weight:900}
      #tb-opportunity-radar-wrap .tb-opportunity-meta{display:flex;flex-wrap:wrap;gap:6px;font-size:11px;color:#64748b;margin:8px 0}
      #tb-opportunity-radar-wrap .tb-price-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
      #tb-opportunity-radar-wrap .tb-price-box{border:1px solid #e5e7eb;border-radius:12px;padding:8px;background:#f8fafc}
      #tb-opportunity-radar-wrap .tb-price-label{font-size:10px;color:#64748b}
      #tb-opportunity-radar-wrap .tb-price-value{font-size:14px;font-weight:900;color:#111827;margin-top:2px}
      #tb-opportunity-radar-wrap .tb-opportunity-reason{font-size:12px;line-height:1.45;color:#475569;margin-top:8px}
      #tb-opportunity-radar-wrap .tb-opportunity-link{display:inline-flex;margin-top:10px;font-size:12px;font-weight:900;color:#f04a0a;text-decoration:none}
      #tb-opportunity-radar-wrap .tb-opportunity-link:hover{text-decoration:underline}
      #tb-opportunity-radar-wrap .tb-opportunity-empty{border:1px dashed #fed7aa;border-radius:14px;color:#64748b;font-size:13px;margin-top:14px;padding:14px;text-align:center}
    `;
    document.head.appendChild(style);
  }

  function statusText() {
    if (state.loading) return 'E-ticaret mağazalarında teknoloji fırsatları taranıyor...';
    if (state.error) return state.error;
    const hot = state.items.filter((item) => Number(item.score || 0) >= 72).length;
    const foundStores = state.stores.filter((item) => Number(item.product_count || 0) > 0).length;
    return `Son kontrol: ${fmtDate(state.refreshedAt) || 'Henüz yüklenmedi'} · Haberleştirilebilir fırsat: ${hot} · Ürün bulunan mağaza: ${foundStores}/${state.stores.length || '-'}`;
  }

  function renderStores() {
    if (!state.stores.length) return '';
    return `<div class="tb-store-grid">${state.stores.map((store) => `
      <div class="tb-store-card" data-status="${esc(store.status)}">
        <strong>${esc(store.store)}</strong>
        <span>${esc(store.status)} · ${Number(store.product_count || 0)} ürün</span>
        <span>${esc(store.note || '')}</span>
      </div>
    `).join('')}</div>`;
  }

  function render() {
    ensureStyle();
    const target = findMountTarget();
    if (!target) return false;

    let wrap = document.getElementById('tb-opportunity-radar-wrap');
    if (!wrap) {
      wrap = document.createElement('section');
      wrap.id = 'tb-opportunity-radar-wrap';
      target.appendChild(wrap);
    }

    wrap.setAttribute('data-open', state.open ? '1' : '0');

    const cards = state.items.map((item) => {
      const img = item.image_url || fallbackImage(item);
      const rate = Number(item.discount_rate || 0);
      return `
        <article>
          <img class="tb-opportunity-image" src="${esc(img)}" alt="${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(fallbackImage(item))}'">
          <div class="tb-opportunity-inner">
            <span class="tb-opportunity-badge">${esc(item.guidance || 'Takip et')} · ${Number(item.score || 0)}</span>
            <h3>${esc(item.title)}</h3>
            <div class="tb-opportunity-meta">
              <span>${esc(item.store)}</span>
              <span>${rate ? `%${rate} indirim` : 'Fiyat sinyali'}</span>
            </div>
            <div class="tb-price-row">
              <div class="tb-price-box"><div class="tb-price-label">Fırsat fiyatı</div><div class="tb-price-value">${esc(fmtPrice(item.sale_price))}</div></div>
              <div class="tb-price-box"><div class="tb-price-label">Önceki fiyat</div><div class="tb-price-value">${esc(fmtPrice(item.list_price))}</div></div>
            </div>
            <div class="tb-opportunity-reason">${esc(item.reason || '')}</div>
            <a class="tb-opportunity-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Ürünü aç</a>
          </div>
        </article>
      `;
    }).join('');

    wrap.innerHTML = `
      <div class="tb-opportunity-head">
        <button type="button" class="tb-opportunity-toggle" aria-expanded="${state.open ? 'true' : 'false'}">
          <span>▾</span><b>Fırsat Radarı</b>
        </button>
        <button type="button" class="tb-opportunity-refresh" ${state.loading ? 'disabled' : ''}>Fırsatları Yenile</button>
      </div>
      <div class="tb-opportunity-body">
        <div class="tb-opportunity-status" data-error="${state.error ? '1' : '0'}">${esc(statusText())}</div>
        ${renderStores()}
        ${cards ? `<div class="tb-opportunity-grid">${cards}</div>` : '<div class="tb-opportunity-empty">Henüz gösterilecek teknoloji fırsatı bulunamadı. Mağaza durum kartları hangi kaynaklarda parse sorunu olduğunu gösterir.</div>'}
      </div>
    `;

    wrap.querySelector('.tb-opportunity-toggle')?.addEventListener('click', () => {
      state.open = !state.open;
      localStorage.setItem(STORAGE_KEY, state.open ? '1' : '0');
      render();
    });
    wrap.querySelector('.tb-opportunity-refresh')?.addEventListener('click', () => fetchItems(true));
    return true;
  }

  async function fetchItems(force = false) {
    if (state.loading && !force) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const url = new URL('/api/recommendations', window.location.origin);
      url.searchParams.set('opportunity', '1');
      url.searchParams.set('limit', '36');
      url.searchParams.set('_', Date.now().toString());
      const response = await fetch(url.toString(), { cache: 'no-store', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) throw new Error(data?.error || `HTTP ${response.status}`);
      state.items = Array.isArray(data.items) ? data.items : [];
      state.stores = Array.isArray(data.store_summary) ? data.store_summary : [];
      state.refreshedAt = data.refreshed_at || new Date().toISOString();
    } catch (error) {
      console.error('Opportunity radar error:', error);
      state.error = `Fırsat verisi alınamadı: ${error?.message || 'Bilinmeyen hata'}`;
    } finally {
      state.loading = false;
      render();
    }
  }

  function start() {
    if (started) return;
    started = true;
    let tries = 0;
    const wait = setInterval(async () => {
      tries += 1;
      if (render() || tries > 60) {
        clearInterval(wait);
        await fetchItems();
        if (!timer) timer = setInterval(fetchItems, REFRESH_MS);
      }
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
