(() => {
  const TAB_KEY = 'tb_spa_active_tab';
  const VALID_TABS = new Set([
    'news',
    'search',
    'sources',
    'opportunities',
    'google-trends',
    'google-news',
    'instagram',
    'decision',
    'editorial',
    'intelligence',
    'ops'
  ]);

  const LABELS = {
    news: 'Haberler',
    search: 'Arama',
    sources: 'Kaynaklar',
    opportunities: 'Fırsatlar',
    'google-trends': 'Google Trends',
    'google-news': 'Google News',
    instagram: 'Instagram',
    decision: 'Trend/Karar',
    editorial: 'Editoryal',
    intelligence: 'Radar Intelligence',
    ops: 'Operasyon'
  };

  const ICONS = {
    news: '📰',
    search: '🔎',
    sources: '🗂️',
    opportunities: '🏷️',
    'google-trends': '📈',
    'google-news': '🌐',
    instagram: '📸',
    decision: '⚡',
    editorial: '🧭',
    intelligence: '🧠',
    ops: '🛠️'
  };

  function activeFromHash() {
    const hash = decodeURIComponent(String(window.location.hash || '').replace(/^#/, ''));
    if (VALID_TABS.has(hash)) return hash;
    const saved = localStorage.getItem(TAB_KEY);
    if (VALID_TABS.has(saved)) return saved;
    return 'news';
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
    if (active === 'editorial') {
      localStorage.setItem('tb_tabs_lite_open', '1');
      localStorage.setItem('tb_tabs_lite_tab', 'today');
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
      search: 'Haberler, Teknoblog arşivi, trend kümeleri ve kaynaklarda birleşik arama.',
      sources: 'RSS kaynaklarını ekleme, toplu içe aktarma ve kaynak listesini yönetme.',
      opportunities: 'Fırsat ve fiyat sinyallerini editoryal bağlamda izleme.',
      'google-trends': 'Türkiye Google Trends ve teknoloji sinyalleri.',
      'google-news': 'Google News Türkiye teknoloji gündemi.',
      instagram: 'Instagram karusel ve sosyal medya potansiyeli yüksek içerikler.',
      decision: 'Trend kümeleri ve haberleştirme kararı katmanı.',
      editorial: 'Günlük yazılacak haberler ve Discover adayları.',
      intelligence: 'Kümeler, kapsam boşlukları, iş akışı, gerçek performans ve sistem sağlığı.',
      ops: 'Operasyon, sağlık ve bakım kontrolleri.'
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
