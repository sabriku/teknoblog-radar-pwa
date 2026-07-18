(() => {
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
    return '';
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

  async function softRefreshOnly() {
    await Promise.allSettled([
      fetchJson(`/api/recommendations?sort=discover_score&t=${Date.now()}`, 30000),
      fetchJson(`/api/sources?t=${Date.now()}`, 20000),
      fetchJson(`/api/trend-overview?google_news=1&limit=20&t=${Date.now()}`, 30000)
    ]);
  }

  async function runWithToken(token) {
    if (token) saveToken(token);
    const cleanToken = String(token || '').trim();
    if (!cleanToken) {
      await softRefreshOnly();
      return { mode: 'soft' };
    }
    const encoded = encodeURIComponent(cleanToken);
    try {
      let sourceOffset = 0;
      const sourceLimit = 4;
      for (let batch = 0; batch < 12; batch += 1) {
        status(`RSS kaynakları yenileniyor (${batch + 1})...`);
        const result = await fetchJson(`/api/ingest?token=${encoded}&source_limit=${sourceLimit}&source_offset=${sourceOffset}&item_limit=20&t=${Date.now()}`, 90000);
        if (!result?.has_more) break;
        sourceOffset += sourceLimit;
      }

      let scoreOffset = 0;
      const scoreLimit = 120;
      for (let batch = 0; batch < 20; batch += 1) {
        status(`Haberler puanlanıyor (${batch + 1})...`);
        const result = await fetchJson(`/api/score-batch?token=${encoded}&offset=${scoreOffset}&limit=${scoreLimit}&t=${Date.now()}`, 90000);
        if (!result?.has_more || result?.stopped_early) break;
        scoreOffset += scoreLimit;
      }
    } catch (error) {
      if (error?.status === 404) {
        await softRefreshOnly();
        return { mode: 'soft' };
      }
      throw error;
    }
    return { mode: 'full' };
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
    status('Akış yenileniyor...');

    try {
      const result = await runWithToken(getStoredToken());
      status(result?.mode === 'soft' ? 'Akış güncellendi. Sayfa yenileniyor...' : 'İçerikler güncellendi. Sayfa yenileniyor...');
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      if (error?.status === 401 || /yetkisiz|unauthorized/i.test(String(error?.message || ''))) {
        const entered = window.prompt('CRON_TOKEN değeri değişmiş görünüyor. Yeni tokenı girin', localStorage.getItem('tb_radar_cron_token') || '');
        if (entered && entered.trim()) {
          try {
            const result = await runWithToken(entered.trim());
            status(result?.mode === 'soft' ? 'Akış güncellendi. Sayfa yenileniyor...' : 'İçerikler güncellendi. Sayfa yenileniyor...');
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
