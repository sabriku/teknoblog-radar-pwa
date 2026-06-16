(() => {
  const LS = 'tb_main_nav_tab';
  const TABS = [
    ['news', 'Haberler'],
    ['writePool', 'Yazılacaklar'],
    ['editorial', 'Editoryal'],
    ['ops', 'Operasyon'],
    ['instagram', 'Instagram'],
    ['opportunity', 'Fırsatlar'],
    ['trends', 'Google Trends'],
    ['googleNews', 'Google News'],
    ['decision', 'Trend/Karar']
  ];
  let active = localStorage.getItem(LS) || 'news';
  if (active === 'sources' || active === 'writeLater') active = 'news';

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
      #tb-layout{display:grid!important;grid-template-columns:minmax(0,1fr) 340px!important;gap:20px!important;align-items:start}
      #tb-layout main{min-width:0!important}
      #tb-layout aside{display:flex!important;min-width:0!important}
      #tb-editorial-center{width:100%!important;max-width:none!important;box-sizing:border-box!important;margin-top:0!important}
      #tb-editorial-center .lite-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))!important;gap:10px!important}
      #tb-editorial-center .tb-lite-card h4{font-size:16px!important}
      #tb-editorial-center .tb-lite-card p,#tb-editorial-center .tb-lite-card li{font-size:11.5px!important}
      #tb-editorial-center .tb-lite-img{max-height:170px!important}
      @media(max-width:960px){#tb-layout{display:block!important}#tb-layout aside{margin-top:12px}}
      @media(max-width:720px){#tb-radar-root{padding:10px!important}#tb-main-tabs{margin:0 -10px 10px;padding:8px 10px;background:#f8fafc}#tb-main-tabs button{padding:8px 10px;font-size:11px}#tb-grid{grid-template-columns:1fr!important;gap:10px!important}#tb-editorial-center .lite-grid{grid-template-columns:1fr!important}}
    `;
  }

  function getMain() {
    const layout = document.getElementById('tb-layout');
    return layout?.querySelector('main') || document.querySelector('main') || document.getElementById('tb-radar-root');
  }

  function moveIntoMain(el) {
    const main = getMain();
    if (!el || !main) return el;
    if (el.parentElement !== main) main.appendChild(el);
    return el;
  }

  function getSections() {
    const layout = document.getElementById('tb-layout');
    const aside = layout?.querySelector('aside');
    return {
      news: [document.getElementById('tb-source-tabs'), document.getElementById('tb-status'), document.getElementById('tb-grid'), document.getElementById('tb-pagination')].filter(Boolean),
      writePool: [moveIntoMain(document.getElementById('tb-write-pool-panel'))].filter(Boolean),
      editorial: [moveIntoMain(document.getElementById('tb-editorial-center'))].filter(Boolean),
      ops: [moveIntoMain(document.getElementById('tb-editorial-ops-suite'))].filter(Boolean),
      instagram: [moveIntoMain(document.getElementById('tb-instagram-radar-wrap'))].filter(Boolean),
      opportunity: [moveIntoMain(document.getElementById('tb-opportunity-radar-wrap'))].filter(Boolean),
      trends: [moveIntoMain(document.getElementById('tb-google-trends-radar-section'))].filter(Boolean),
      googleNews: [moveIntoMain(document.getElementById('tb-google-news-wrap'))].filter(Boolean),
      decision: [moveIntoMain(document.getElementById('tb-trend-radar-wrap')), document.getElementById('tb-phase2-bar')].filter(Boolean),
      persistent: [aside].filter(Boolean)
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

  function openActivePanels(list) {
    list.forEach((el) => {
      if (!el) return;
      el.setAttribute('data-open', '1');
      el.querySelectorAll('.tb-opportunity-body,.tb-google-news-body,.tb-trend-body,#tb-trend-status,#tb-trend-grid,#tb-trend-window-tabs').forEach((child) => { child.style.display = ''; });
      el.querySelectorAll('.tb-section-toggle').forEach((button) => { button.innerHTML = '<span class="tb-section-chevron">▾</span><span>Daralt</span>'; });
    });
  }

  function forceNewsVisible() {
    const main = getMain();
    const layout = document.getElementById('tb-layout');
    [layout, main, document.getElementById('tb-source-tabs'), document.getElementById('tb-status'), document.getElementById('tb-grid'), document.getElementById('tb-pagination')].forEach((el) => {
      if (!el) return;
      el.removeAttribute('data-tb-main-hidden');
    });
    const grid = document.getElementById('tb-grid');
    if (grid) {
      grid.style.display = 'grid';
      if (!grid.style.gridTemplateColumns) grid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(300px,1fr))';
      if (!grid.style.gap) grid.style.gap = '14px';
    }
    const opportunity = document.getElementById('tb-opportunity-radar-wrap');
    if (opportunity) opportunity.setAttribute('data-tb-main-hidden', '1');
  }

  function apply() {
    ensureStyle();
    if (!ensureTabs()) return false;
    const sections = getSections();
    const switchable = new Set([].concat(sections.news, sections.writePool, sections.editorial, sections.ops, sections.instagram, sections.opportunity, sections.trends, sections.googleNews, sections.decision));
    switchable.forEach((el) => el?.setAttribute('data-tb-main-hidden', '1'));
    const activeList = sections[active] || sections.news || [];
    setVisible(activeList, true);
    setVisible(sections.persistent || [], true);
    openActivePanels(activeList);
    if (active === 'news') forceNewsVisible();
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
    document.addEventListener('click', (event) => { if (event.target.closest('[data-phase2-filter]')) setTimeout(apply, 50); }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();