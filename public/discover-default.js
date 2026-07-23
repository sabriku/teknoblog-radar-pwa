(() => {
  const DEFAULT_SORT = 'discover_score';
  const SORT_KEY = 'tb_news_sort';

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

  function applyInitialDefault() {
    const select = document.getElementById('tb-sort');
    if (!select) return false;
    const saved = localStorage.getItem(SORT_KEY);
    const targetSort = [...select.options].some((option) => option.value === saved) ? saved : DEFAULT_SORT;
    if (select.value !== targetSort) {
      select.value = targetSort;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function start() {
    installRecommendationsFallback();
    applyInitialDefault();
    setTimeout(applyInitialDefault, 300);
  }

  installRecommendationsFallback();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
