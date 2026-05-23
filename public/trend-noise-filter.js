(() => {
  const NOISE_PATTERNS = [
    /hull\s*city/i,
    /polonya/i,
    /voleybol/i,
    /futbol/i,
    /basketbol/i,
    /\bmac[iı]\b/i,
    /\bmaç[ıi]?\b/i,
    /\bspor\b/i,
    /premier\s*league/i,
    /championship/i,
    /galatasaray/i,
    /fenerbahçe/i,
    /besiktas|beşiktaş/i,
    /trabzonspor/i,
    /transfer/i,
    /deprem/i,
    /hava\s*durumu/i,
    /meteoroloji/i,
    /son\s*dakika/i,
    /emekli|maaş|altın|dolar|faiz|borsa/i
  ];

  const TECH_PATTERNS = [
    /google|android|iphone|ios|ipad|macbook|windows|samsung|galaxy|xiaomi|huawei|oppo|vivo|honor|pixel/i,
    /openai|chatgpt|gemini|claude|yapay\s*zeka|\bai\b/i,
    /telefon|tablet|laptop|gpu|cpu|nvidia|amd|intel|snapdragon|mediatek|çip|chip|işlemci/i,
    /watch|wear\s*os|akıllı\s*saat|app\s*store|play\s*store|whatsapp|instagram|youtube|chrome/i
  ];

  function isNoise(text = '') {
    const value = String(text || '').toLowerCase();
    if (!value.trim()) return false;
    const hasNoise = NOISE_PATTERNS.some((pattern) => pattern.test(value));
    if (!hasNoise) return false;
    const hasTech = TECH_PATTERNS.some((pattern) => pattern.test(value));
    return !hasTech;
  }

  function filterTrendCards() {
    const grid = document.getElementById('tb-trend-grid');
    if (!grid) return;

    const cards = grid.querySelectorAll('article');
    cards.forEach((card) => {
      const text = card.textContent || '';
      if (isNoise(text)) {
        card.dataset.tbNoiseHidden = '1';
        card.style.display = 'none';
      }
    });
  }

  function start() {
    filterTrendCards();
    const grid = document.getElementById('tb-trend-grid');
    if (!grid) return;

    const observer = new MutationObserver(() => filterTrendCards());
    observer.observe(grid, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  setInterval(filterTrendCards, 1500);
})();
