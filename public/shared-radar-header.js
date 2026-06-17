(() => {
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
    let style = document.getElementById('tb-shared-header-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tb-shared-header-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      .tb-page-header{display:flex!important;gap:14px!important;justify-content:space-between!important;align-items:flex-end!important;flex-wrap:wrap!important;margin-bottom:16px!important}
      .tb-brand-title{font:700 34px/1 'Fira Sans Condensed',sans-serif!important;color:#f04a0a!important;margin:0!important}
      .tb-brand-date{margin-top:8px!important;font-size:14px!important;color:#475569!important}
      .tb-page-context{margin-top:10px!important;display:flex!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important}
      .tb-page-context strong{font-size:13px!important;color:#111827!important;font-weight:900!important}
      .tb-page-context span{font-size:12px!important;color:#64748b!important;line-height:1.45!important}
      .tb-back{display:inline-flex!important;align-items:center!important;text-decoration:none!important;border:1px solid #f04a0a!important;color:#f04a0a!important;background:#fff!important;border-radius:999px!important;padding:9px 12px!important;font-size:12px!important;font-weight:900!important}
      @media(max-width:720px){.tb-brand-title{font-size:30px!important}.tb-page-header{align-items:flex-start!important}}
    `;
  }

  function start() {
    ensureStyle();
    const header = document.querySelector('.tb-page-header');
    if (!header || header.dataset.sharedRadarHeader === '1') return;
    const title = header.querySelector('h1')?.textContent?.trim() || document.title.replace(' - Teknoblog Radar', '') || 'Radar';
    const desc = header.querySelector('p,.sub')?.textContent?.trim() || '';
    const back = header.querySelector('a[href]')?.getAttribute('href') || '/';
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
