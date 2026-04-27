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
      let sourceOffset = 0;
      const sourceLimit = 4;
      let totalIngested = 0;
      let totalUpdated = 0;
      let ingestBatches = 0;

      while (ingestBatches < 6) {
        if (status) status.textContent = `RSS içerikleri alınıyor, parti ${ingestBatches + 1}...`;
        const ingestQs = `?token=${encodeURIComponent(token)}&source_limit=${sourceLimit}&source_offset=${sourceOffset}&item_limit=10&t=${Date.now()}`;
        const ingestResult = await fetchJson(`/api/ingest${ingestQs}`, { timeoutMs: 80000 });
        totalIngested += Number(ingestResult.ingested || 0);
        totalUpdated += Number(ingestResult.updated || 0);
        ingestBatches += 1;
        if (!ingestResult.has_more || Number(ingestResult.processed_sources || 0) < sourceLimit) break;
        sourceOffset += sourceLimit;
      }

      let scoreOffset = 0;
      const scoreLimit = 120;
      let totalProcessed = 0;
      let scoreBatches = 0;

      while (scoreBatches < 12) {
        if (status) status.textContent = `Puanlama yapılıyor, parti ${scoreBatches + 1}...`;
        const scoreQs = `?token=${encodeURIComponent(token)}&offset=${scoreOffset}&limit=${scoreLimit}&t=${Date.now()}`;
        const scoreResult = await fetchJson(`/api/score-batch${scoreQs}`, { timeoutMs: 80000 });
        totalProcessed += Number(scoreResult.processed || 0);
        scoreBatches += 1;
        if (!scoreResult.has_more || scoreResult.stopped_early) break;
        scoreOffset += scoreLimit;
      }

      if (status) status.textContent = `İçerikler güncellendi. Alınan: ${totalIngested}, güncellenen: ${totalUpdated}, işlenen: ${totalProcessed}. Sayfa yenileniyor...`;
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
