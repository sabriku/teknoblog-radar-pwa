(() => {
  const DEFAULT_SORT = 'discover_score';
  const SESSION_KEY = 'tb_force_discover_after_refresh';
  const PREF_KEY = 'tb_preferred_sort';

  function getPreferredSort() {
    return localStorage.getItem(PREF_KEY) || DEFAULT_SORT;
  }

  function setPreferredSort(value) {
    try {
      localStorage.setItem(PREF_KEY, value || DEFAULT_SORT);
    } catch {}
  }

  function applySortValue(targetSort) {
    const select = document.getElementById('tb-sort');
    if (!select) return false;
    if (select.value !== targetSort) {
      select.value = targetSort;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function applyPreferredSort() {
    return applySortValue(getPreferredSort());
  }

  function forceDiscoverAfterRefresh() {
    if (sessionStorage.getItem(SESSION_KEY) !== '1') return false;
    const applied = applySortValue(DEFAULT_SORT);
    if (applied) {
      setPreferredSort(DEFAULT_SORT);
      sessionStorage.removeItem(SESSION_KEY);
    }
    return applied;
  }

  function installObservers() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (forceDiscoverAfterRefresh()) return clearInterval(timer);
      if (applyPreferredSort() && tries > 3) return clearInterval(timer);
      if (tries > 40) clearInterval(timer);
    }, 300);

    const root = document.getElementById('app') || document.body;
    const observer = new MutationObserver(() => {
      if (sessionStorage.getItem(SESSION_KEY) === '1') {
        forceDiscoverAfterRefresh();
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('#tb-refresh');
    if (!btn) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    setPreferredSort(DEFAULT_SORT);
  }, true);

  document.addEventListener('change', (event) => {
    const select = event.target.closest('#tb-sort');
    if (!select) return;
    setPreferredSort(select.value || DEFAULT_SORT);
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem(PREF_KEY)) setPreferredSort(DEFAULT_SORT);
    applyPreferredSort();
    installObservers();
    setTimeout(forceDiscoverAfterRefresh, 800);
    setTimeout(forceDiscoverAfterRefresh, 1800);
    setTimeout(forceDiscoverAfterRefresh, 3200);
  });
})();
