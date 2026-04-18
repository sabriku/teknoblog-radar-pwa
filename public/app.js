(() => {
  const state = {
    items: [],
    sources: [],
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

  function val(...args) {
    for (const v of args) {
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  function getUrl(item) {
    return val(
      item?.url,
      item?.link,
      item?.canonical_url,
      item?.article_url,
      item?.target_url,
      item?.source_url,
      item?.site_url
    );
  }

  function getImage(item) {
    return val(
      item?.image_url,
      item?.image,
      item?.thumbnail,
      item?.thumb_url,
      item?.media_url
    );
  }

  function getSummary(item) {
    return val(item?.summary, item?.excerpt, item?.description);
  }

  function getTitle(item) {
    return val(item?.title, 'Başlıksız içerik');
  }

  function getScore(item, key) {
    const n = Number(item?.[key]);
    return Number.isFinite(n) ? n : 0;
  }

  function sortItems(items) {
    const key = state.sort || 'total_score';
    return [...items].sort((a, b) => getScore(b, key) - getScore(a, key));
  }

  function ensureRoot() {
    let root = document.getElementById('tb-radar-root');
    if (root) return root;

    document.body.innerHTML = `
      <div id="tb-radar-root" style="max-width:1320px;margin:0 auto;padding:16px;font-family:'Open Sans',sans-serif;color:#111827">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:16px">
          <div>
            <div style="font:700 32px/1 'Fira Sans Condensed',sans-serif;color:#0057b8">Teknoblog İçerik Radar</div>
            <div style="margin-top:8px;font-size:14px;color:#4b5563">Kaynakları tara, haber seç, URL kopyala</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <label for="tb-sort" style="font-size:13px;font-weight:600">Sıralama</label>
            <select id="tb-sort" style="padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;background:#fff">
              <option value="total_score">Toplam</option>
              <option value="discover_score">Discover</option>
              <option value="traffic_score">Trafik</option>
              <option value="conversion_score">Dönüşüm</option>
              <option value="social_score">Sosyal</option>
              <option value="editorial_score">Editoryal</option>
            </select>
            <button id="tb-refresh" type="button" style="padding:10px 14px;border:0;border-radius:10px;background:#0057b8;color:#fff;font-weight:700;cursor:pointer">Yenile</button>
            <button id="tb-copy-selected" type="button" style="padding:10px 14px;border:1px solid #0057b8;border-radius:10px;background:#fff;color:#0057b8;font-weight:700;cursor:pointer">Seçilen URL'leri kopyala</button>
          </div>
        </div>

        <div id="tb-status" style="margin-bottom:16px;font-size:14px;color:#4b5563"></div>

        <div style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px" id="tb-layout">
          <main>
            <div id="tb-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px"></div>
          </main>

          <aside style="display:flex;flex-direction:column;gap:16px">
            <section style="border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">Kaynak Listesi</div>
              <div id="tb-sources-list" style="display:flex;flex-direction:column;gap:10px;max-height:420px;overflow:auto"></div>
            </section>

            <section style="border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">Kaynak Ekle</div>
              <form id="tb-source-form" style="display:flex;flex-direction:column;gap:10px">
                <input name="name" placeholder="Kaynak adı" required style="padding:11px 12px;border:1px solid #d1d5db;border-radius:10px">
                <input name="rss_url" placeholder="RSS adresi" required style="padding:11px 12px;border:1px solid #d1d5db;border-radius:10px">
                <input name="site_url" placeholder="Site adresi" style="padding:11px 12px;border:1px solid #d1d5db;border-radius:10px">
                <select name="market_relevance" style="padding:11px 12px;border:1px solid #d1d5db;border-radius:10px">
                  <option value="global">Global</option>
                  <option value="turkey">Türkiye</option>
                  <option value="mixed">Karma</option>
                </select>
                <button type="submit" style="padding:11px 14px;border:0;border-radius:10px;background:#0057b8;color:#fff;font-weight:700;cursor:pointer">Kaynağı Ekle</button>
              </form>
              <div id="tb-source-form-status" style="margin-top:10px;font-size:13px;color:#4b5563"></div>
            </section>
          </aside>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 980px) {
        #tb-layout { grid-template-columns: 1fr !important; }
      }
      a.tb-btn:hover, button.tb-btn:hover { opacity: .92; }
    `;
    document.head.appendChild(style);

    return document.getElementById('tb-radar-root');
  }

  function badge(label, value) {
    return `<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#eef4fb;color:#003b7a;font-size:12px;font-weight:700">${esc(label)} ${esc(value)}</span>`;
  }

  function renderItems() {
    ensureRoot();
    const grid = document.getElementById('tb-grid');
    const status = document.getElementById('tb-status');
    const sort = document.getElementById('tb-sort');
    if (sort) sort.value = state.sort;

    const items = sortItems(state.items);
    status.textContent = `${items.length} içerik listeleniyor`;

    if (!items.length) {
      grid.innerHTML = `<div style="padding:24px;border:1px solid #dbe3ef;border-radius:18px;background:#fff">Henüz içerik yok.</div>`;
      return;
    }

    grid.innerHTML = items.map((item) => {
      const url = getUrl(item);
      const title = getTitle(item);
      const summary = getSummary(item);
      const image = getImage(item);
      const checked = state.selected.has(url) ? 'checked' : '';

      return `
        <article style="display:flex;flex-direction:column;overflow:hidden;border:1px solid #dbe3ef;border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(9,30,66,.06)">
          <div style="position:relative">
            ${
              image
                ? `<img src="${esc(image)}" alt="${esc(title)}" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#f3f6fa" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : ''
            }
            <div style="display:${image ? 'none' : 'flex'};width:100%;aspect-ratio:16/9;align-items:center;justify-content:center;background:#f3f6fa;color:#6b7280;font-weight:700">Görsel yok</div>
            <label style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,.95);border-radius:999px;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700">
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

            <h3 style="margin:0;font:700 22px/1.25 'Fira Sans Condensed',sans-serif;color:#111827">${esc(title)}</h3>

            <p style="margin:0;font-size:14px;line-height:1.55;color:#4b5563;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(summary)}</p>

            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:2px">
              <a class="tb-btn" href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer"
                 style="display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:10px;background:#0057b8;color:#fff;text-decoration:none;font-size:14px;font-weight:700;${url ? '' : 'pointer-events:none;opacity:.5;'}">Haberi Aç</a>

              <button class="tb-btn" type="button" data-copy-url="${esc(url)}"
                 style="padding:10px 12px;border:1px solid #0057b8;border-radius:10px;background:#fff;color:#0057b8;font-size:14px;font-weight:700;cursor:pointer">URL kopyala</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderSources() {
    ensureRoot();
    const wrap = document.getElementById('tb-sources-list');
    if (!wrap) return;

    if (!state.sources.length) {
      wrap.innerHTML = `<div style="font-size:14px;color:#6b7280">Henüz kaynak görünmüyor.</div>`;
      return;
    }

    wrap.innerHTML = state.sources.map((source) => {
      const feed = val(source.rss_url, source.feed_url);
      const site = val(source.site_url, source.url);
      return `
        <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px">
          <div style="font-weight:700;color:#111827">${esc(source.name || 'İsimsiz kaynak')}</div>
          <div style="margin-top:6px;font-size:12px;color:#6b7280;word-break:break-all">${esc(feed || site)}</div>
        </div>
      `;
    }).join('');
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok) throw new Error(data?.error || text || `HTTP ${res.status}`);
    return data;
  }

  async function loadRecommendations() {
    const data = await fetchJson(`/api/recommendations?sort=${encodeURIComponent(state.sort)}`);
    state.items = Array.isArray(data?.items) ? data.items : [];
    renderItems();
  }

  async function loadSources() {
    const data = await fetchJson('/api/sources');
    state.sources = Array.isArray(data?.items) ? data.items : [];
    renderSources();
  }

  async function copyText(value, button) {
    if (!value) {
      alert('Kopyalanacak URL bulunamadı.');
      return;
    }
    await navigator.clipboard.writeText(value);
    if (button) {
      const old = button.textContent;
      button.textContent = 'Kopyalandı';
      setTimeout(() => { button.textContent = old; }, 1200);
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

  async function submitSourceForm(form) {
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get('name') || '').trim(),
      rss_url: String(fd.get('rss_url') || '').trim(),
      site_url: String(fd.get('site_url') || '').trim(),
      market_relevance: String(fd.get('market_relevance') || 'global').trim()
    };

    const status = document.getElementById('tb-source-form-status');
    status.textContent = 'Kaydediliyor...';

    try {
      await fetchJson('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      form.reset();
      status.textContent = 'Kaynak eklendi.';
      await loadSources();
    } catch (err) {
      status.textContent = `Hata: ${err.message}`;
    }
  }

  document.addEventListener('change', (event) => {
    const sort = event.target.closest('#tb-sort');
    if (sort) {
      state.sort = sort.value || 'total_score';
      renderItems();
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
      try {
        document.getElementById('tb-status').textContent = 'Yenileniyor...';
        await Promise.all([loadRecommendations(), loadSources()]);
      } catch (err) {
        document.getElementById('tb-status').textContent = `Hata: ${err.message}`;
      }
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
      return;
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('#tb-source-form');
    if (!form) return;
    event.preventDefault();
    await submitSourceForm(form);
  });

  document.addEventListener('DOMContentLoaded', async () => {
    ensureRoot();
    try {
      await Promise.all([loadRecommendations(), loadSources()]);
    } catch (err) {
      const status = document.getElementById('tb-status');
      if (status) status.textContent = `Hata: ${err.message}`;
    }
  });
})();
