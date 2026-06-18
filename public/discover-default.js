(() => {
  const DEFAULT_SORT = 'discover_score';
  const SESSION_KEY = 'tb_force_discover_after_refresh';
  const USER_CHANGED_KEY = 'tb_sort_user_changed_this_session';

  function isNewsContext() {
    const panel = document.querySelector('[data-spa-panel="news"]');
    if (!panel) return true;
    return !panel.hidden && panel.getAttribute('aria-hidden') !== 'true';
  }

  function applySortValue(targetSort = DEFAULT_SORT, force = false) {
    const select = document.getElementById('tb-sort');
    if (!select || !isNewsContext()) return false;
    if (!force && sessionStorage.getItem(USER_CHANGED_KEY) === '1') return true;
    if (select.value !== targetSort) {
      select.value = targetSort;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function forceDiscover() {
    const applied = applySortValue(DEFAULT_SORT, true);
    if (applied) sessionStorage.removeItem(SESSION_KEY);
    return applied;
  }

  function applyDefaultUnlessUserChanged() {
    return applySortValue(DEFAULT_SORT, false);
  }

  function installObservers() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (sessionStorage.getItem(SESSION_KEY) === '1') {
        if (forceDiscover()) clearInterval(timer);
        return;
      }
      if (applyDefaultUnlessUserChanged() && tries > 5) clearInterval(timer);
      if (tries > 60) clearInterval(timer);
    }, 250);

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => {
        if (sessionStorage.getItem(SESSION_KEY) === '1') forceDiscover();
        else applyDefaultUnlessUserChanged();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });

    window.addEventListener('hashchange', () => {
      if (String(window.location.hash || '') === '#news') setTimeout(applyDefaultUnlessUserChanged, 80);
    });
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('#tb-refresh');
    if (!btn) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    sessionStorage.removeItem(USER_CHANGED_KEY);
  }, true);

  document.addEventListener('change', (event) => {
    const select = event.target.closest('#tb-sort');
    if (!select) return;
    if (select.value !== DEFAULT_SORT) sessionStorage.setItem(USER_CHANGED_KEY, '1');
    else sessionStorage.removeItem(USER_CHANGED_KEY);
  });

  function start() {
    sessionStorage.removeItem(USER_CHANGED_KEY);
    forceDiscover();
    installObservers();
    setTimeout(forceDiscover, 300);
    setTimeout(forceDiscover, 900);
    setTimeout(forceDiscover, 1800);
    setTimeout(forceDiscover, 3200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();