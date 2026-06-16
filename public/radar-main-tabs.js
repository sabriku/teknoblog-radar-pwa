(() => {
  const LS = 'tb_main_nav_tab';
  const TABS = [
    ['news', 'Haberler'],
    ['editorial', 'Editoryal Komuta Merkezi'],
    ['instagram', 'Instagram Radar'],
    ['opportunity', 'Fırsat Radarı'],
    ['trends', 'Google Trends'],
    ['sources', 'Kaynaklar']
  ];
  let active = localStorage.getItem(LS) || 'news';

  function ensureStyle() {
    if (document.getElementById('tb-main-tabs-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-main-tabs-style';
    style.textContent = `
      #tb-main-tabs{display:flex;gap:8px;overflow:auto;padding:10px 0 14px;margin:-4px 0 14px;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#f8fafc;z-index:50}
      #tb-main-tabs button{flex:0 0 auto;border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer;white-space:nowrap}
      #tb-main-tabs button[aria-selected='true']{border-color:#f04a0a;background:#fff1eb;color:#f04a0a;box-shadow:0 6px 16px rgba(240,74,10,.10)}
      [data-tb-main-hidden='1']{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function getSections() {
    const layout = document.getElementById('tb-layout');
    const main = layout?.querySelector('main');
    const aside = layout?.querySelector('aside');
    return {
      news: [document.getElementById('tb-source-tabs'), main, aside].filter(Boolean),
      editorial: [document.getElementById('tb-editorial-center')].filter(Boolean),
      instagram: [document.getElementById('tb-instagram-radar-wrap')].filter(Boolean),
      opportunity: [document.getElementById('tb-opportunity-radar-wrap')].filter(Boolean),
      trends: [document.getElementById('tb-google-trends-radar-section'), document.getElementById('tb-trend-radar-wrap')].filter(Boolean),
      sources: [aside, document.getElementById('tb-source-tabs')].filter(Boolean)
    };
  }

  function ensureTabs() {
    const root = document.getElementById('tb-radar-root');
    if (!root) return false;
    if (document.getElementById('tb-main-tabs')) return true;
    const header = root.querySelector('header');
    const nav = document.createElement('nav');
    nav.id = 'tb-main-tabs';
    nav.setAttribute('aria-label', 'Radar bölümleri');
    nav.innerHTML = TABS.map(([id, label]) => `<button type="button" data-main-tab="${id}" aria-selected="${active === id ? 'true' : 'false'}">${label}</button>`).join('');
    if (header?.nextSibling) root.insertBefore(nav, header.nextSibling);
    else root.prepend(nav);
    nav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-main-tab]');
      if (!button) return;
      active = button.dataset.mainTab;
      localStorage.setItem(LS, active);
      apply();
    });
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
      if (ok || tries > 80) clearInterval(timer);
    }, 250);
    document.addEventListener('tb:radar-section-ready', apply);
    window.addEventListener('load', apply);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();