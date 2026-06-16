(() => {
  const MODE_KEY = 'tb_source_diversity_mode';
  const modes = {
    score: { label: 'Skor öncelikli', firstPass: 99 },
    balanced: { label: 'Dengeli', firstPass: 2 },
    diverse: { label: 'Kaynak çeşitliliği güçlü', firstPass: 1 }
  };

  function mode() {
    return modes[localStorage.getItem(MODE_KEY)] ? localStorage.getItem(MODE_KEY) : 'balanced';
  }

  function sourceName(card) {
    const text = String(card?.textContent || '');
    const meta = card?.querySelector?.('.meta')?.textContent || card?.querySelector?.('[style*="justify-content:space-between"]')?.textContent || text;
    const parts = String(meta).split('·').map((x) => x.trim()).filter(Boolean);
    return parts[parts.length - 1] || 'Kaynak yok';
  }

  function scoreOf(card) {
    const text = String(card?.textContent || '');
    const nums = [...text.matchAll(/(?:Genel|Karar|Discover|Disc|Trafik|IG|skor)\s*(\d+)/gi)].map((m) => Number(m[1] || 0));
    return Math.max(0, ...nums);
  }

  function isNewsGridActive() {
    const tabs = document.getElementById('tb-main-tabs');
    const active = tabs?.querySelector('[aria-selected="true"]')?.getAttribute('data-main-tab');
    return !active || active === 'news';
  }

  function diversify(cards) {
    const selected = mode();
    const sorted = [...cards].sort((a, b) => scoreOf(b) - scoreOf(a));
    if (selected === 'score') return sorted;

    const firstPass = modes[selected].firstPass;
    const buckets = new Map();
    sorted.forEach((card) => {
      const source = sourceName(card);
      if (!buckets.has(source)) buckets.set(source, []);
      buckets.get(source).push(card);
    });

    const sources = [...buckets.keys()].sort((a, b) => scoreOf(buckets.get(b)[0]) - scoreOf(buckets.get(a)[0]));
    const result = [];

    for (let round = 0; round < firstPass; round += 1) {
      sources.forEach((source) => {
        const card = buckets.get(source)?.shift();
        if (card) result.push(card);
      });
    }

    const rest = sources.flatMap((source) => buckets.get(source) || []).sort((a, b) => scoreOf(b) - scoreOf(a));
    return result.concat(rest);
  }

  function ensureControls() {
    const grid = document.getElementById('tb-grid');
    if (!grid?.parentElement) return;
    let box = document.getElementById('tb-source-diversity-controls');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tb-source-diversity-controls';
      box.style.margin = '0 0 10px';
      box.style.padding = '10px 11px';
      box.style.border = '1px solid #dbe3ef';
      box.style.borderRadius = '14px';
      box.style.background = '#fff';
      box.style.display = 'flex';
      box.style.gap = '7px';
      box.style.flexWrap = 'wrap';
      box.style.alignItems = 'center';
      grid.parentElement.insertBefore(box, grid);
      box.addEventListener('click', (event) => {
        const button = event.target.closest('[data-diversity-mode]');
        if (!button) return;
        localStorage.setItem(MODE_KEY, button.dataset.diversityMode);
        applyDiversity();
      });
    }
    box.innerHTML = `<span style="font-size:12px;font-weight:900;color:#475569;margin-right:2px">Kaynak sıralaması:</span>${Object.entries(modes).map(([key, data]) => `<button type="button" data-diversity-mode="${key}" style="border:1px solid ${mode() === key ? '#f04a0a' : '#d1d5db'};background:${mode() === key ? '#fff7ed' : '#fff'};color:${mode() === key ? '#f04a0a' : '#374151'};border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900;cursor:pointer">${data.label}</button>`).join('')}`;
  }

  function addSummary(cards) {
    const grid = document.getElementById('tb-grid');
    if (!grid?.parentElement) return;
    ensureControls();
    let box = document.getElementById('tb-source-diversity-summary');
    const sources = new Map();
    cards.forEach((card) => sources.set(sourceName(card), (sources.get(sourceName(card)) || 0) + 1));
    const top = [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const html = `${modes[mode()].label} · ${sources.size} kaynak görünür · En sık görünenler: ${top.map(([name, count]) => `${name} (${count})`).join(', ')}`;
    if (!box) {
      box = document.createElement('div');
      box.id = 'tb-source-diversity-summary';
      box.style.margin = '-2px 0 10px';
      box.style.padding = '8px 11px';
      box.style.border = '1px solid #eef2f7';
      box.style.borderRadius = '12px';
      box.style.background = '#f8fafc';
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
    if (cards.length < 2) { ensureControls(); return; }
    grid.dataset.diversityBusy = '1';
    const diversified = diversify(cards);
    diversified.forEach((card) => grid.appendChild(card));
    addSummary(diversified);
    setTimeout(() => { grid.dataset.diversityBusy = '0'; }, 120);
  }

  function schedule() {
    setTimeout(applyDiversity, 0);
    setTimeout(applyDiversity, 450);
    setTimeout(applyDiversity, 1300);
  }

  function start() {
    const grid = document.getElementById('tb-grid');
    if (grid) {
      const observer = new MutationObserver(() => {
        if (grid.dataset.diversityBusy === '1') return;
        schedule();
      });
      observer.observe(grid, { childList: true, subtree: false });
    }
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-main-tab], [data-page], [data-source-filter], #tb-view-cards, #tb-view-list, [data-phase2-filter]')) schedule();
    }, true);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();