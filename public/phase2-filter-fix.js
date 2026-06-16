(() => {
  const KEY = 'tb_phase2_filter';

  function currentFilter() {
    return localStorage.getItem(KEY) || 'all';
  }

  function articleHasTrend(article) {
    return Boolean(article?.querySelector?.('[data-phase2-host], .tb-phase2-badges, .tb-phase2-cluster'));
  }

  function articleText(article) {
    return String(article?.textContent || '').toLowerCase();
  }

  function match(article, filter) {
    if (!article) return false;
    if (filter === 'all') return true;
    const text = articleText(article);
    if (filter === 'trend') return articleHasTrend(article) || /trend\s+\d|trend kümesi/.test(text);
    if (filter === 'signal') return /erken sinyal güçlü|erken sinyal\s*[5-9][0-9]|erken sinyal\s*100/.test(text);
    if (filter === 'gap') return /rakip boşluğu/.test(text);
    return true;
  }

  function cards() {
    const grid = document.getElementById('tb-grid');
    if (!grid) return [];
    return [...grid.querySelectorAll('article')];
  }

  function updateButtons(filter) {
    document.querySelectorAll('[data-phase2-filter]').forEach((button) => {
      const active = button.getAttribute('data-phase2-filter') === filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function ensureEmptyMessage(filter, visibleCount) {
    const grid = document.getElementById('tb-grid');
    if (!grid) return;
    let empty = document.getElementById('tb-phase2-empty');
    if (visibleCount > 0 || filter === 'all') {
      if (empty) empty.remove();
      return;
    }
    if (!empty) {
      empty = document.createElement('div');
      empty.id = 'tb-phase2-empty';
      empty.style.padding = '16px';
      empty.style.border = '1px dashed #cbd5e1';
      empty.style.borderRadius = '14px';
      empty.style.background = '#fff';
      empty.style.color = '#64748b';
      empty.style.fontSize = '13px';
      empty.style.gridColumn = '1 / -1';
      grid.appendChild(empty);
    }
    const labels = { trend: 'trend bağlı', signal: 'erken sinyal', gap: 'rakip boşluğu' };
    empty.textContent = `Bu sayfada ${labels[filter] || filter} filtresine uyan kart bulunamadı. Tüm kartlar sekmesine dönebilir veya sonraki sayfayı kontrol edebilirsin.`;
  }

  function applyFilter() {
    const filter = currentFilter();
    let visible = 0;
    cards().forEach((article) => {
      const ok = match(article, filter);
      article.style.display = ok ? '' : 'none';
      if (ok) visible += 1;
    });
    updateButtons(filter);
    ensureEmptyMessage(filter, visible);
  }

  function scheduleApply() {
    setTimeout(applyFilter, 0);
    setTimeout(applyFilter, 250);
    setTimeout(applyFilter, 900);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-phase2-filter]');
    if (!button) return;
    const value = button.getAttribute('data-phase2-filter') || 'all';
    localStorage.setItem(KEY, value);
    scheduleApply();
  }, true);

  const observer = new MutationObserver(scheduleApply);

  function start() {
    const grid = document.getElementById('tb-grid');
    if (grid) observer.observe(grid, { childList: true, subtree: true });
    scheduleApply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();