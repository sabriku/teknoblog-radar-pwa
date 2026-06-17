(() => {
  const LINKS = [
    ['/', 'Haberler'],
    ['/sources.html', 'Kaynaklar'],
    ['/opportunities.html', 'Fırsatlar'],
    ['/trends.html', 'Google Trends'],
    ['/google-news.html', 'Google News'],
    ['/instagram.html', 'Instagram'],
    ['/decision.html', 'Trend/Karar'],
    ['/editorial.html', 'Editoryal'],
    ['/ops.html', 'Operasyon']
  ];

  function todayLabel() {
    return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date());
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureStyle() {
    let style = document.getElementById('tb-main-tabs-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tb-main-tabs-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      .tb-page{border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;background:#f8fafc;min-height:100vh}
      .tb-page-header{display:flex!important;gap:14px!important;justify-content:space-between!important;align-items:flex-end!important;flex-wrap:wrap!important;margin-bottom:16px!important;padding-bottom:12px!important;border-bottom:1px solid #e5e7eb!important}
      .tb-brand-title{font:700 34px/1 'Fira Sans Condensed',sans-serif!important;color:#f04a0a!important;margin:0!important}
      .tb-brand-date{margin-top:8px!important;font-size:14px!important;color:#475569!important}
      .tb-page-context{margin-top:10px!important;display:flex!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important}
      .tb-page-context strong{font-size:13px!important;color:#111827!important;font-weight:900!important}
      .tb-page-context span{font-size:12px!important;color:#64748b!important;line-height:1.45!important}
      .tb-back{display:inline-flex!important;align-items:center!important;text-decoration:none!important;border:1px solid #f04a0a!important;color:#f04a0a!important;background:#fff!important;border-radius:999px!important;padding:9px 12px!important;font-size:12px!important;font-weight:900!important}
      #tb-main-tabs{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;padding:8px 0 10px;margin:-6px 0 16px;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8fafc;z-index:60;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
      #tb-main-tabs a,.tb-footer-nav a{flex:0 0 auto;border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap;line-height:1.1;text-decoration:none;font-family:'Open Sans',sans-serif;display:inline-flex;align-items:center}
      #tb-main-tabs a[aria-current='page'],.tb-footer-nav a[aria-current='page']{border-color:#f04a0a;background:#fff1eb;color:#f04a0a;box-shadow:0 4px 12px rgba(240,74,10,.10)}
      .tb-page-card{border:1px solid #dbe3ef!important;border-radius:22px!important;background:#fff!important;box-shadow:0 8px 24px rgba(9,30,66,.06)!important}
      .tb-footer-bar{margin:28px 0 8px;padding:16px;border:1px solid #dbe3ef;border-radius:22px;background:#fff;box-shadow:0 8px 24px rgba(9,30,66,.05)}
      .tb-footer-title{font:700 20px/1 'Fira Sans Condensed',sans-serif;color:#111827;margin-bottom:10px}
      .tb-footer-nav{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
      #tb-layout{display:grid!important;grid-template-columns:minmax(0,1fr) 340px!important;gap:20px!important;align-items:start}
      #tb-layout main{min-width:0!important}
      #tb-layout aside{display:flex!important;min-width:0!important}
      @media(max-width:960px){#tb-layout{display:block!important}#tb-layout aside{margin-top:12px}}
      @media(max-width:720px){#tb-radar-root{padding:10px!important}.tb-brand-title{font-size:30px!important}#tb-main-tabs{margin:0 -10px 14px;padding:8px 10px;background:#f8fafc}#tb-main-tabs a,.tb-footer-nav a{padding:8px 10px;font-size:11px}#tb-grid{grid-template-columns:1fr!important;gap:10px!important}}
    `;
  }

  function normalizePath(pathname) {
    const p = String(pathname || '/').replace(/\/+$/, '') || '/';
    return p === '/index.html' ? '/' : p;
  }

  function linkHtml() {
    const current = normalizePath(window.location.pathname);
    return LINKS.map(([href, label]) => {
      const isCurrent = normalizePath(href) === current;
      return `<a href="${href}"${isCurrent ? ' aria-current="page"' : ''}>${label}</a>`;
    }).join('');
  }

  function enhanceHeader() {
    const root = document.getElementById('tb-radar-root') || document.querySelector('.tb-page') || document.body;
    const header = root.querySelector(':scope > header') || root.querySelector('.tb-page-header');
    if (!header || header.dataset.sharedRadarHeader === '1') return;
    const title = header.querySelector('h1')?.textContent?.trim() || document.title.replace(' - Teknoblog Radar', '') || 'Radar';
    const desc = header.querySelector('p,.sub')?.textContent?.trim() || '';
    const back = header.querySelector('a[href]')?.getAttribute('href') || '/';
    header.classList.add('tb-page-header');
    header.dataset.sharedRadarHeader = '1';
    header.innerHTML = `
      <div>
        <div class="tb-brand-title">Teknoblog İçerik Radar</div>
        <div class="tb-brand-date">${esc(todayLabel())}</div>
        <div class="tb-page-context"><strong>${esc(title)}</strong>${desc ? `<span>${esc(desc)}</span>` : ''}</div>
      </div>
      <a class="tb-back" href="${esc(back)}">← Radara dön</a>
    `;
  }

  function ensureNav() {
    const root = document.getElementById('tb-radar-root') || document.querySelector('.tb-page') || document.body;
    if (!root) return false;
    let nav = document.getElementById('tb-main-tabs');
    if (!nav) {
      const header = root.querySelector('header');
      nav = document.createElement('nav');
      nav.id = 'tb-main-tabs';
      nav.setAttribute('aria-label', 'Radar sayfaları');
      if (header?.nextSibling) root.insertBefore(nav, header.nextSibling);
      else root.prepend(nav);
    }
    const html = linkHtml();
    if (nav.innerHTML !== html) nav.innerHTML = html;
    return true;
  }

  function ensureFooter() {
    const root = document.getElementById('tb-radar-root') || document.querySelector('.tb-page') || document.body;
    if (!root || document.getElementById('tb-footer-bar')) return;
    const footer = document.createElement('footer');
    footer.id = 'tb-footer-bar';
    footer.className = 'tb-footer-bar';
    footer.innerHTML = `<div class="tb-footer-title">Bölümler</div><nav class="tb-footer-nav" aria-label="Alt radar sayfaları">${linkHtml()}</nav>`;
    root.appendChild(footer);
  }

  function start() {
    ensureStyle();
    enhanceHeader();
    ensureNav();
    ensureFooter();
    window.addEventListener('load', () => { ensureStyle(); enhanceHeader(); ensureNav(); ensureFooter(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();