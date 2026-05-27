(() => {
  let observer = null;
  let scheduled = false;
  let lastSignature = '';

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

  function loadFlowGuard() {
    if (document.getElementById('tb-news-card-flow-guard-loader')) return;
    const script = document.createElement('script');
    script.id = 'tb-news-card-flow-guard-loader';
    script.src = '/news-card-flow-guard.js?v=20260524-1';
    script.defer = true;
    document.head.appendChild(script);
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

    if (sourceTabs) anchor.appendChild(sourceTabs);
    anchor.appendChild(grid);
    if (pagination) anchor.appendChild(pagination);
    return anchor;
  }

  function setButtonLabel(button, open) {
    button.innerHTML = open
      ? '<span class="tb-section-chevron">▾</span><span>Daralt</span>'
      : '<span class="tb-section-chevron">▾</span><span>Göster</span>';
  }

  function makeCollapsible(section, buttonId, bodySelector) {
    if (!section) return;
    section.dataset.tbCollapsible = '1';
    section.classList.add('tb-ordered-section');
    if (!section.getAttribute('data-open')) section.setAttribute('data-open', '0');

    if (qs(`#${buttonId}`, section)) return;

    const header = qs('.tb-trend-header', section) || section.firstElementChild || section;
    const button = document.createElement('button');
    button.id = buttonId;
    button.type = 'button';
    button.className = 'tb-section-toggle';
    setButtonLabel(button, section.getAttribute('data-open') === '1');
    button.addEventListener('click', () => {
      const nextOpen = section.getAttribute('data-open') !== '1';
      section.setAttribute('data-open', nextOpen ? '1' : '0');
      setButtonLabel(button, nextOpen);
      if (bodySelector) {
        section.querySelectorAll(bodySelector).forEach((el) => {
          el.style.display = nextOpen ? '' : 'none';
        });
      }
    });

    if (header && header.style) {
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'flex-start';
      header.style.gap = '12px';
      header.style.flexWrap = 'wrap';
    }

    header.appendChild(button);
  }

  function appendIfNeeded(parent, child) {
    if (!parent || !child) return false;
    if (child.parentElement === parent && parent.lastElementChild === child) return false;
    parent.appendChild(child);
    return true;
  }

  function signature(main, sections) {
    return sections
      .filter(Boolean)
      .map((el) => `${el.id || el.dataset.sectionLabel || el.tagName}:${el.parentElement === main ? 'main' : 'other'}:${Array.prototype.indexOf.call(main.children, el)}`)
      .join('|');
  }

  function orderSections() {
    ensureStyle();
    loadFlowGuard();
    const main = findMain();
    if (!main) return false;

    const cards = ensureCardAnchor(main);
    const googleNews = qs('#tb-google-news-wrap');
    const trendRadar = qs('#tb-trend-radar-wrap');
    const googleTrends = findGoogleTrendsSection();
    const sections = [cards, googleNews, trendRadar, googleTrends].filter(Boolean);

    const currentSignature = signature(main, sections);
    if (currentSignature === lastSignature && sections.length >= 2) return true;

    if (observer) observer.disconnect();

    if (cards) appendIfNeeded(main, cards);
    if (googleNews) {
      makeCollapsible(googleNews, 'tb-google-news-section-toggle', '.tb-google-news-body');
      appendIfNeeded(main, googleNews);
    }
    if (trendRadar) {
      makeCollapsible(trendRadar, 'tb-trend-toggle', '.tb-trend-body');
      appendIfNeeded(main, trendRadar);
    }
    if (googleTrends) {
      makeCollapsible(googleTrends, 'tb-google-trends-toggle', '#tb-trend-status,#tb-trend-grid,#tb-trend-window-tabs');
      appendIfNeeded(main, googleTrends);
    }

    lastSignature = signature(main, sections);

    if (observer) observer.observe(document.body, { childList: true, subtree: true });
    return true;
  }

  function scheduleOrder() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      orderSections();
    });
  }

  function start() {
    orderSections();
    observer = new MutationObserver(scheduleOrder);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(orderSections, 800);
    setTimeout(orderSections, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();