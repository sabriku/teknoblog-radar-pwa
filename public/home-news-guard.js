(() => {
  function isHome() {
    const path = String(window.location.pathname || '/').replace(/\/+$/, '') || '/';
    return path === '/' || path === '/index.html';
  }

  if (!isHome()) return;

  const LEGACY_SELECTORS = [
    '#tb-google-trends-radar-section',
    '#tb-google-news-wrap',
    '#tb-instagram-radar-wrap',
    '#tb-opportunity-radar-wrap',
    '#tb-opportunity-page-main',
    '#tb-trend-radar-wrap',
    '#tb-phase2-bar',
    '#tb-editorial-center',
    '#tb-editorial-ops-suite',
    '#tb-ops-page-main',
    '#tb-editorial-page-main',
    '.tb-section-kicker'
  ];

  function cleanLegacyPanels() {
    LEGACY_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        const nav = el.closest('#tb-main-tabs');
        const grid = el.closest('#tb-grid');
        if (nav || grid) return;
        el.remove();
      });
    });
  }

  function forceNewsVisible() {
    ['tb-layout', 'tb-status', 'tb-source-tabs', 'tb-grid', 'tb-pagination'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.removeAttribute('data-tb-main-hidden');
      el.style.removeProperty('display');
    });
    const main = document.querySelector('#tb-layout main') || document.querySelector('main');
    if (main) {
      main.removeAttribute('data-tb-main-hidden');
      main.style.removeProperty('display');
    }
    const grid = document.getElementById('tb-grid');
    if (grid) {
      grid.style.display = 'grid';
      if (!grid.style.gridTemplateColumns) grid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(300px,1fr))';
      if (!grid.style.gap) grid.style.gap = '14px';
    }
  }

  function run() {
    cleanLegacyPanels();
    forceNewsVisible();
  }

  function start() {
    run();
    const observer = new MutationObserver(() => window.requestAnimationFrame(run));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tb-main-hidden', 'style'] });
    setTimeout(run, 250);
    setTimeout(run, 1000);
    setTimeout(run, 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
