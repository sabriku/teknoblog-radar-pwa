(() => {
  const DEFAULT_TOKEN = 'tb-radar-2026-X7p9K2mQ4vL8cR1nZ5sT';
  const STORAGE_KEYS = [
    'tb_radar_cron_token',
    'tb_radar_token',
    'TB_RADAR_TOKEN',
    'cron_token'
  ];

  function getStoredToken() {
    for (const key of STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value && value.trim()) return value.trim();
    }
    if (window.TB_RADAR_TOKEN && String(window.TB_RADAR_TOKEN).trim()) return String(window.TB_RADAR_TOKEN).trim();
    return DEFAULT_TOKEN;
  }

  function saveToken(token) {
    if (!token || !String(token).trim()) return;
    const clean = String(token).trim();
    for (const key of STORAGE_KEYS) localStorage.setItem(key, clean);
    window.TB_RADAR_TOKEN = clean;
  }

  function status(text) {
    const el = document.getElementById('tb-status');
    if (el) el.textContent = text;
  }

  async function fetchJson(path, timeoutMs = 90000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(path, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/json' }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        const error = new Error(data?.error || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function runWithToken(token) {
    saveToken(token);
    const encoded = encodeURIComponent(token);
    await fetchJson(`/api/ingest?token=${encoded}&source_limit=40&item_limit=30&t=${Date.now()}`, 120000);
    await fetchJson(`/api/score?token=${encoded}&t=${Date.now()}`, 120000);
  }

  async function guardedRefresh(event) {
    const button = event.target?.closest?.('#tb-refresh');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Yenileniyor...';
    status('Daha fazla kaynak taranıyor, içerikler yenileniyor...');

    try {
      await runWithToken(getStoredToken());
      status('İçerikler güncellendi. Sayfa yenileniyor...');
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      if (error?.status === 401 || /yetkisiz|unauthorized/i.test(String(error?.message || ''))) {
        const entered = window.prompt('CRON_TOKEN değeri değişmiş görünüyor. Yeni tokenı girin', localStorage.getItem('tb_radar_cron_token') || DEFAULT_TOKEN);
        if (entered && entered.trim()) {
          try {
            await runWithToken(entered.trim());
            status('İçerikler güncellendi. Sayfa yenileniyor...');
            setTimeout(() => window.location.reload(), 600);
            return;
          } catch (retryError) {
            status(`Hata: ${retryError.message}`);
          }
        } else {
          status('Yenileme iptal edildi.');
        }
      } else {
        status(`Hata: ${error?.message || 'Bilinmeyen hata'}`);
      }
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  saveToken(getStoredToken());
  document.addEventListener('click', guardedRefresh, true);
})();
