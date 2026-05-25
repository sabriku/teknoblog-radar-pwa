(() => {
  const ORDER_APPLIED = 'tbSectionOrderApplied';

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function findMain() {
    return qs('#tb-layout main') || qs('main') || qs('#tb-radar-root');
  }

  function findGoogleTrendsSection() {
    const grid = qs('#tb-trend-grid');
    if (!grid) return null;
    const section = grid.closest('section') || grid.parentElement;
    if (section) section.id = section.id || 'tb-google-trends-radar-section';
    return section;
  }

  function ensureStyle() {
    if (qs('#tb-section-order-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-section-order-style';
    style.textContent = `
      .tb-ordered-section{margin-top:18px;margin-bottom:18px;}
      .tb-section-toggle{display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border-radius:999px;border:1px solid #f04a0a;background:#fff;color:#f04a0a;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
      .tb-section-toggle .tb-section-chevron{transition:transform .2s ease;display:inline-block}
      [data-tb-collapsible='1'][data-open='0'] .tb-section-chevron{transform:rotate(-90deg)}
      #tb-google-trends-radar-section[data-open='0'] #tb-trend-status,
      #tb-google-trends-radar-section[data-open='0'] #tb-trend-grid,
      #tb-google-trends-radar-section[data-open='0'] #tb-trend-window-tabs{display:none!important}
      #tb-trend-radar-wrap[data-open='0'] .tb-trend-body{display:none!important}
      #tb-google-news-wrap[data-open='0'] .tb-google-news-body{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function ensureCardAnchor(main) {
    let anchor = qs('#tb-cards-anchor');
    if (anchor) return anchor;

    const grid = qs('#tb-grid');
    if (!grid || !main) return null;

    anchor = document.createElement('div');
    anchor.id = 'tb-cards-anchor';
    anchor.dataset.sectionLabel = 'Kart Haberler';

    const sourceTabs = qs('#tb-source-tabs');
    const pagination = qs('#tb-pagination');

    main.insertBefore(anchor, grid);
    if (sourceTabs) anchor.appendChild(sourceTabs);
    anchor.appendChild(grid);
    if (pagination) anchor.appendChild(pagination);
    return anchor;
  }

  function addToggleToGoogleNews(section) {
    if (!section || section.dataset.tbCollapsible === '1') return;
    section.dataset.tbCollapsible = '1';
    section.setAttribute('data-open', section.getAttribute('data-open') || '0');
    section.classList.add('tb-ordered-section');
  }

  function ensureTrendRadarToggle(section) {
    if (!section) return;
    section.dataset.tbCollapsible = '1';
    section.classList.add('tb-ordered-section');
    if (!section.getAttribute('data-open')) section.setAttribute('data-open', '0');

    const existing = qs('#tb-trend-toggle', section);
    if (existing) return;

    const header = qs('.tb-trend-header', section) || section.firstElementChild || section;
    const button = document.createElement('button');
    button.id = 'tb-trend-toggle';
    button.type = 'button';
    button.className = 'tb-section-toggle';
    button.innerHTML = '<span class="tb-section-chevron">▾</span><span>Göster</span>';
    button.addEventListener('click', () => {
      const open = section.getAttribute('data-open') === '1';
      section.setAttribute('data-open', open ? '0' : '1');
      button.innerHTML = open
        ? '<span class="tb-section-chevron">▾</span><span>Göster</span>'
        : '<span class="tb-section-chevron">▾</span><span>Daralt</span>';
    });
    header.appendChild(button);
  }

  function ensureGoogleTrendsToggle(section) {
    if (!section) return;
    section.dataset.tbCollapsible = '1';
    section.classList.add('tb-ordered-section');
    section.setAttribute('data-open', section.getAttribute('data-open') || '0');

    if (qs('#tb-google-trends-toggle', section)) return;

    const header = section.firstElementChild || section;
    if (header && header.style) {
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'flex-start';
      header.style.gap = '12px';
      header.style.flexWrap = 'wrap';
    }

    const button = document.createElement('button');
    button.id = 'tb-google-trends-toggle';
    button.type = 'button';
    button.className = 'tb-section-toggle';
    button.innerHTML = '<span class="tb-section-chevron">▾</span><span>Göster</span>';
    button.addEventListener('click', () => {
      const open = section.getAttribute('data-open') === '1';
      section.setAttribute('data-open', open ? '0' : '1');
      button.innerHTML = open
        ? '<span class="tb-section-chevron">▾</span><span>Göster</span>'
        : '<span class="tb-section-chevron">▾</span><span>Daralt</span>';
    });

    header.appendChild(button);
  }

  function orderSections() {
    ensureStyle();
    const main = findMain();
    if (!main) return false;

    const cards = ensureCardAnchor(main);
    const googleNews = qs('#tb-google-news-wrap');
    const trendRadar = qs('#tb-trend-radar-wrap');
    const googleTrends = findGoogleTrendsSection();

    if (cards && cards.parentElement !== main) main.appendChild(cards);
    if (cards) main.appendChild(cards);

    if (googleNews) {
      addToggleToGoogleNews(googleNews);
      main.appendChild(googleNews);
    }

    if (trendRadar) {
      ensureTrendRadarToggle(trendRadar);
      main.appendChild(trendRadar);
    }

    if (googleTrends) {
      ensureGoogleTrendsToggle(googleTrends);
      main.appendChild(googleTrends);
    }

    document.body.dataset[ORDER_APPLIED] = '1';
    return true;
  }

  function start() {
    orderSections();
    const observer = new MutationObserver(() => orderSections());
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(orderSections, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
