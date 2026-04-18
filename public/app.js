(() => {
  const state = { items: [], sources: [], sort: 'total_score', selected: new Set() };

  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const pick = (...vals) => {
    for (const v of vals) {
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };

  function decodeEntities(input) {
    const str = String(input ?? '');
    const el = document.createElement('textarea');
    el.innerHTML = str;
    return el.value;
  }

  const getUrl = (item) => pick(
    item?.url,
    item?.canonical_url,
    item?.link,
    item?.article_url,
    item?.target_url,
    item?.source_url,
    item?.site_url
  );

  const getImage = (item) => pick(
    item?.image_url,
    item?.image,
    item?.thumbnail,
    item?.thumb_url,
    item?.media_url
  );

  const getTitle = (item) => decodeEntities(pick(item?.title, 'Başlıksız içerik'));
  const getSummary = (item) => decodeEntities(pick(item?.summary, item?.excerpt, item?.description));
  const score = (item, key) => Number.isFinite(Number(item?.[key])) ? Number(item[key]) : 0;

  function root() {
    let el = document.getElementById('tb-radar-root');
    if (el) return el;

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
            <button id="tb-refresh" type="button" style="padding:10px 14px;border:0;border-radius:10px;background:#0057b8;color:#fff;font-weight:700;cursor:pointer">İçerikleri Yenile</button>
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
    style.textContent = `@media (max-width:980px){#tb-layout{grid-template-columns:1fr!important}}`;
    document.head.appendChild(style);

    return document.getElementById('tb-radar-root');
  }

  function badge(label, value) {
    return `<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#eef4fb;color:#003b7a;font-size:12px;font-weight:700">${esc(label)} ${esc(value)}</span>`;
  }

  function renderItems() {
    root();
    const grid = document.getElementById('tb-grid');
    const status = document.getElementById('tb-status');
    const sort = document.getElementById('tb-sort');
    if (sort) sort.value = state.sort;

    const items = [...state.items].sort((a, b) => score(b, state.sort) - score(a, state.sort));
    status.textContent = `${items.length} içerik listeleniyor`;

    if (!items.length) {
      grid.innerHTML = `<div style="padding:24px;border:1px solid #dbe3ef;border-radius:18px;background:#fff">Henüz içerik yok.</div>`;
      return;
    }

    grid.innerHTML = items.map((item) => {
      const url = getUrl(item);
      const image = getImage(item);
      const title = getTitle(item);
      const summary = getSummary(item);
      const checked = state.selected.has(url) ? 'checked' : '';

      return `
        <article style="display:flex;flex-direction:column;overflow:hidden;border:1px solid #dbe3ef;border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(9,30,66,.06)">
          <div style="position:relative">
            ${image ? `<img src="${esc(image)}" alt="${esc(title)}" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#f3f6fa" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
            <div style="display:${image ? 'none' : 'flex'};width:100%;aspect-ratio:16/9;align-items:center;justify-content:center;background:#f3f6fa;color:#6b7280;font-weight:700">Görsel yok</div>
            <label style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,.95);border-radius:999px;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700">
              <input type="checkbox" data-select-url="${esc(url)}" ${checked}>
              Seç
            </label>
          </div>

          <div style="padding:14px 14px 16px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${badge('Toplam', score(item, 'total_score'))}
              ${badge('Discover', score(item, 'discover_score'))}
              ${badge('Trafik', score(item, 'traffic_score'))}
            </div>

            <h3 style="margin:0;font:700 22px/1.25 'Fira Sans Condensed',sans-serif;color:#111827">${esc(title)}</h3>

            <p style="margin:0;font-size:14px;line-height:1.55;color:#4b5563;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(summary)}</p>

            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:2px">
              <a href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:10px;background:#0057b8;color:#fff;text-decoration:none;font-size:14px;font-weight:700;${url ? '' : 'pointer-events:none;opacity:.5;'}">Haberi Aç</a>
              <button type="button" data-copy-url="${esc(url)}" style="padding:10px 12px;border:1px solid #0057b8;border-radius:10px;background:#fff;color:#0057b8;font-size:14px;font-weight:700;cursor:pointer">URL kopyala</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderSources() {
    root();
    const wrap = document.getElementById('tb-sources-list');
    if (!wrap) return;

    if (!state.sources.length) {
      wrap.innerHTML = `<div style="font-size:14px;color:#6b7280">Henüz kaynak görünmüyor.</div>`;
      return;
    }

    wrap.innerHTML = state.sources.map((s) => {
      const feed = pick(s.rss_url, s.feed_url);
      const site = pick(s.site_url, s.url);
      return `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px"><div style="font-weight:700;color:#111827">${esc(s.name || 'İsimsiz kaynak')}</div><div style="margin-top:6px;font-size:12px;color:#6b7280;word-break:break-all">${esc(feed || site)}</div></div>`;
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

  async function triggerRefresh() {
    const status = document.getElementById('tb-status');
    let token = localStorage.getItem('tb_radar_cron_token') || '';

    if (!token) {
      token = window.prompt('CRON_TOKEN değerini girin');
      if (!token) {
        status.textContent = 'Yenileme iptal edildi.';
        return;
      }
      localStorage.setItem('tb_radar_cron_token', token);
    }

    status.textContent = 'İçerikler yenileniyor...';

    const data = await fetchJson(`/api/run-pipeline?token=${encodeURIComponent(token)}`);
    await Promise.all([loadRecommendations(), loadSources()]);

    status.textContent = `İçerikler güncellendi. Alınan: ${data.ingested ?? 0}, işlenen: ${data.processed ?? 0}`;
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

  document.addEventListener('change', (e) => {
    const sort = e.target.closest('#tb-sort');
    if (sort) {
      state.sort = sort.value || 'total_score';
      renderItems();
      return;
    }
    const cb = e.target.closest('[data-select-url]');
    if (cb) {
      const url = cb.getAttribute('data-select-url') || '';
      if (!url) return;
      if (cb.checked) state.selected.add(url);
      else state.selected.delete(url);
    }
  });

  document.addEventListener('click', async (e) => {
    const refreshBtn = e.target.closest('#tb-refresh');
    if (refreshBtn) {
      try {
        await triggerRefresh();
      } catch (err) {
        document.getElementById('tb-status').textContent = `Hata: ${err.message}`;
      }
      return;
    }

    const copySelected = e.target.closest('#tb-copy-selected');
    if (copySelected) {
      const urls = [...state.selected].filter(Boolean);
      if (!urls.length) {
        alert('Önce en az bir içerik seçin.');
        return;
      }
      await copyText(urls.join('\n'));
      return;
    }

    const copyBtn = e.target.closest('[data-copy-url]');
    if (copyBtn) {
      await copyText(copyBtn.getAttribute('data-copy-url') || '', copyBtn);
    }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('#tb-source-form');
    if (!form) return;
    e.preventDefault();
    await submitSourceForm(form);
  });

  document.addEventListener('DOMContentLoaded', async () => {
    root();
    try {
      await Promise.all([loadRecommendations(), loadSources()]);
    } catch (err) {
      const status = document.getElementById('tb-status');
      if (status) status.textContent = `Hata: ${err.message}`;
    }
  });
})();
