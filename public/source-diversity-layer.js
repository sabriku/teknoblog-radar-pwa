(() => {
  const MAX_PER_SOURCE_FIRST_PASS = 2;
  const MIN_CARDS_BEFORE_REPEAT = 10;

  function sourceName(card) {
    const text = String(card?.textContent || '');
    const meta = card?.querySelector?.('.meta')?.textContent || card?.querySelector?.('[style*="justify-content:space-between"]')?.textContent || text;
    const parts = String(meta).split('·').map((x) => x.trim()).filter(Boolean);
    return parts[parts.length - 1] || 'Kaynak yok';
  }

  function scoreOf(card) {
    const text = String(card?.textContent || '');
    const nums = [...text.matchAll(/(?:Genel|Karar|Discover|Disc|Trafik|IG)\s+(\d+)/gi)].map((m) => Number(m[1] || 0));
    return Math.max(0, ...nums);
  }

  function isNewsGridActive() {
    const tabs = document.getElementById('tb-main-tabs');
    const active = tabs?.querySelector('[aria-selected="true"]')?.getAttribute('data-main-tab');
    return !active || active === 'news';
  }

  function diversify(cards) {
    const sorted = [...cards].sort((a, b) => scoreOf(b) - scoreOf(a));
    const buckets = new Map();
    sorted.forEach((card) => {
      const source = sourceName(card);
      if (!buckets.has(source)) buckets.set(source, []);
      buckets.get(source).push(card);
    });

    const sources = [...buckets.keys()].sort((a, b) => scoreOf(buckets.get(b)[0]) - scoreOf(buckets.get(a)[0]));
    const result = [];
    const used = new Map();

    for (let round = 0; round < MAX_PER_SOURCE_FIRST_PASS; round += 1) {
      sources.forEach((source) => {
        const bucket = buckets.get(source) || [];
        const card = bucket.shift();
        if (!card) return;
        result.push(card);
        used.set(source, (used.get(source) || 0) + 1);
      });
    }

    const rest = sources.flatMap((source) => buckets.get(source) || []).sort((a, b) => scoreOf(b) - scoreOf(a));
    rest.forEach((card) => {
      const source = sourceName(card);
      const sourceAlreadyUsed = used.get(source) || 0;
      if (result.length < MIN_CARDS_BEFORE_REPEAT && sourceAlreadyUsed >= MAX_PER_SOURCE_FIRST_PASS) {
        result.push(card);
      } else {
        result.push(card);
      }
      used.set(source, sourceAlreadyUsed + 1);
    });
    return result;
  }

  function addSummary(cards) {
    const grid = document.getElementById('tb-grid');
    if (!grid?.parentElement) return;
    let box = document.getElementById('tb-source-diversity-summary');
    const sources = new Map();
    cards.forEach((card) => sources.set(sourceName(card), (sources.get(sourceName(card)) || 0) + 1));
    const top = [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const html = `Kaynak çeşitliliği: ${sources.size} kaynak görünür · En sık görünenler: ${top.map(([name, count]) => `${name} (${count})`).join(', ')}`;
    if (!box) {
      box = document.createElement('div');
      box.id = 'tb-source-diversity-summary';
      box.style.margin = '0 0 10px';
      box.style.padding = '9px 11px';
      box.style.border = '1px solid #dbe3ef';
      box.style.borderRadius = '12px';
      box.style.background = '#fff';
      box.style.color = '#64748b';
      box.style.fontSize = '12px';
      box.style.fontWeight = '800';
      grid.parentElement.insertBefore(box, grid);
    }
    box.textContent = html;
  }

  function applyDiversity() {
    if (!isNewsGridActive()) return;
    const grid = document.getElementById('tb-grid');
    if (!grid || grid.dataset.diversityBusy === '1') return;
    const cards = [...grid.querySelectorAll(':scope > article')].filter((card) => card.id !== 'tb-phase2-empty');
    if (cards.length < 4) return;
    grid.dataset.diversityBusy = '1';
    const diversified = diversify(cards);
    diversified.forEach((card) => grid.appendChild(card));
    addSummary(diversified);
    setTimeout(() => { grid.dataset.diversityBusy = '0'; }, 50);
  }

  function schedule() {
    setTimeout(applyDiversity, 0);
    setTimeout(applyDiversity, 350);
    setTimeout(applyDiversity, 1200);
  }

  const observer = new MutationObserver(schedule);

  function start() {
    const grid = document.getElementById('tb-grid');
    if (grid) observer.observe(grid, { childList: true, subtree: false });
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-main-tab], [data-page], [data-source-filter], #tb-view-cards, #tb-view-list, [data-phase2-filter]')) schedule();
    }, true);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();