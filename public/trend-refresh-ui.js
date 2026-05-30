(() => {
  const FALLBACK_TOKEN = 'tb-radar-2026-X7p9K2mQ4vL8cR1nZ5sT';

  function getToken() {
    return window.TB_RADAR_TOKEN || localStorage.getItem('tb_radar_cron_token') || FALLBACK_TOKEN;
  }

  function saveToken(token) {
    if (token) localStorage.setItem('tb_radar_cron_token', token);
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

  async function fetchJson(path, token = getToken()) {
    const res = await fetch(endpoint(path, token), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        accept: 'application/json'
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false || data?.error) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }

    return data;
  }

  async function runRefreshWithToken(button, token) {
    setButtonStatus(button, 'Google Trends eşzamanlanıyor...', true);
    const sync = await fetchJson('/api/trends-sync', token);

    const inserted = Number(sync?.ingest?.inserted || 0);
    const deleted = Number(sync?.cleanup?.deleted_signals || 0);
    const archived = Number(sync?.cleanup?.archived_clusters || 0);
    const clusterCount = Number(sync?.clusters?.clusters || 0);

    setButtonStatus(button, `Yenilendi, ${inserted} sinyal`, true);
    button.title = `Temizlenen: ${deleted} | Arşivlenen: ${archived} | Küme: ${clusterCount}`;

    setTimeout(() => {
      window.location.reload();
    }, 900);
  }

  async function refreshTrends(button) {
    const original = button.textContent;

    try {
      await runRefreshWithToken(button, getToken());
    } catch (error) {
      if (error?.status === 401) {
        const entered = window.prompt('CRON_TOKEN değerini girin', localStorage.getItem('tb_radar_cron_token') || '');
        if (entered) {
          saveToken(entered.trim());
          try {
            await runRefreshWithToken(button, entered.trim());
            return;
          } catch (retryError) {
            error = retryError;
          }
        }
      }

      console.error('Google Trends sync error:', error);
      setButtonStatus(button, 'Yenileme başarısız', false);
      button.title = error?.message || 'Bilinmeyen hata';
      setTimeout(() => setButtonStatus(button, original, false), 3200);
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
    if (toggle && toggle.parentElement === actionArea) {
      actionArea.insertBefore(button, toggle);
    } else {
      actionArea.appendChild(button);
    }

    return true;
  }

  function start() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (injectControls() || tries > 50) clearInterval(timer);
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();