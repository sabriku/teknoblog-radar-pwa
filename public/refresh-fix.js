(() => {
  function statusEl() { return document.getElementById('tb-status'); }
  function refreshBtn() { return document.getElementById('tb-refresh'); }

  function setLoading(isLoading) {
    const btn = refreshBtn();
    if (!btn) return;
    btn.disabled = isLoading;
    btn.style.opacity = isLoading ? '0.7' : '1';
    btn.style.cursor = isLoading ? 'wait' : 'pointer';
    btn.textContent = isLoading ? 'Yenileniyor...' : 'İçerikleri Yenile';
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 240000;
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

  async function runRefresh() {
    const status = statusEl();
    let token = localStorage.getItem('tb_radar_cron_token') || '';
    if (!token) {
      token = window.prompt('CRON_TOKEN değerini girin');
      if (!token) {
        if (status) status.textContent = 'Yenileme iptal edildi.';
        return;
      }
      localStorage.setItem('tb_radar_cron_token', token);
    }

    setLoading(true);
    try {
      let offset = 0;
      const sourceLimit = 4;
      let totalIngested = 0;
      let totalUpdated = 0;
      let batches = 0;

      while (batches < 6) {
        if (status) status.textContent = `RSS içerikleri alınıyor, parti ${batches + 1}...`;
        const qs = `?token=${encodeURIComponent(token)}&source_limit=${sourceLimit}&source_offset=${offset}&item_limit=10&t=${Date.now()}`;
        const result = await fetchJson(`/api/ingest${qs}`, { timeoutMs: 70000 });
        totalIngested += Number(result.ingested || 0);
        totalUpdated += Number(result.updated || 0);
        batches += 1;
        if (!result.has_more || Number(result.processed_sources || 0) < sourceLimit) break;
        offset += sourceLimit;
      }

      if (status) status.textContent = 'Puanlama ve aday listesi güncelleniyor...';
      const scoreQs = `?token=${encodeURIComponent(token)}&t=${Date.now()}`;
      const scoreData = await fetchJson(`/api/score${scoreQs}`, { timeoutMs: 240000 });
      if (status) status.textContent = `İçerikler güncellendi. Alınan: ${totalIngested}, güncellenen: ${totalUpdated}, işlenen: ${Number(scoreData.processed || 0)}. Sayfa yenileniyor...`;
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      if (status) status.textContent = `Hata: ${String(error.message || error)}`;
      setLoading(false);
    }
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('#tb-refresh');
    if (!btn) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runRefresh();
  }, true);
})();
