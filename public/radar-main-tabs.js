(() => {
  const LINKS = [
    ['/', 'Haberler'],
    ['/sources.html', 'Kaynaklar'],
    ['/opportunities.html', 'Fırsatlar'],
    ['/google-trends-live.html', 'Google Trends'],
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

  function normalizePath(pathname) {
    const p = String(pathname || '/').replace(/\/+$/, '') || '/';
    return p === '/index.html' ? '/' : p;
  }

  function isHome() {
    return normalizePath(window.location.pathname) === '/';
  }

  function ensureStyle() {
    let style = document.getElementById('tb-main-tabs-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tb-main-tabs-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      body{background:#f8fafc!important}
      #tb-radar-root,.tb-page{max-width:1220px!important;margin:0 auto!important;padding:18px 22px!important;border-left:1px solid #e5e7eb!important;border-right:1px solid #e5e7eb!important;background:#f8fafc!important;min-height:100vh!important}
      #tb-radar-root>header,.tb-page-header{display:flex!important;gap:14px!important;justify-content:space-between!important;align-items:flex-end!important;flex-wrap:wrap!important;margin-bottom:16px!important;padding-bottom:12px!important;border-bottom:1px solid #e5e7eb!important}
      .tb-brand-title{font:700 34px/1 'Fira Sans Condensed',sans-serif!important;color:#f04a0a!important;margin:0!important}
      .tb-brand-date{margin-top:8px!important;font-size:14px!important;color:#475569!important}
      .tb-page-context{margin-top:10px!important;display:flex!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important}
      .tb-page-context strong{font-size:13px!important;color:#111827!important;font-weight:900!important}
      .tb-page-context span{font-size:12px!important;color:#64748b!important;line-height:1.45!important}
      .tb-back{display:inline-flex!important;align-items:center!important;text-decoration:none!important;border:1px solid #f04a0a!important;color:#f04a0a!important;background:#fff!important;border-radius:999px!important;padding:9px 12px!important;font-size:12px!important;font-weight:900!important}
      #tb-main-tabs{display:flex!important;gap:6px!important;overflow-x:auto!important;overflow-y:hidden!important;padding:8px 0 10px!important;margin:-6px 0 16px!important;border-bottom:1px solid #e5e7eb!important;position:sticky!important;top:0!important;background:#f8fafc!important;z-index:60!important;scrollbar-width:thin!important;-webkit-overflow-scrolling:touch!important}
      #tb-main-tabs a,.tb-footer-nav a{flex:0 0 auto!important;border:1px solid #d1d5db!important;background:#fff!important;color:#374151!important;border-radius:999px!important;padding:8px 11px!important;font-size:12px!important;font-weight:900!important;cursor:pointer!important;white-space:nowrap!important;line-height:1.1!important;text-decoration:none!important;font-family:'Open Sans',sans-serif!important;display:inline-flex!important;align-items:center!important}
      #tb-main-tabs a[aria-current='page'],.tb-footer-nav a[aria-current='page']{border-color:#f04a0a!important;background:#fff1eb!important;color:#f04a0a!important;box-shadow:0 4px 12px rgba(240,74,10,.10)!important}
      #tb-layout,.tb-page-card{border:1px solid #dbe3ef!important;border-radius:22px!important;background:#fff!important;box-shadow:0 8px 24px rgba(9,30,66,.06)!important;padding:16px!important}
      #tb-layout{display:grid!important;grid-template-columns:minmax(0,1fr) 340px!important;gap:20px!important;align-items:start!important}
      #tb-layout main{min-width:0!important}
      #tb-layout aside{display:flex!important;flex-direction:column!important;gap:16px!important;min-width:0!important}
      .tb-footer-bar{margin:28px 0 8px!important;padding:16px!important;border:1px solid #dbe3ef!important;border-radius:22px!important;background:#fff!important;box-shadow:0 8px 24px rgba(9,30,66,.05)!important}
      .tb-footer-title{font:700 20px/1 'Fira Sans Condensed',sans-serif!important;color:#111827!important;margin-bottom:10px!important}
      .tb-footer-nav{display:flex!important;gap:6px!important;overflow-x:auto!important;padding-bottom:4px!important;scrollbar-width:thin!important}
      @media(max-width:960px){#tb-layout{display:block!important}#tb-layout aside{margin-top:12px!important}}
      @media(max-width:720px){#tb-radar-root,.tb-page{padding:10px!important;border:0!important}.tb-brand-title{font-size:30px!important}#tb-main-tabs{margin:0 -10px 14px!important;padding:8px 10px!important;background:#f8fafc!important}#tb-main-tabs a,.tb-footer-nav a{padding:8px 10px!important;font-size:11px!important}#tb-grid{grid-template-columns:1fr!important;gap:10px!important}}
    `;
  }

  function linkHtml() {
    const current = normalizePath(window.location.pathname);
    return LINKS.map(([href, label]) => {
      const isCurrent = normalizePath(href) === current || (current === '/trends.html' && href === '/google-trends-live.html');
      return `<a href="${href}"${isCurrent ? ' aria-current="page"' : ''}>${label}</a>`;
    }).join('');
  }

  function enhanceHeader() {
    if (isHome()) return;
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

  function moveFooterToBottom(root, footer) {
    if (!root || !footer) return;
    if (root.lastElementChild !== footer) root.appendChild(footer);
  }

  function ensureFooter() {
    const root = document.getElementById('tb-radar-root') || document.querySelector('.tb-page') || document.body;
    if (!root) return;
    let footer = document.getElementById('tb-footer-bar');
    if (!footer) {
      footer = document.createElement('footer');
      footer.id = 'tb-footer-bar';
      footer.className = 'tb-footer-bar';
      footer.innerHTML = `<div class="tb-footer-title">Bölümler</div><nav class="tb-footer-nav" aria-label="Alt radar sayfaları">${linkHtml()}</nav>`;
      root.appendChild(footer);
    }
    moveFooterToBottom(root, footer);
  }

  function watchFooterOrder() {
    const root = document.getElementById('tb-radar-root') || document.querySelector('.tb-page') || document.body;
    if (!root || root.dataset.footerObserver === '1') return;
    root.dataset.footerObserver = '1';
    const observer = new MutationObserver(() => ensureFooter());
    observer.observe(root, { childList: true });
  }

  function start() {
    ensureStyle();
    enhanceHeader();
    ensureNav();
    ensureFooter();
    watchFooterOrder();
    window.addEventListener('load', () => { ensureStyle(); enhanceHeader(); ensureNav(); ensureFooter(); watchFooterOrder(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();