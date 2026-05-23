(() => {
  function findMain() {
    return document.querySelector('#tb-layout main') || document.querySelector('#tb-grid') || document.querySelector('main');
  }

  function moveTrendRadarToBottom() {
    const main = findMain();
    const wrap = document.getElementById('tb-trend-radar-wrap');
    if (!main || !wrap) return false;

    if (wrap.parentElement !== main) {
      main.appendChild(wrap);
      return true;
    }

    if (main.lastElementChild !== wrap) {
      main.appendChild(wrap);
    }

    wrap.style.marginTop = '22px';
    wrap.style.marginBottom = '18px';
    wrap.dataset.tbPosition = 'bottom';
    return true;
  }

  function start() {
    moveTrendRadarToBottom();
    const observer = new MutationObserver(() => moveTrendRadarToBottom());
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(moveTrendRadarToBottom, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
