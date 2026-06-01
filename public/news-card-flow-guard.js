(() => {
  let scheduled = false;

  function text(card) {
    return String(card?.textContent || '').toLowerCase();
  }

  function hasTechContext(value) {
    return /google|android|iphone|ios|samsung|galaxy|openai|chatgpt|gemini|yapay\s*zeka|telefon|tablet|laptop|nvidia|amd|intel|windows|apple|xiaomi|huawei|pixel|watch|chrome|youtube/.test(value);
  }

  function currentSortIsDiscover() {
    const selected = document.querySelector('[data-sort].active, [data-sort][aria-selected="true"], select[name="sort"] option:checked');
    const selectedText = String(selected?.textContent || selected?.value || '').toLowerCase();
    const bodyText = String(document.body?.textContent || '').toLowerCase();
    const url = new URL(window.location.href);
    return url.searchParams.get('sort') === 'discover_score' || selectedText.includes('discover') || bodyText.includes('discover uygunluğu');
  }

  function shouldHideByNoise(card) {
    const value = text(card);
    if (/google\s*trends|trend\s*feed|tr\s*4s|tr\s*24s|tr\s*48s|tr\s*168s/.test(value)) return true;
    if (/(hangi\s*kanalda|\bmac[iı]\b|\bmaç[ıi]?\b|voleybol|basketbol|futbol|\bkupa\b)/.test(value) && !hasTechContext(value)) return true;
    return false;
  }

  function parseTime(card) {
    const value = text(card);
    const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
    if (!match) return 0;
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5])).getTime() || 0;
  }

  function ageHours(card) {
    const t = parseTime(card);
    if (!t) return 999999;
    return Math.max(0, (Date.now() - t) / 3600000);
  }

  function shouldHide(card) {
    if (shouldHideByNoise(card)) return true;
    if (currentSortIsDiscover() && ageHours(card) > 24) return true;
    return false;
  }

  function cardScore(card, index) {
    const t = parseTime(card);
    if (!t) return -999999 - index;
    const hours = ageHours(card);
    let score = t / 100000000;
    if (hours > 24) score -= 350;
    if (hours > 48) score -= 650;
    if (hours > 72) score -= 1000;
    if (hours > 168) score -= 2000;
    return score - index / 1000;
  }

  function run() {
    const grid = document.getElementById('tb-grid');
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(':scope > article'));
    if (!cards.length) return;

    const ordered = cards.map((card, index) => {
      const hide = shouldHide(card);
      card.style.display = hide ? 'none' : '';
      card.dataset.tbMainFlowGuard = hide ? 'hidden' : 'visible';
      return { card, hide, score: cardScore(card, index), index };
    }).sort((a, b) => {
      if (a.hide !== b.hide) return a.hide ? 1 : -1;
      return b.score - a.score || a.index - b.index;
    });

    const sig = ordered.map((item) => `${item.index}:${item.hide ? 1 : 0}:${Math.round(item.score)}`).join('|');
    if (grid.dataset.tbMainFlowSig === sig) return;
    grid.dataset.tbMainFlowSig = sig;

    const fragment = document.createDocumentFragment();
    ordered.forEach((item) => fragment.appendChild(item.card));
    grid.appendChild(fragment);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      run();
    });
  }

  function start() {
    run();
    const grid = document.getElementById('tb-grid');
    if (!grid) {
      setTimeout(start, 500);
      return;
    }
    new MutationObserver(schedule).observe(grid, { childList: true, subtree: true });
    document.addEventListener('click', () => setTimeout(run, 250));
    document.addEventListener('change', () => setTimeout(run, 250));
    setTimeout(run, 1200);
    setInterval(run, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
