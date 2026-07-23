(() => {
  const TAB_KEY = 'tb_spa_active_tab';
  const FOCUS_KEY = 'tb_first_mover_focus_v1';
  const VALID_TABS = new Set([
    'news',
    'early-signals',
    'search',
    'sources',
    'opportunities',
    'product-radar',
    'google-trends',
    'google-news',
    'instagram',
    'decision-center'
  ]);

  const LEGACY_TABS = new Set(['decision', 'editorial', 'intelligence', 'ops']);

  const LABELS = {
    news: 'Haberler',
    'early-signals': 'Öncü Radar',
    search: 'Arama',
    sources: 'Kaynaklar',
    opportunities: 'Fırsatlar',
    'product-radar': 'Yeni Ürünler',
    'google-trends': 'Google Trends',
    'google-news': 'Google News',
    instagram: 'Instagram',
    'decision-center': 'Karar Merkezi'
  };

  const ICONS = {
    news: '📰',
    'early-signals': '🚨',
    search: '🔎',
    sources: '🗂️',
    opportunities: '🏷️',
    'product-radar': '🛰️',
    'google-trends': '📈',
    'google-news': '🌐',
    instagram: '📸',
    'decision-center': '🎯'
  };

  function activeFromHash() {
    const hash = decodeURIComponent(String(window.location.hash || '').replace(/^#/, ''));
    if (LEGACY_TABS.has(hash)) return 'decision-center';
    if (VALID_TABS.has(hash)) return hash;
    if (localStorage.getItem(FOCUS_KEY) !== '1') {
      localStorage.setItem(FOCUS_KEY, '1');
      return 'early-signals';
    }
    const saved = localStorage.getItem(TAB_KEY);
    if (LEGACY_TABS.has(saved)) return 'decision-center';
    if (VALID_TABS.has(saved)) return saved;
    return 'early-signals';
  }

  function setActive(tab, push = true) {
    const active = VALID_TABS.has(tab) ? tab : 'news';
    localStorage.setItem(TAB_KEY, active);

    document.querySelectorAll('[data-spa-panel]').forEach((panel) => {
      const isActive = panel.getAttribute('data-spa-panel') === active;
      panel.hidden = !isActive;
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    document.querySelectorAll('[data-spa-tab]').forEach((button) => {
      const isActive = button.getAttribute('data-spa-tab') === active;
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    const title = document.getElementById('tb-spa-current-title');
    const desc = document.getElementById('tb-spa-current-desc');
    if (title) title.textContent = `${ICONS[active] || '•'} ${LABELS[active] || 'Radar'}`;
    if (desc) desc.textContent = descriptionFor(active);

    if (active === 'opportunities') {
      localStorage.setItem('tb_tabs_lite_open', '1');
      localStorage.setItem('tb_tabs_lite_tab', 'opportunity');
    }
    if (active === 'google-news') localStorage.setItem('tb_google_news_open', '1');

    window.dispatchEvent(new CustomEvent('tb-spa-tab-change', { detail: { tab: active } }));

    if (push && window.location.hash !== `#${active}`) {
      history.replaceState(null, '', `#${active}`);
    }
  }

  function descriptionFor(tab) {
    const map = {
      news: 'Ana haber akışı, kaynak filtresi ve görünüm seçenekleri.',
      'early-signals': 'Trend olmadan önce yakalanan ve ilk yayın avantajı sağlayan gelişmeler.',
      search: 'Haberler, Teknoblog arşivi, trend kümeleri ve kaynaklarda birleşik arama.',
      sources: 'RSS kaynaklarını ekleme, toplu içe aktarma ve kaynak listesini yönetme.',
      opportunities: 'Fırsat ve fiyat sinyallerini editoryal bağlamda izleme.',
      'product-radar': 'Resmî ürün ve hizmet duyuruları ile doğrulanmış sosyal videoları birlikte izleme.',
      'google-trends': 'Türkiye Google Trends ve teknoloji sinyalleri.',
      'google-news': 'Google News Türkiye teknoloji gündemi.',
      instagram: 'Mutlaka paylaşılacak Story’ler, Video Reels fikirleri, Akış/karusel önerileri ve hazır açıklama taslakları.',
      'decision-center': 'Güncel sinyallerden yayın kararına, yazılacaklardan gerçek performansa kadar tek çalışma alanı.'
    };
    return map[tab] || 'Teknoblog Radar paneli.';
  }

  function bindTabs() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-spa-tab]');
      if (!button) return;
      event.preventDefault();
      setActive(button.getAttribute('data-spa-tab'));
    });

    document.addEventListener('keydown', (event) => {
      const current = event.target.closest('[data-spa-tab]');
      if (!current) return;
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...document.querySelectorAll('[data-spa-tab]')];
      const index = tabs.indexOf(current);
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      event.preventDefault();
      tabs[nextIndex]?.focus();
      setActive(tabs[nextIndex]?.getAttribute('data-spa-tab'));
    });

    window.addEventListener('hashchange', () => setActive(activeFromHash(), false));
  }

  function start() {
    bindTabs();
    setActive(activeFromHash(), false);
    window.addEventListener('load', () => setActive(activeFromHash(), false));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
