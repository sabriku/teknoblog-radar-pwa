(() => {
  const PANEL_ID = 'tb-today-published-panel';
  const API_URL = 'https://www.teknoblog.com/wp-json/wp/v2/posts?per_page=20&_embed=1&_=';

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripHtml(value) {
    const el = document.createElement('textarea');
    el.innerHTML = String(value || '').replace(/<[^>]+>/g, ' ');
    return el.value.replace(/\s+/g, ' ').trim();
  }

  function trDateKey(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  function trTime(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function imageOf(post) {
    return post?._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
  }

  function ensureStyle() {
    if (document.getElementById('tb-today-published-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-today-published-style';
    style.textContent = `
      #${PANEL_ID}{border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:14px;box-shadow:0 6px 18px rgba(9,30,66,.06);order:-9999}
      #${PANEL_ID} .tb-today-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      #${PANEL_ID} .tb-today-title{font:700 20px/1 'Fira Sans Condensed',sans-serif;color:#111827}
      #${PANEL_ID} .tb-today-sub{margin-top:5px;font-size:11.5px;color:#64748b;line-height:1.35}
      #${PANEL_ID} .tb-today-count{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:999px;background:#fff1eb;color:#f04a0a;font-size:12px;font-weight:900;border:1px solid #fed7aa}
      #${PANEL_ID} .tb-today-list{display:flex;flex-direction:column;gap:9px;max-height:360px;overflow:auto;padding-right:2px}
      #${PANEL_ID} .tb-today-item{display:grid;grid-template-columns:64px minmax(0,1fr);gap:9px;align-items:start;border:1px solid #eef2f7;border-radius:13px;padding:8px;background:#fff;text-decoration:none;color:inherit}
      #${PANEL_ID} .tb-today-item:hover{border-color:#f04a0a;background:#fff7ed}
      #${PANEL_ID} .tb-today-img{width:64px;aspect-ratio:16/10;object-fit:cover;border-radius:9px;background:#f8fafc}
      #${PANEL_ID} .tb-today-placeholder{width:64px;aspect-ratio:16/10;border-radius:9px;background:#f8fafc;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:18px}
      #${PANEL_ID} .tb-today-item-title{font-size:12px;font-weight:900;line-height:1.25;color:#111827;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      #${PANEL_ID} .tb-today-meta{margin-top:5px;font-size:10.5px;color:#64748b;font-weight:800}
      #${PANEL_ID} .tb-today-empty{border:1px dashed #cbd5e1;border-radius:13px;padding:12px;font-size:12px;color:#64748b;line-height:1.45;background:#f8fafc}
      #${PANEL_ID} .tb-today-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      #${PANEL_ID} .tb-today-actions a,#${PANEL_ID} .tb-today-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:6px 8px;font-size:10.5px;font-weight:900;color:#334155;text-decoration:none;cursor:pointer}
      #${PANEL_ID} .tb-today-actions button{color:#f04a0a;border-color:#fed7aa;background:#fff7ed}
    `;
    document.head.appendChild(style);
  }

  function sidebar() {
    return document.querySelector('#tb-layout aside') || document.querySelector('aside');
  }

  function ensurePanel() {
    ensureStyle();
    const aside = sidebar();
    if (!aside) return null;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      aside.insertBefore(panel, aside.firstChild);
    } else if (panel.parentElement !== aside || aside.firstChild !== panel) {
      aside.insertBefore(panel, aside.firstChild);
    }
    return panel;
  }

  function renderLoading() {
    const panel = ensurePanel();
    if (!panel) return;
    panel.innerHTML = `
      <div class="tb-today-head">
        <div>
          <div class="tb-today-title">Bugün Teknoblog'da Yayımlananlar</div>
          <div class="tb-today-sub">teknoblog.com bugünkü yazılar kontrol ediliyor...</div>
        </div>
        <span class="tb-today-count">…</span>
      </div>
      <div class="tb-today-empty">Yükleniyor...</div>
    `;
  }

  function renderPosts(posts) {
    const panel = ensurePanel();
    if (!panel) return;
    const today = trDateKey(new Date());
    const todays = posts
      .filter((post) => trDateKey(post.date || post.modified || post.date_gmt) === today)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    panel.innerHTML = `
      <div class="tb-today-head">
        <div>
          <div class="tb-today-title">Bugün Teknoblog'da Yayımlananlar</div>
          <div class="tb-today-sub">Bugün yayınlanan Teknoblog yazıları ve kaynak bağlantıları</div>
        </div>
        <span class="tb-today-count">${todays.length}</span>
      </div>
      ${todays.length ? `
        <div class="tb-today-list">
          ${todays.map((post) => {
            const image = imageOf(post);
            const title = stripHtml(post?.title?.rendered || post?.title || 'Başlıksız yazı');
            const link = post.link || 'https://www.teknoblog.com/';
            return `
              <a class="tb-today-item" href="${esc(link)}" target="_blank" rel="noopener noreferrer">
                ${image ? `<img class="tb-today-img" src="${esc(image)}" alt="${esc(title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'tb-today-placeholder',textContent:'📰'}))">` : '<div class="tb-today-placeholder">📰</div>'}
                <div>
                  <div class="tb-today-item-title">${esc(title)}</div>
                  <div class="tb-today-meta">${esc(trTime(post.date))} · Teknoblog</div>
                </div>
              </a>
            `;
          }).join('')}
        </div>
      ` : '<div class="tb-today-empty">Bugün için WordPress REST akışında yayımlanmış Teknoblog yazısı görünmüyor.</div>'}
      <div class="tb-today-actions">
        <a href="https://www.teknoblog.com/" target="_blank" rel="noopener noreferrer">Teknoblog'u aç</a>
        <button type="button" id="tb-today-refresh">Yenile</button>
      </div>
    `;
  }

  function renderError(message) {
    const panel = ensurePanel();
    if (!panel) return;
    panel.innerHTML = `
      <div class="tb-today-head">
        <div>
          <div class="tb-today-title">Bugün Teknoblog'da Yayımlananlar</div>
          <div class="tb-today-sub">Bugünkü yayın listesi alınamadı.</div>
        </div>
        <span class="tb-today-count">!</span>
      </div>
      <div class="tb-today-empty">${esc(message || 'Veri çekilemedi.')}</div>
      <div class="tb-today-actions">
        <a href="https://www.teknoblog.com/" target="_blank" rel="noopener noreferrer">Teknoblog'u aç</a>
        <button type="button" id="tb-today-refresh">Yenile</button>
      </div>
    `;
  }

  async function load() {
    renderLoading();
    try {
      const response = await fetch(API_URL + Date.now(), { cache: 'no-store', mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      renderPosts(Array.isArray(data) ? data : []);
    } catch (error) {
      renderError(error?.message || String(error));
    }
  }

  function keepFirst() {
    const aside = sidebar();
    const panel = document.getElementById(PANEL_ID);
    if (aside && panel && aside.firstChild !== panel) aside.insertBefore(panel, aside.firstChild);
  }

  function start() {
    load();
    document.addEventListener('click', (event) => {
      if (event.target.closest('#tb-today-refresh')) load();
    }, true);
    const observer = new MutationObserver(() => setTimeout(keepFirst, 0));
    const root = document.getElementById('tb-radar-root') || document.body;
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(keepFirst, 750);
    setTimeout(keepFirst, 1600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();