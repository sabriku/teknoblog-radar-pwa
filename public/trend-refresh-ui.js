(() => {
  async function refreshTrends(button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Yenileniyor...';

    try {
      const res = await fetch('/api/trends-refresh', {
        method: 'GET',
        cache: 'no-store'
      });

      if (!res.ok) {
        throw new Error('Trend yenileme başarısız oldu');
      }

      button.textContent = 'Yenilendi';

      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = original;
    }
  }

  function injectControls() {
    const wrap = document.getElementById('tb-trend-radar-wrap');
    if (!wrap) return;

    wrap.setAttribute('data-open', '0');
    localStorage.setItem('tb_trend_radar_open', '0');

    if (document.getElementById('tb-manual-refresh')) return;

    const header = wrap.querySelector('.tb-trend-header');
    if (!header) return;

    const button = document.createElement('button');
    button.id = 'tb-manual-refresh';
    button.type = 'button';
    button.textContent = 'Google Trends verilerini yenile';
    button.style.padding = '10px 14px';
    button.style.borderRadius = '999px';
    button.style.border = '1px solid #0f766e';
    button.style.background = '#ecfeff';
    button.style.color = '#0f766e';
    button.style.fontSize = '13px';
    button.style.fontWeight = '700';
    button.style.cursor = 'pointer';
    button.style.marginTop = '10px';

    button.addEventListener('click', () => refreshTrends(button));

    const left = header.querySelector('div');
    if (left) {
      left.appendChild(button);
    }
  }

  const timer = setInterval(() => {
    const wrap = document.getElementById('tb-trend-radar-wrap');
    if (wrap) {
      clearInterval(timer);
      injectControls();
    }
  }, 400);
})();
