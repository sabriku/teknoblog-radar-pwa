(() => {
  const STORAGE_KEY = 'tb_instagram_radar_open';
  const REFRESH_MS = 60 * 60 * 1000;
  const state = {
    open: localStorage.getItem(STORAGE_KEY) === '1',
    loading: false,
    items: [],
    error: '',
    refreshedAt: null
  };
  let started = false;
  let timer = null;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul'
    }).format(date);
  }

  function fallbackImage(item = {}) {
    const text = encodeURIComponent((item.source_name || 'Instagram Radar').slice(0, 28));
    return `https://placehold.co/640x360/f8fafc/334155?text=${text}`;
  }

  function findMountTarget() {
    return document.querySelector('#tb-layout main') || document.querySelector('main') || document.querySelector('#tb-radar-root') || document.body;
  }

  function ensureStyle() {
    if (document.getElementById('tb-instagram-radar-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-instagram-radar-style';
    style.textContent = `
      #tb-instagram-radar-wrap{margin:18px 0 34px;border:1px solid #fbcfe8;border-radius:20px;background:#fff;padding:16px;box-shadow:0 8px 24px rgba(190,24,93,.08)}
      #tb-instagram-radar-wrap[data-open='0'] .tb-instagram-body{display:none}
      #tb-instagram-radar-wrap .tb-instagram-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      #tb-instagram-radar-wrap .tb-instagram-toggle{display:flex;align-items:center;gap:10px;cursor:pointer;background:#fdf2f8;border:1px solid #fbcfe8;border-radius:999px;padding:10px 14px;font-weight:800;color:#be185d}
      #tb-instagram-radar-wrap .tb-instagram-toggle b{font:700 20px/1 'Fira Sans Condensed',sans-serif}
      #tb-instagram-radar-wrap .tb-instagram-refresh{border:1px solid #be185d;background:#fff;color:#be185d;padding:9px 12px;border-radius:12px;font-weight:800;cursor:pointer}
      #tb-instagram-radar-wrap .tb-instagram-refresh:disabled{opacity:.7;cursor:wait}
      #tb-instagram-radar-wrap .tb-instagram-status{font-size:12px;color:#64748b;margin-top:10px}
      #tb-instagram-radar-wrap .tb-instagram-status[data-error='1']{color:#b91c1c}
      #tb-instagram-radar-wrap .tb-instagram-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:16px}
      #tb-instagram-radar-wrap article{border:1px solid #fce7f3;border-radius:16px;background:#fff;box-shadow:0 4px 12px rgba(15,23,42,.04);overflow:hidden}
      #tb-instagram-radar-wrap .tb-instagram-image{width:100%;aspect-ratio:16/9;background:#f8fafc;object-fit:cover;display:block;border-bottom:1px solid #fce7f3}
      #tb-instagram-radar-wrap .tb-instagram-inner{padding:12px}
      #tb-instagram-radar-wrap h3{font:700 18px/1.32 'Fira Sans Condensed',sans-serif;color:#111827;margin:8px 0}
      #tb-instagram-radar-wrap .tb-instagram-badge{display:inline-flex;border-radius:999px;padding:6px 9px;background:#fdf2f8;color:#be185d;border:1px solid #f9a8d4;font-size:11px;font-weight:900}
      #tb-instagram-radar-wrap .tb-instagram-meta{display:flex;flex-wrap:wrap;gap:6px;font-size:11px;color:#64748b;margin:8px 0}
      #tb-instagram-radar-wrap .tb-instagram-angle{font-size:12px;line-height:1.45;color:#be185d;font-weight:800;margin-top:8px}
      #tb-instagram-radar-wrap .tb-instagram-hook{font-size:12px;line-height:1.5;color:#475569;margin-top:8px;background:#fdf2f8;border:1px solid #fce7f3;border-radius:12px;padding:9px}
      #tb-instagram-radar-wrap ol{margin:10px 0 0 18px;padding:0;color:#475569;font-size:12px;line-height:1.5}
      #tb-instagram-radar-wrap .tb-instagram-link{display:inline-flex;margin-top:10px;font-size:12px;font-weight:900;color:#be185d;text-decoration:none}
      #tb-instagram-radar-wrap .tb-instagram-link:hover{text-decoration:underline}
      #tb-instagram-radar-wrap .tb-instagram-empty{border:1px dashed #fbcfe8;border-radius:14px;color:#64748b;font-size:13px;margin-top:14px;padding:14px;text-align:center}
    `;
    document.head.appendChild(style);
  }

  function statusText() {
    if (state.loading) return 'Instagram karusel için son 24 saatin haberleri analiz ediliyor...';
    if (state.error) return state.error;
    const strong = state.items.filter((item) => Number(item.instagram_score || 0) >= 70).length;
    return `Son kontrol: ${fmtDate(state.refreshedAt) || 'Henüz yüklenmedi'} · Güçlü karusel adayı: ${strong} · Toplam: ${state.items.length}`;
  }

  function render() {
    ensureStyle();
    const target = findMountTarget();
    if (!target) return false;

    let wrap = document.getElementById('tb-instagram-radar-wrap');
    if (!wrap) {
      wrap = document.createElement('section');
      wrap.id = 'tb-instagram-radar-wrap';
      target.appendChild(wrap);
    }

    wrap.setAttribute('data-open', state.open ? '1' : '0');

    const cards = state.items.map((item) => {
      const img = item.image_url || fallbackImage(item);
      const slides = Array.isArray(item.slide_plan) ? item.slide_plan : [];
      return `
        <article>
          <img class="tb-instagram-image" src="${esc(img)}" alt="${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(fallbackImage(item))}'">
          <div class="tb-instagram-inner">
            <span class="tb-instagram-badge">Instagram ${Number(item.instagram_score || 0)} · Keşfet adayı</span>
            <h3>${esc(item.title)}</h3>
            <div class="tb-instagram-meta">
              <span>${esc(item.source_name || 'Kaynak yok')}</span>
              <span>${esc(fmtDate(item.published_at))}</span>
            </div>
            <div class="tb-instagram-angle">${esc(item.carousel_angle || 'Karusel haber formatı')}</div>
            <div class="tb-instagram-hook">${esc(item.hook_text || '')}</div>
            ${slides.length ? `<ol>${slides.map((slide) => `<li>${esc(slide)}</li>`).join('')}</ol>` : ''}
            <a class="tb-instagram-link" href="${esc(item.url || '#')}" target="_blank" rel="noopener noreferrer">Haberi aç</a>
          </div>
        </article>
      `;
    }).join('');

    wrap.innerHTML = `
      <div class="tb-instagram-head">
        <button type="button" class="tb-instagram-toggle" aria-expanded="${state.open ? 'true' : 'false'}">
          <span>▾</span><b>Instagram Radarı</b>
        </button>
        <button type="button" class="tb-instagram-refresh" ${state.loading ? 'disabled' : ''}>Instagram Adaylarını Yenile</button>
      </div>
      <div class="tb-instagram-body">
        <div class="tb-instagram-status" data-error="${state.error ? '1' : '0'}">${esc(statusText())}</div>
        ${cards ? `<div class="tb-instagram-grid">${cards}</div>` : '<div class="tb-instagram-empty">Son 24 saat içinde Instagram karusel için yeterli aday bulunamadı.</div>'}
      </div>
    `;

    wrap.querySelector('.tb-instagram-toggle')?.addEventListener('click', () => {
      state.open = !state.open;
      localStorage.setItem(STORAGE_KEY, state.open ? '1' : '0');
      render();
    });
    wrap.querySelector('.tb-instagram-refresh')?.addEventListener('click', () => fetchItems(true));
    return true;
  }

  async function fetchItems(force = false) {
    if (state.loading && !force) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const url = new URL('/api/instagram-radar', window.location.origin);
      url.searchParams.set('limit', '18');
      url.searchParams.set('_', Date.now().toString());
      const response = await fetch(url.toString(), { cache: 'no-store', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) throw new Error(data?.error || `HTTP ${response.status}`);
      state.items = Array.isArray(data.items) ? data.items : [];
      state.refreshedAt = data.refreshed_at || new Date().toISOString();
    } catch (error) {
      console.error('Instagram radar error:', error);
      state.error = `Instagram Radarı verisi alınamadı: ${error?.message || 'Bilinmeyen hata'}`;
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
