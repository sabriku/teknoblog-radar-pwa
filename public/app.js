(() => {
  const state = {
    items: [],
    sort: 'total_score',
    selected: new Set()
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getUrl(item) {
    return item?.url || item?.link || item?.canonical_url || item?.site_url || '';
  }

  function getTitle(item) {
    return item?.title || 'Başlıksız içerik';
  }

  function getSummary(item) {
    return item?.summary || item?.excerpt || '';
  }

  function getImage(item) {
    return item?.image_url || item?.image || '';
  }

  function getScore(item, key) {
    const n = Number(item?.[key]);
    return Number.isFinite(n) ? n : 0;
  }

  function bySort(items) {
    const key = state.sort || 'total_score';
    return [...items].sort((a, b) => getScore(b, key) - getScore(a, key));
  }

  function ensureShell() {
    let root = document.getElementById('tb-radar-root');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'tb-radar-root';
    root.style.maxWidth = '1200px';
    root.style.margin = '0 auto';
    root.style.padding = '16px';
    root.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <h1 style="margin:0;font-family:'Fira Sans Condensed',sans-serif;font-size:28px;line-height:1.1">Teknoblog İçerik Radar</h1>
          <div style="margin-top:6px;font-family:'Open Sans',sans-serif;font-size:14px;opacity:.8">Önerileri seç, URL kopyala, kaynağa git</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <label style="font:600 13px 'Open Sans',sans-serif">Sırala</label>
          <select id="tb-sort" style="padding:10px 12px;border:1px solid #cfd8e3;border-radius:10px;font:400 14px 'Open Sans',sans-serif">
            <option value="total_score">Toplam</option>
            <option value="discover_score">Discover</option>
            <option value="traffic_score">Trafik</option>
            <option value="conversion_score">Dönüşüm</option>
            <option value="social_score">Sosyal</option>
            <option value="editorial_score">Editoryal</option>
          </select>
          <button id="tb-refresh" type="button" style="padding:10px 14px;border:0;border-radius:10px;background:#0057b8;color:#fff;font:600 14px 'Open Sans',sans-serif;cursor:pointer">Yenile</button>
          <button id="tb-copy-selected" type="button" style="padding:10px 14px;border:1px solid #0057b8;border-radius:10px;background:#fff;color:#0057b8;font:600 14px 'Open Sans',sans-serif;cursor:pointer">Seçilen URL'leri kopyala</button>
        </div>
      </div>

      <div id="tb-status" style="margin-bottom:12px;font:400 14px 'Open Sans',sans-serif"></div>
      <div id="tb-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px"></div>
    `;

    const existingMain =
      document.querySelector('main') ||
      document.getElementById('app') ||
      document.body;

    if (existingMain === document.body) {
      document.body.innerHTML = '';
      document.body.appendChild(root);
    } else {
      existingMain.innerHTML = '';
      existingMain.appendChild(root);
    }

    return root;
  }

  function badge(label, value) {
    return `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#eef4fb;color:#003b7a;font:600 12px 'Open Sans',sans-serif">${esc(label)} ${esc(value)}</span>`;
  }

  function render() {
    ensureShell();

    const grid = document.getElementById('tb-grid');
    const status = document.getElementById('tb-status');
    const sort = document.getElementById('tb-sort');

    if (sort) sort.value = state.sort;

    const items = bySort(state.items);

    status.textContent = `${items.length} içerik listeleniyor`;

    if (!items.length) {
      grid.innerHTML = `
        <div style="padding:24px;border:1px solid #d8e1eb;border-radius:16px;background:#fff;font:400 14px 'Open Sans',sans-serif">
          Henüz içerik görünmüyor.
        </div>
      `;
      return;
    }

    grid.innerHTML = items.map((item, index) => {
      const url = getUrl(item);
      const title = getTitle(item);
      const summary = getSummary(item);
      const image = getImage(item);
      const checked = state.selected.has(url) ? 'checked' : '';

      return `
        <article style="display:flex;flex-direction:column;overflow:hidden;border:1px solid #d8e1eb;border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(9,30,66,.06)">
          <div style="position:relative">
            ${image ? `<img src="${esc(image)}" alt="${esc(title)}" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#f3f6fa">` : `<div style="width:100%;aspect-ratio:16/9;background:#f3f6fa"></div>`}
            <label style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,.95);border-radius:999px;padding:6px 10px;display:flex;align-items:center;gap:8px;font:600 12px 'Open Sans',sans-serif">
              <input type="checkbox" data-select-url="${esc(url)}" ${checked}>
              Seç
            </label>
          </div>
          <div style="padding:14px 14px 16px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${badge('Toplam', getScore(item, 'total_score'))}
              ${badge('Discover', getScore(item, 'discover_score'))}
              ${badge('Trafik', getScore(item, 'traffic_score'))}
            </div>

            <h3 style="margin:0;font:700 20px/1.25 'Fira Sans Condensed',sans-serif;color:#111827">
              ${esc(title)}
            </h3>

            <p style="margin:0;font:400 14px/1.5 'Open Sans',sans-serif;color:#4b5563;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
              ${esc(summary)}
            </p>

            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
              <a href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer"
                 style="display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:10px;background:#0057b8;color:#fff;text-decoration:none;font:600 14px 'Open Sans',sans-serif"
                 ${url ? '' : 'aria-disabled="true"'}>Haberi Aç</a>

              <button type="button" data-copy-url="${esc(url)}"
                 style="padding:10px 12px;border:1px solid #0057b8;border-radius:10px;background:#fff;color:#0057b8;font:600 14px 'Open Sans',sans-serif;cursor:pointer">
                 URL kopyala
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  async function fetchJson(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data?.error || text || `HTTP ${res.status}`);
      return data;
    } catch (e) {
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      throw e;
    }
  }

  async function loadRecommendations() {
    ensureShell();
    const status = document.getElementById('tb-status');
    status.textContent = 'Yükleniyor...';

    try {
      const data = await fetchJson(`/api/recommendations?sort=${encodeURIComponent(state.sort)}`);
      state.items = Array.isArray(data?.items) ? data.items : [];
      render();
    } catch (err) {
      status.textContent = `Hata: ${err.message}`;
      document.getElementById('tb-grid').innerHTML = '';
    }
  }

  async function copyText(value, button) {
    if (!value) {
      alert('Bu kayıt için URL bulunamadı.');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      if (button) {
        const old = button.textContent;
        button.textContent = 'Kopyalandı';
        setTimeout(() => { button.textContent = old; }, 1200);
      }
    } catch {
      alert('URL kopyalanamadı.');
    }
  }

  async function copySelected() {
    const urls = [...state.selected].filter(Boolean);
    if (!urls.length) {
      alert('Önce en az bir içerik seçin.');
      return;
    }
    await copyText(urls.join('\n'));
  }

  document.addEventListener('change', (event) => {
    const sort = event.target.closest('#tb-sort');
    if (sort) {
      state.sort = sort.value || 'total_score';
      render();
      return;
    }

    const checkbox = event.target.closest('[data-select-url]');
    if (checkbox) {
      const url = checkbox.getAttribute('data-select-url') || '';
      if (!url) return;
      if (checkbox.checked) state.selected.add(url);
      else state.selected.delete(url);
    }
  });

  document.addEventListener('click', async (event) => {
    const refreshBtn = event.target.closest('#tb-refresh');
    if (refreshBtn) {
      await loadRecommendations();
      return;
    }

    const copySelectedBtn = event.target.closest('#tb-copy-selected');
    if (copySelectedBtn) {
      await copySelected();
      return;
    }

    const copyBtn = event.target.closest('[data-copy-url]');
    if (copyBtn) {
      const url = copyBtn.getAttribute('data-copy-url') || '';
      await copyText(url, copyBtn);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureShell();
    render();
    loadRecommendations();
  });
})();
