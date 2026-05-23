(() => {
  function closeTrendPanel(wrap) {
    if (!wrap) return;
    wrap.setAttribute('data-open', '0');
    localStorage.setItem('tb_trend_radar_open', '0');
    const body = wrap.querySelector('.tb-trend-body');
    if (body) body.style.display = 'none';
  }

  function openTrendPanel(wrap) {
    if (!wrap) return;
    wrap.setAttribute('data-open', '1');
    localStorage.setItem('tb_trend_radar_open', '1');
    const body = wrap.querySelector('.tb-trend-body');
    if (body) body.style.display = '';
  }

  function ensureToggle(wrap) {
    if (!wrap || wrap.querySelector('#tb-trend-toggle')) return;
    const header = wrap.querySelector('.tb-trend-header') || wrap.firstElementChild || wrap;
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '10px';
    actions.style.marginLeft = 'auto';

    const button = document.createElement('button');
    button.id = 'tb-trend-toggle';
    button.type = 'button';
    button.innerHTML = '<span class="tb-chevron">▾</span><span>Göster</span>';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.gap = '8px';
    button.style.padding = '10px 12px';
    button.style.borderRadius = '999px';
    button.style.border = '1px solid #f04a0a';
    button.style.background = '#fff';
    button.style.color = '#f04a0a';
    button.style.fontSize = '13px';
    button.style.fontWeight = '700';
    button.style.cursor = 'pointer';

    button.addEventListener('click', () => {
      const isOpen = wrap.getAttribute('data-open') === '1';
      if (isOpen) {
        closeTrendPanel(wrap);
        button.innerHTML = '<span class="tb-chevron">▾</span><span>Göster</span>';
      } else {
        openTrendPanel(wrap);
        button.innerHTML = '<span class="tb-chevron">▾</span><span>Daralt</span>';
      }
    });

    actions.appendChild(button);
    header.appendChild(actions);
    closeTrendPanel(wrap);
  }

  function ensure168hTab() {
    const wrap = document.getElementById('tb-trend-window-tabs');
    if (!wrap || wrap.querySelector('[data-trend-window="168h"]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-trend-window', '168h');
    button.textContent = '7 gün';
    button.style.padding = '9px 12px';
    button.style.borderRadius = '999px';
    button.style.border = '1px solid #cbd5e1';
    button.style.background = '#fff';
    button.style.color = '#334155';
    button.style.fontWeight = '700';
    button.style.cursor = 'pointer';
    wrap.appendChild(button);
  }

  function run() {
    const wrap = document.getElementById('tb-trend-radar-wrap');
    if (wrap) ensureToggle(wrap);
    ensure168hTab();
  }

  function start() {
    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(run, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
