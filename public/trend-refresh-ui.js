(() => {
  const FALLBACK_TOKEN = 'tb-radar-2026-X7p9K2mQ4vL8cR1nZ5sT';
  const TOKEN_KEYS = ['tb_radar_cron_token', 'tb_radar_token', 'TB_RADAR_TOKEN', 'cron_token'];

  function getToken() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key);
      if (value && value.trim()) return value.trim();
    }
    if (window.TB_RADAR_TOKEN && String(window.TB_RADAR_TOKEN).trim()) return String(window.TB_RADAR_TOKEN).trim();
    return FALLBACK_TOKEN;
  }

  function saveToken(token) {
    if (!token || !String(token).trim()) return;
    const clean = String(token).trim();
    for (const key of TOKEN_KEYS) localStorage.setItem(key, clean);
    window.TB_RADAR_TOKEN = clean;
  }

  function endpoint(path, token = getToken()) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set('token', token);
    url.searchParams.set('_', Date.now().toString());
    return url.toString();
  }

  function setButtonStatus(button, text, disabled = false) {
    button.textContent = text;
    button.disabled = disabled;
    button.style.opacity = disabled ? '0.72' : '1';
    button.style.cursor = disabled ? 'wait' : 'pointer';
  }

  async function fetchJson(path, token = getToken(), timeoutMs = 70000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint(path, token), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/json' }
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok || data?.ok === false || data?.error) {
        const err = new Error(data?.error || text || `HTTP ${res.status}`);
        err.status = res.status;
        err.path = path;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function ingestCount(data = {}) {
    return Number(data.inserted || data.ingest?.inserted || data.count || data.items_inserted || 0);
  }

  function clusterCount(data = {}) {
    return Number(data.clusters || data.cluster_count || data.items?.length || data.count || 0);
  }

  async function runSyncFlow(button, token) {
    setButtonStatus(button, 'Google Trends eşzamanlanıyor...', true);
    const sync = await fetchJson('/api/trends-sync', token, 90000);
    return {
      mode: 'sync',
      inserted: ingestCount(sync),
      clusters: clusterCount(sync?.clusters || sync),
      detail: sync
    };
  }

  async function runFallbackFlow(button, token) {
    setButtonStatus(button, 'Google Trends verisi alınıyor...', true);
    const ingest = await fetchJson('/api/trends-ingest', token, 90000);
    setButtonStatus(button, 'Trend kümeleri hazırlanıyor...', true);
    const clusters = await fetchJson('/api/trend-clusters', token, 90000);
    return {
      mode: 'ingest+clusters',
      inserted: ingestCount(ingest),
      clusters: clusterCount(clusters),
      detail: { ingest, clusters }
    };
  }

  async function runRefreshWithToken(button, token) {
    saveToken(token);
    let result;
    try {
      result = await runSyncFlow(button, token);
    } catch (syncError) {
      console.warn('Google Trends sync failed, trying fallback flow:', syncError);
      result = await runFallbackFlow(button, token);
    }

    const inserted = Number(result.inserted || 0);
    const clusters = Number(result.clusters || 0);
    setButtonStatus(button, `Yenilendi, ${inserted} sinyal`, true);
    button.title = `Akış: ${result.mode} | Sinyal: ${inserted} | Küme: ${clusters}`;

    setTimeout(() => window.location.reload(), 900);
  }

  async function refreshTrends(button) {
    const original = button.textContent;
    try {
      await runRefreshWithToken(button, getToken());
    } catch (error) {
      if (error?.status === 401 || /yetkisiz|unauthorized/i.test(String(error?.message || ''))) {
        const entered = window.prompt('CRON_TOKEN değerini girin', localStorage.getItem('tb_radar_cron_token') || FALLBACK_TOKEN);
        if (entered && entered.trim()) {
          saveToken(entered.trim());
          try {
            await runRefreshWithToken(button, entered.trim());
            return;
          } catch (retryError) {
            error = retryError;
          }
        }
      }

      console.error('Google Trends refresh error:', error);
      setButtonStatus(button, 'Yenileme başarısız', false);
      button.title = `${error?.path ? `${error.path}: ` : ''}${error?.message || 'Bilinmeyen hata'}`;
      setTimeout(() => setButtonStatus(button, original, false), 4200);
    }
  }

  function forceDefaultClosed(wrap) {
    if (!wrap) return;
    wrap.setAttribute('data-open', '0');
    localStorage.setItem('tb_trend_radar_open', '0');
    const toggle = wrap.querySelector('#tb-trend-toggle');
    if (toggle) {
      toggle.innerHTML = '<span class="tb-chevron">▾</span>Göster';
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  function buildRefreshButton() {
    const button = document.createElement('button');
    button.id = 'tb-manual-refresh';
    button.type = 'button';
    button.textContent = 'Google Trends verilerini eşzamanla';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.padding = '10px 14px';
    button.style.borderRadius = '999px';
    button.style.border = '1px solid #0f766e';
    button.style.background = '#ecfeff';
    button.style.color = '#0f766e';
    button.style.fontSize = '13px';
    button.style.fontWeight = '700';
    button.style.whiteSpace = 'nowrap';
    button.style.boxShadow = '0 6px 16px rgba(15,118,110,.08)';
    button.addEventListener('click', () => refreshTrends(button));
    return button;
  }

  function injectControls() {
    const wrap = document.getElementById('tb-trend-radar-wrap');
    if (!wrap) return false;
    forceDefaultClosed(wrap);
    if (document.getElementById('tb-manual-refresh')) return true;

    const header = wrap.querySelector('.tb-trend-header');
    const toggle = wrap.querySelector('#tb-trend-toggle');
    if (!header) return false;

    const actionArea = toggle?.parentElement || header;
    actionArea.style.display = 'flex';
    actionArea.style.alignItems = 'flex-start';
    actionArea.style.justifyContent = 'flex-end';
    actionArea.style.gap = '10px';
    actionArea.style.flexWrap = 'wrap';

    const button = buildRefreshButton();
    if (toggle && toggle.parentElement === actionArea) actionArea.insertBefore(button, toggle);
    else actionArea.appendChild(button);
    return true;
  }

  function start() {
    saveToken(getToken());
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (injectControls() || tries > 50) clearInterval(timer);
    }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
