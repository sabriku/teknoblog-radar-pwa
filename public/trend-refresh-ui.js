(() => {
  const DEFAULT_MARKER = 'tb_trend_radar_default_closed_v3';

  function setButtonStatus(button, text, disabled = false) {
    button.textContent = text;
    button.disabled = disabled;
    button.style.opacity = disabled ? '0.72' : '1';
    button.style.cursor = disabled ? 'wait' : 'pointer';
  }

  async function refreshTrends(button) {
    const original = button.textContent;

    try {
      setButtonStatus(button, 'Yenileniyor...', true);

      const res = await fetch('/api/trends-refresh', {
        method: 'GET',
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || 'Trend yenileme başarısız oldu');
      }

      const inserted = Number(data?.ingest?.inserted || 0);
      const clusters = Number(data?.clusters?.clusters || 0);
      setButtonStatus(button, `Yenilendi, ${inserted} sinyal`, true);
      button.title = `Küme sayısı: ${clusters}`;

      setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      console.error(error);
      setButtonStatus(button, 'Yenileme başarısız', false);
      button.title = error?.message || 'Bilinmeyen hata';
      setTimeout(() => setButtonStatus(button, original, false), 2600);
    }
  }

  function forceDefaultClosed(wrap) {
    if (!wrap || localStorage.getItem(DEFAULT_MARKER) === '1') return;

    wrap.setAttribute('data-open', '0');
    localStorage.setItem('tb_trend_radar_open', '0');
    localStorage.setItem(DEFAULT_MARKER, '1');

    const toggle = wrap.querySelector('#tb-trend-toggle');
    if (toggle) {
      toggle.innerHTML = '<span class="tb-chevron">▾</span>Göster';
    }
  }

  function buildRefreshButton() {
    const button = document.createElement('button');
    button.id = 'tb-manual-refresh';
    button.type = 'button';
    button.textContent = 'Google Trends verilerini yenile';
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

  document.addEventListener('DOMContentLoaded', start);
  start();
})();
