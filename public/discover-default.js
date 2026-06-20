(() => {
  const DEFAULT_SORT = 'discover_score';
  const SESSION_KEY = 'tb_force_discover_after_refresh';
  const USER_CHANGED_KEY = 'tb_sort_user_changed_this_session';

  function installRecommendationsFallback() {
    if (window.__tbNewsRecommendationsFallbackInstalled) return;
    window.__tbNewsRecommendationsFallbackInstalled = true;
    const originalFetch = window.fetch.bind(window);

    function isRecommendationsRequest(input) {
      try {
        const raw = typeof input === 'string' ? input : input?.url || '';
        const url = new URL(raw, window.location.origin);
        return url.pathname === '/api/recommendations';
      } catch {
        return false;
      }
    }

    function scoreFor(item = {}, index = 0) {
      const text = `${item.title || ''} ${item.summary || ''} ${item.source_name || ''}`.toLowerCase();
      let score = Math.max(45, 92 - index * 2);
      if (/openai|chatgpt|gemini|claude|yapay zeka|ai\b/.test(text)) score += 8;
      if (/google|android|apple|iphone|ios|samsung|galaxy|windows|microsoft|nvidia|amd|intel|whatsapp|instagram|youtube/.test(text)) score += 6;
      if (/güncelleme|özellik|sızıntı|iddia|rapor|fiyat|indirim|güvenlik|açık|hack|veri/.test(text)) score += 5;
      return Math.max(1, Math.min(100, Math.round(score)));
    }

    function normalizeFallbackItem(item = {}, index = 0) {
      const discover = scoreFor(item, index);
      const traffic = Math.max(1, Math.min(100, discover - 4));
      const editorial = Math.max(1, Math.min(100, discover - 6));
      return {
        ...item,
        title: item.title || item.candidate_title || 'Başlıksız haber',
        summary: item.summary || item.description || item.excerpt || '',
        url: item.url || item.candidate_url || item.link || '',
        source_name: item.source_name || 'Google News',
        published_at: item.published_at || item.created_at || item.updated_at || new Date().toISOString(),
        image_url: item.image_url || item.image || item.thumbnail || '',
        discover_score: discover,
        traffic_score: traffic,
        editorial_score: editorial,
        conversion_score: Math.max(1, Math.min(100, Math.round(discover * 0.55))),
        social_score: Math.max(1, Math.min(100, Math.round(discover * 0.62))),
        total_score: discover,
        from_news_api_fallback: true
      };
    }

    async function fallbackResponse(reason = '') {
      const response = await originalFetch(`/api/trend-overview?google_news=1&limit=40&fallback_for=recommendations&_=${Date.now()}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) throw new Error(data?.error || `HTTP ${response.status}`);
      const items = (Array.isArray(data.items) ? data.items : []).map(normalizeFallbackItem);
      return new Response(JSON.stringify({
        items,
        filters: {
          sort: DEFAULT_SORT,
          fallback: true,
          fallback_reason: reason || 'recommendations_failed',
          returned_count: items.length
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'x-tb-fallback': 'google-news' }
      });
    }

    window.fetch = async function tbFetchWithRecommendationsFallback(input, init) {
      if (!isRecommendationsRequest(input)) return originalFetch(input, init);
      try {
        const response = await originalFetch(input, init);
        if (response.ok) return response;
        try {
          return await fallbackResponse(`recommendations_http_${response.status}`);
        } catch {
          return response;
        }
      } catch (error) {
        return fallbackResponse(error?.message || 'failed_to_fetch');
      }
    };
  }

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
    installRecommendationsFallback();
    sessionStorage.removeItem(USER_CHANGED_KEY);
    forceDiscover();
    installObservers();
    setTimeout(forceDiscover, 300);
    setTimeout(forceDiscover, 900);
    setTimeout(forceDiscover, 1800);
    setTimeout(forceDiscover, 3200);
  }

  installRecommendationsFallback();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();