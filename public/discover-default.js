(() => {
  const DEFAULT_SORT = 'discover_score';
  const SORT_KEY = 'tb_news_sort';

  function timeValue(item = {}) {
    const raw = item.published_at || item.created_at || item.updated_at || 0;
    const time = new Date(raw).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function ageHours(item = {}) {
    const time = timeValue(item);
    return time ? Math.max(0, (Date.now() - time) / 3600000) : 999999;
  }

  function numeric(item = {}, key, fallback = 0) {
    const value = Number(item?.[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function freshnessScore(item = {}) {
    const hours = ageHours(item);
    if (hours <= 1) return 100;
    if (hours <= 3) return 94;
    if (hours <= 6) return 86;
    if (hours <= 12) return 76;
    if (hours <= 18) return 66;
    if (hours <= 24) return 56;
    if (hours <= 36) return 38;
    if (hours <= 48) return 24;
    return 0;
  }

  function newsPriorityScore(item = {}) {
    const discover = Math.max(
      numeric(item, 'discover_score'),
      numeric(item, 'radar_discover_score'),
      numeric(item, 'discover_probability')
    );
    const freshness = freshnessScore(item);
    const hours = ageHours(item);
    const stalePenalty = hours > 24 ? Math.min(60, (hours - 24) * 1.8) : 0;
    return Math.round(discover * 0.68 + freshness * 0.32 - stalePenalty);
  }

  function shouldBlendFreshness(rawUrl = '') {
    try {
      const url = new URL(rawUrl, window.location.origin);
      return url.pathname === '/api/recommendations' && (url.searchParams.get('sort') || DEFAULT_SORT) === DEFAULT_SORT;
    } catch {
      return false;
    }
  }

  function reorderDiscoverItems(data = {}) {
    if (!Array.isArray(data.items)) return data;
    const items = data.items.map((item) => ({
      ...item,
      news_priority_score: newsPriorityScore(item),
      freshness_score: freshnessScore(item)
    })).sort((a, b) => {
      const priorityDiff = numeric(b, 'news_priority_score') - numeric(a, 'news_priority_score');
      if (priorityDiff) return priorityDiff;
      const discoverDiff = numeric(b, 'discover_score') - numeric(a, 'discover_score');
      if (discoverDiff) return discoverDiff;
      return timeValue(b) - timeValue(a);
    });
    return {
      ...data,
      items,
      filters: {
        ...(data.filters || {}),
        sort: DEFAULT_SORT,
        display_order: 'discover_freshness_blended',
        discover_weight: 0.68,
        freshness_weight: 0.32,
        returned_count: items.length
      }
    };
  }

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
      return new Response(JSON.stringify(reorderDiscoverItems({
        items,
        filters: {
          sort: DEFAULT_SORT,
          fallback: true,
          fallback_reason: reason || 'recommendations_failed',
          returned_count: items.length
        }
      })), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'x-tb-fallback': 'google-news' }
      });
    }

    window.fetch = async function tbFetchWithRecommendationsFallback(input, init) {
      if (!isRecommendationsRequest(input)) return originalFetch(input, init);
      const raw = typeof input === 'string' ? input : input?.url || '';
      try {
        const response = await originalFetch(input, init);
        if (!response.ok) {
          try {
            return await fallbackResponse(`recommendations_http_${response.status}`);
          } catch {
            return response;
          }
        }
        if (!shouldBlendFreshness(raw)) return response;
        const data = await response.clone().json().catch(() => null);
        if (!data || !Array.isArray(data.items)) return response;
        return new Response(JSON.stringify(reorderDiscoverItems(data)), {
          status: response.status,
          statusText: response.statusText,
          headers: { 'content-type': 'application/json; charset=utf-8', 'x-tb-order': 'discover-freshness' }
        });
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
