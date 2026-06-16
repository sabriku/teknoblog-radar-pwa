(() => {
  const LS = 'tb_main_nav_tab';
  const TABS = [
    ['news', 'Haberler'],
    ['editorial', 'Editoryal'],
    ['instagram', 'Instagram'],
    ['opportunity', 'Fırsatlar'],
    ['trends', 'Google Trends'],
    ['googleNews', 'Google News'],
    ['decision', 'Trend/Karar'],
    ['sources', 'Kaynaklar']
  ];
  let active = localStorage.getItem(LS) || 'news';

  function ensureStyle() {
    let style = document.getElementById('tb-main-tabs-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tb-main-tabs-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      #tb-main-tabs{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;padding:8px 0 10px;margin:-6px 0 12px;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8fafc;z-index:60;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
      #tb-main-tabs button{flex:0 0 auto;border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap;line-height:1.1}
      #tb-main-tabs button[aria-selected='true']{border-color:#f04a0a;background:#fff1eb;color:#f04a0a;box-shadow:0 4px 12px rgba(240,74,10,.10)}
      [data-tb-main-hidden='1']{display:none!important}
      @media(max-width:720px){
        #tb-radar-root{padding:10px!important}
        #tb-main-tabs{margin:0 -10px 10px;padding:8px 10px;background:#f8fafc}
        #tb-main-tabs button{padding:8px 10px;font-size:11px}
        #tb-layout{display:block!important}
        #tb-layout aside{margin-top:12px}
        #tb-grid{grid-template-columns:1fr!important;gap:10px!important}
      }
    `;
  }

  function closestSection(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    return el.closest('section') || el.closest('[id$="wrap"]') || el.parentElement;
  }

  function getSections() {
    const layout = document.getElementById('tb-layout');
    const main = layout?.querySelector('main');
    const aside = layout?.querySelector('aside');
    const cards = document.getElementById('tb-cards-anchor') || document.getElementById('tb-grid')?.parentElement || main;
    return {
      news: [document.getElementById('tb-source-tabs'), cards].filter(Boolean),
      editorial: [document.getElementById('tb-editorial-center')].filter(Boolean),
      instagram: [document.getElementById('tb-instagram-radar-wrap')].filter(Boolean),
      opportunity: [document.getElementById('tb-opportunity-radar-wrap')].filter(Boolean),
      trends: [document.getElementById('tb-google-trends-radar-section')].filter(Boolean),
      googleNews: [document.getElementById('tb-google-news-wrap')].filter(Boolean),
      decision: [document.getElementById('tb-trend-radar-wrap'), document.getElementById('tb-phase2-bar')].filter(Boolean),
      sources: [aside, document.getElementById('tb-source-tabs')].filter(Boolean)
    };
  }

  function ensureTabs() {
    const root = document.getElementById('tb-radar-root');
    if (!root) return false;
    let nav = document.getElementById('tb-main-tabs');
    if (!nav) {
      const header = root.querySelector('header');
      nav = document.createElement('nav');
      nav.id = 'tb-main-tabs';
      nav.setAttribute('aria-label', 'Radar bölümleri');
      if (header?.nextSibling) root.insertBefore(nav, header.nextSibling);
      else root.prepend(nav);
      nav.addEventListener('click', (event) => {
        const button = event.target.closest('[data-main-tab]');
        if (!button) return;
        active = button.dataset.mainTab;
        localStorage.setItem(LS, active);
        apply();
      });
    }
    const html = TABS.map(([id, label]) => `<button type="button" data-main-tab="${id}" aria-selected="${active === id ? 'true' : 'false'}">${label}</button>`).join('');
    if (nav.innerHTML !== html) nav.innerHTML = html;
    return true;
  }

  function setVisible(list, visible) {
    list.forEach((el) => {
      if (!el) return;
      if (visible) el.removeAttribute('data-tb-main-hidden');
      else el.setAttribute('data-tb-main-hidden', '1');
    });
  }

  function apply() {
    ensureStyle();
    if (!ensureTabs()) return false;
    const sections = getSections();
    const all = new Set(Object.values(sections).flat());
    all.forEach((el) => el?.setAttribute('data-tb-main-hidden', '1'));
    setVisible(sections[active] || sections.news || [], true);
    document.querySelectorAll('#tb-main-tabs [data-main-tab]').forEach((button) => button.setAttribute('aria-selected', button.dataset.mainTab === active ? 'true' : 'false'));
    return true;
  }

  function start() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const ok = apply();
      if (ok || tries > 100) clearInterval(timer);
    }, 250);
    document.addEventListener('tb:radar-section-ready', apply);
    window.addEventListener('load', apply);
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-phase2-filter]')) setTimeout(apply, 50);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();