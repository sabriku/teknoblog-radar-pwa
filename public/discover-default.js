(() => {
  const DEFAULT_SORT = 'discover_score';
  const SESSION_KEY = 'tb_force_discover_after_refresh';

  function applyDiscoverSort() {
    const select = document.getElementById('tb-sort');
    if (!select) return false;
    if (select.value !== DEFAULT_SORT) {
      select.value = DEFAULT_SORT;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function watchSortControl() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (applyDiscoverSort() || tries > 30) clearInterval(timer);
    }, 300);

    const root = document.getElementById('app') || document.body;
    const observer = new MutationObserver(() => {
      if (sessionStorage.getItem(SESSION_KEY) === '1') {
        if (applyDiscoverSort()) sessionStorage.removeItem(SESSION_KEY);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('#tb-refresh');
    if (!btn) return;
    sessionStorage.setItem(SESSION_KEY, '1');
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    applyDiscoverSort();
    watchSortControl();
  });
})();
