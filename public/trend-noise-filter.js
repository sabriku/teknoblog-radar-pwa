(() => {
  const NOISE_PATTERNS = [
    /hull\s*city/i,
    /polonya/i,
    /voleybol/i,
    /futbol/i,
    /basketbol/i,
    /\bkupa\b/i,
    /hangi\s*kanalda/i,
    /canli\s*izle|canlı\s*izle/i,
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

  function readScore(card, label) {
    const text = card.textContent || '';
    const match = text.match(new RegExp(`${label}\\s+(\\d+)`, 'i'));
    return match ? Math.max(0, Math.min(100, Number(match[1]) || 0)) : 0;
  }

  function bar(label, value) {
    return `
      <div style="margin-top:7px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:3px"><span>${label}</span><b>${value}</b></div>
        <div style="height:7px;border-radius:999px;background:#e2e8f0;overflow:hidden"><span style="display:block;height:100%;width:${value}%;background:#f04a0a;border-radius:999px"></span></div>
      </div>
    `;
  }

  function addDecisionChart(card) {
    if (card.dataset.tbDecisionChart === '1') return;
    const text = card.textContent || '';
    if (!/Trend\s+\d+|Discover\s+\d+|SEO\s+\d+/i.test(text)) return;

    const trend = readScore(card, 'Trend');
    const discover = readScore(card, 'Discover');
    const seo = readScore(card, 'SEO');
    const decision = Math.round((trend * 0.42) + (discover * 0.38) + (seo * 0.20));
    const verdict = decision >= 72 ? 'Yazıya dönüştür' : decision >= 55 ? 'Takibe al' : 'Şimdilik bekle';

    const chart = document.createElement('div');
    chart.className = 'tb-decision-chart';
    chart.innerHTML = `
      <div style="margin-top:12px;padding:10px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px">
          <strong style="font-size:12px;color:#111827">Yayın kararı göstergesi</strong>
          <span style="font-size:12px;font-weight:700;color:#f04a0a">${verdict}</span>
        </div>
        ${bar('Trend ivmesi', trend)}
        ${bar('Discover potansiyeli', discover)}
        ${bar('SEO zemini', seo)}
        ${bar('Karar puanı', decision)}
      </div>
    `;
    card.appendChild(chart);
    card.dataset.tbDecisionChart = '1';
  }

  function filterTrendCards() {
    const roots = [document.getElementById('tb-trend-grid'), document.getElementById('tb-trend-radar-wrap')].filter(Boolean);
    roots.forEach((root) => {
      const cards = root.querySelectorAll('article');
      cards.forEach((card) => {
        const text = card.textContent || '';
        if (isNoise(text)) {
          card.dataset.tbNoiseHidden = '1';
          card.style.display = 'none';
          return;
        }
        addDecisionChart(card);
      });
    });
  }

  function start() {
    filterTrendCards();
    const roots = [document.getElementById('tb-trend-grid'), document.getElementById('tb-trend-radar-wrap')].filter(Boolean);
    roots.forEach((root) => {
      const observer = new MutationObserver(() => filterTrendCards());
      observer.observe(root, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  setInterval(filterTrendCards, 1500);
})();
