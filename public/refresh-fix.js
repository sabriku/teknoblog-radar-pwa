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
    const timeoutMs = options.timeoutMs || 300000;
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
      if (status) status.textContent = 'İçerik toplama ve puanlama arka uçta çalıştırılıyor...';
      const qs = `?token=${encodeURIComponent(token)}&t=${Date.now()}`;
      const result = await fetchJson(`/api/run-pipeline${qs}`, { timeoutMs: 300000 });
      if (status) status.textContent = `İçerikler güncellendi. Alınan: ${Number(result.ingested || 0)}, güncellenen: ${Number(result.updated || 0)}, işlenen: ${Number(result.processed || 0)}. Sayfa yenileniyor...`;
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
