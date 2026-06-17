(() => {
  function loadScriptOnce(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  }

  function loadNavigationHelpers() {
    loadScriptOnce('tb-main-radar-tabs-loader-v14', '/radar-main-tabs.js?v=20260524-14');
  }

  function cleanupBtn() { return document.getElementById('tb-cleanup'); }
  function cleanupStatusEl() { return document.getElementById('tb-cleanup-status'); }

  function setLoading(isLoading) {
    const btn = cleanupBtn();
    if (!btn) return;
    btn.disabled = isLoading;
    btn.style.opacity = isLoading ? '0.7' : '1';
    btn.style.cursor = isLoading ? 'wait' : 'pointer';
    btn.textContent = isLoading ? 'Siliniyor...' : 'Seçili haberleri sil';
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 120000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const fetchOptions = { cache: 'no-store', credentials: 'same-origin', ...options, signal: controller.signal };
      delete fetchOptions.timeoutMs;
      const res = await fetch(url, fetchOptions);
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(data?.error || text || `HTTP ${res.status}`);
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('İstek zaman aşımına uğradı.');
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function hardReload() {
    const url = new URL(window.location.href);
    url.searchParams.set('cleanup', String(Date.now()));
    window.location.replace(url.toString());
  }

  async function runCleanup() {
    const status = cleanupStatusEl();
    const period = document.getElementById('tb-cleanup-period')?.value || 'all';
    let token = localStorage.getItem('tb_radar_cron_token') || '';
    if (!token) {
      token = window.prompt('CRON_TOKEN değerini girin');
      if (!token) {
        if (status) status.textContent = 'Temizleme iptal edildi.';
        return;
      }
      localStorage.setItem('tb_radar_cron_token', token);
    }

    setLoading(true);
    if (status) status.textContent = 'İçerikler siliniyor...';

    try {
      const result = await fetchJson(`/api/sources?token=${encodeURIComponent(token)}&t=${Date.now()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ period }),
        timeoutMs: 120000
      });
      if (status) status.textContent = `Temizleme tamamlandı. Silinen haber: ${Number(result.deleted_raw_feed_items || 0)}, silinen aday: ${Number(result.deleted_topic_candidates || 0)}. Sayfa zorla yenileniyor...`;
      setTimeout(hardReload, 700);
    } catch (error) {
      if (status) status.textContent = `Temizleme hatası: ${String(error.message || error)}`;
      setLoading(false);
    }
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('#tb-cleanup');
    if (!btn) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runCleanup();
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadNavigationHelpers, { once: true });
  else loadNavigationHelpers();
})();