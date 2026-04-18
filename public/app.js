(() => {
  const TB_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAAAXNSR0IArs4c6QAAAMBlWElmTU0AKgAAAAgABwESAAMAAAABAAEAAAEaAAUAAAABAAAAYgEbAAUAAAABAAAAagEoAAMAAAABAAIAAAExAAIAAAAPAAAAcgEyAAIAAAAUAAAAgodpAAQAAAABAAAAlgAAAAAAAAEgAAAAAQAAASAAAAABUGl4ZWxtYXRvciAzLjkAADIwMjA6MTE6MDIgMTU6MTE6OTMAAAOgAQADAAAAAQABAACgAgAEAAAAAQAAAgCgAwAEAAAAAQAAAgAAAAAAzyTkvgAAAAlwSFlzAAAsSwAALEsBpT2WqQAABCZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDUuNC4wIj4KICAgPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIgogICAgICAgICAgICB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iCiAgICAgICAgICAgIHhtbWxuczp4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGlmLzEuMC8iCiAgICAgICAgICAgIHhtbWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyI+CiAgICAgICAgIDxkYzpzdWJqZWN0PgogICAgICAgICAgICA8cmRmOkJhZy8+CiAgICAgICAgIDwvZGM6c3ViamVjdD4KICAgICAgICAgPHhtcDpNb2RpZnlEYXRlPjIwMjAtMTEtMDJUMTU6MTE6OTM8L3htcDpNb2RpZnlEYXRlPgogICAgICAgICA8eG1wOkNyZWF0b3JUb29sPlBpeGVsbWF0b3IgMy45PC94bXA6Q3JlYXRvclRvb2w+CiAgICAgICAgIDxleGlmOlBpeGVsWERpbWVuc2lvbj41MTI8L2V4aWY6UGl4ZWxYRGltZW5zaW9uPgogICAgICAgICA8ZXhpZjpQaXhlbFlEaW1lbnNpb24+NTEyPC9leGlmOlBpeGVsWURpbWVuc2lvbj4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT4xPC9leGlmOkNvbG9yU3BhY2U+CiAgICAgICAgIDx0aWZmOkNvbXByZXNzaW9uPjA8L3RpZmY6Q29tcHJlc3Npb24+CiAgICAgICAgIDx0aWZmOlhSZXNvbHV0aW9uPjI4ODwvdGlmZjpYUmVzb2x1dGlvbj4KICAgICAgICAgPHRpZmY6T3JpZW50YXRpb24+MTwvdGlmZjpPcmllbnRhdGlvbj4KICAgICAgICAgPHRpZmY6UmVzb2x1dGlvblVuaXQ+MjwvdGlmZjpPcmllbnRhdGlvblVuaXQ+CiAgICAgICAgIDx0aWZmOllSZXNvbHV0aW9uPjI4ODwvdGlmZjpZUmVzb2x1dGlvbj4KICAgICAgPC9yZGY6RGVzY3JpcHRpb24+CiAgIDwvcmRmOlJERj4KPC94OnhtcG1ldGEKTr4V/wAAQABJRU5ErkJggg==';

  const state = {
    items: [],
    sources: [],
    sort: 'published_at',
    selected: new Set(),
    refreshing: false,
    cleaning: false,
    page: 1,
    pageSize: 20,
    ingestDebug: [],
    viewMode: 'cards',
    sourceFilter: 'all'
  };

  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
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

  function formatToday() {
    return new Intl.DateTimeFormat('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Istanbul'
    }).format(new Date());
  }

  function formatPublishedAt(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul'
    }).format(date);
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
  const getSourceName = (item) => pick(item?.source_name, 'Kaynak yok');
  const getPublishedAt = (item) => pick(item?.published_at, item?.created_at, item?.updated_at);
  const score = (item, key) => Number.isFinite(Number(item?.[key])) ? Number(item[key]) : 0;

  function scoreTone(value, kind = 'general') {
    const palettes = {
      general: {
        high: { bg: '#ffedd5', fg: '#9a3412', border: '#fdba74' },
        mid: { bg: '#fff7ed', fg: '#c2410c', border: '#fdba74' },
        low: { bg: '#fff1eb', fg: '#b45309', border: '#fed7aa' }
      },
      discover: {
        high: { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
        mid: { bg: '#eff6ff', fg: '#2563eb', border: '#bfdbfe' },
        low: { bg: '#f8fbff', fg: '#3b82f6', border: '#dbeafe' }
      },
      traffic: {
        high: { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
        mid: { bg: '#f0fdf4', fg: '#15803d', border: '#bbf7d0' },
        low: { bg: '#f7fee7', fg: '#4d7c0f', border: '#d9f99d' }
      }
    };

    const palette = palettes[kind] || palettes.general;
    const level = value >= 75 ? 'high' : value >= 50 ? 'mid' : 'low';
    const label = value >= 75 ? 'Çok güçlü' : value >= 50 ? 'Güçlü' : value >= 35 ? 'Orta' : 'Düşük';
    return { ...palette[level], text: label };
  }

  function sourceFilterOptions() {
    const names = [...new Set(state.items.map(getSourceName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    return ['all', ...names];
  }

  function filteredItems() {
    if (state.sourceFilter === 'all') return [...state.items];
    return state.items.filter((item) => getSourceName(item) === state.sourceFilter);
  }

  function getSortedItems() {
    return filteredItems().sort((a, b) => {
      if (state.sort === 'published_at') {
        return new Date(getPublishedAt(b) || 0).getTime() - new Date(getPublishedAt(a) || 0).getTime();
      }
      return score(b, state.sort) - score(a, state.sort);
    });
  }

  function getPagedItems() {
    const items = getSortedItems();
    const start = (state.page - 1) * state.pageSize;
    return items.slice(start, start + state.pageSize);
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(filteredItems().length / state.pageSize));
  }

  function root() {
    let el = document.getElementById('tb-radar-root');
    if (el) return el;

    document.body.innerHTML = `
      <div id="tb-radar-root" style="max-width:1380px;margin:0 auto;padding:16px;font-family:'Open Sans',sans-serif;color:#111827;background:#f8fafc;min-height:100vh">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:14px;min-width:0">
            <div style="flex:0 0 auto;width:62px;height:62px;border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 22px rgba(9,30,66,.10);border:1px solid #f1f5f9;overflow:hidden">
              <img src="${TB_LOGO}" alt="Teknoblog logosu" style="width:46px;height:46px;object-fit:contain;display:block">
            </div>
            <div style="min-width:0">
              <div style="font:700 34px/1 'Fira Sans Condensed',sans-serif;color:#f04a0a;letter-spacing:.2px">Teknoblog İçerik Radar</div>
              <div style="margin-top:8px;font-size:14px;color:#475569">${esc(formatToday())}</div>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <label for="tb-sort" style="font-size:13px;font-weight:700">Sıralama</label>
            <select id="tb-sort" style="padding:10px 12px;border:1px solid #d1d5db;border-radius:12px;background:#fff">
              <option value="published_at">En yeni içerikler</option>
              <option value="total_score">Genel potansiyel</option>
              <option value="discover_score">Discover uygunluğu</option>
              <option value="traffic_score">Trafik potansiyeli</option>
              <option value="conversion_score">Dönüşüm potansiyeli</option>
              <option value="social_score">Sosyal ilgi</option>
              <option value="editorial_score">Editoryal öncelik</option>
            </select>
            <button id="tb-view-cards" type="button" style="padding:10px 12px;border:1px solid #f04a0a;border-radius:12px;background:#fff;color:#f04a0a;font-weight:700;cursor:pointer">Kart</button>
            <button id="tb-view-list" type="button" style="padding:10px 12px;border:1px solid #f04a0a;border-radius:12px;background:#fff;color:#f04a0a;font-weight:700;cursor:pointer">Liste</button>
            <button id="tb-refresh" type="button" style="padding:10px 14px;border:0;border-radius:12px;background:#f04a0a;color:#fff;font-weight:700;cursor:pointer">İçerikleri Yenile</button>
            <button id="tb-copy-selected" type="button" style="padding:10px 14px;border:1px solid #f04a0a;border-radius:12px;background:#fff;color:#f04a0a;font-weight:700;cursor:pointer">Seçilen URL'leri kopyala</button>
          </div>
        </div>

        <div id="tb-status" style="margin-bottom:12px;font-size:14px;color:#475569"></div>
        <div id="tb-source-tabs" style="display:flex;gap:8px;overflow:auto;padding-bottom:8px;margin-bottom:16px"></div>

        <div style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px" id="tb-layout">
          <main>
            <div id="tb-grid"></div>
            <div id="tb-pagination" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;flex-wrap:wrap"></div>
          </main>

          <aside style="display:flex;flex-direction:column;gap:16px">
            <section style="border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">Kaynak Listesi</div>
              <div id="tb-sources-list" style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow:auto"></div>
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
                <button type="submit" style="padding:11px 14px;border:0;border-radius:10px;background:#f04a0a;color:#fff;font-weight:700;cursor:pointer">Kaynağı Ekle</button>
              </form>
              <div id="tb-source-form-status" style="margin-top:10px;font-size:13px;color:#475569"></div>
            </section>

            <section style="border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">Haberleri Temizle</div>
              <div style="display:flex;flex-direction:column;gap:10px">
                <select id="tb-cleanup-period" style="padding:11px 12px;border:1px solid #d1d5db;border-radius:10px">
                  <option value="all">Tüm haberler</option>
                  <option value="1d">Son 1 gün</option>
                  <option value="1w">Son 1 hafta</option>
                  <option value="1m">Son 1 ay</option>
                </select>
                <button id="tb-cleanup" type="button" style="padding:11px 14px;border:0;border-radius:10px;background:#111827;color:#fff;font-weight:700;cursor:pointer">Seçili haberleri sil</button>
              </div>
              <div id="tb-cleanup-status" style="margin-top:10px;font-size:13px;color:#475569"></div>
            </section>

            <section style="border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">İçe Aktarma Tanısı</div>
              <div id="tb-debug" style="display:flex;flex-direction:column;gap:10px;max-height:320px;overflow:auto;font-size:12px;color:#475569"></div>
            </section>
          </aside>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      @media (max-width:980px){#tb-layout{grid-template-columns:1fr!important}}
      @media (max-width:720px){#tb-radar-root{padding:14px} #tb-radar-root img[alt="Teknoblog logosu"]{width:40px!important;height:40px!important} }
      #tb-grid.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}
      #tb-grid.list{display:flex;flex-direction:column;gap:12px}
    `;
    document.head.appendChild(style);

    return document.getElementById('tb-radar-root');
  }

  function setRefreshButtonState(isLoading) {
    const btn = document.getElementById('tb-refresh');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.style.opacity = isLoading ? '0.7' : '1';
    btn.style.cursor = isLoading ? 'wait' : 'pointer';
    btn.textContent = isLoading ? 'Yenileniyor...' : 'İçerikleri Yenile';
  }

  function setCleanupButtonState(isLoading) {
    const btn = document.getElementById('tb-cleanup');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.style.opacity = isLoading ? '0.7' : '1';
    btn.style.cursor = isLoading ? 'wait' : 'pointer';
    btn.textContent = isLoading ? 'Siliniyor...' : 'Seçili haberleri sil';
  }

  function setViewButtons() {
    const cards = document.getElementById('tb-view-cards');
    const list = document.getElementById('tb-view-list');
    if (!cards || !list) return;
    const active = 'background:#f04a0a;color:#fff;border-color:#f04a0a;';
    const passive = 'background:#fff;color:#f04a0a;border-color:#f04a0a;';
    cards.style.cssText += state.viewMode === 'cards' ? active : passive;
    list.style.cssText += state.viewMode === 'list' ? active : passive;
  }

  function scoreBadge(label, value, kind) {
    const tone = scoreTone(value, kind);
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};font-size:11px;font-weight:700">${esc(label)} ${esc(value)} · ${esc(tone.text)}</span>`;
  }

  function renderSourceTabs() {
    const wrap = document.getElementById('tb-source-tabs');
    if (!wrap) return;
    wrap.innerHTML = sourceFilterOptions().map((name) => {
      const active = state.sourceFilter === name;
      const label = name === 'all' ? 'Tümü' : name;
      return `<button type="button" data-source-tab="${esc(name)}" style="white-space:nowrap;padding:9px 12px;border-radius:999px;border:1px solid ${active ? '#f04a0a' : '#cbd5e1'};background:${active ? '#f04a0a' : '#fff'};color:${active ? '#fff' : '#334155'};font-weight:700;cursor:pointer">${esc(label)}</button>`;
    }).join('');
  }

  function renderDebug() {
    root();
    const wrap = document.getElementById('tb-debug');
    if (!wrap) return;
    if (!state.ingestDebug.length) {
      wrap.innerHTML = `<div>Henüz tanı kaydı yok.</div>`;
      return;
    }
    wrap.innerHTML = state.ingestDebug.map((row) => {
      const title = pick(row.source, 'Kaynak');
      const status = pick(row.status, 'bilgi');
      const extra = [row.reason, row.error, row.feedUrl, row.code ? `HTTP ${row.code}` : '', row.count ? `Öğe ${row.count}` : '', Number.isFinite(row.inserted) ? `Alınan ${row.inserted}` : '', Number.isFinite(row.updated) ? `Güncellenen ${row.updated}` : '']
        .filter(Boolean)
        .join(' • ');
      return `<div style="padding:10px;border:1px solid #e5e7eb;border-radius:12px"><div style="font-weight:700;color:#111827">${esc(title)}</div><div style="margin-top:4px"><strong>${esc(status)}</strong></div><div style="margin-top:4px">${esc(extra)}</div></div>`;
    }).join('');
  }

  function renderPagination() {
    const wrap = document.getElementById('tb-pagination');
    if (!wrap) return;
    const totalPages = getTotalPages();
    state.page = Math.min(state.page, totalPages);
    wrap.innerHTML = `
      <button type="button" data-page-action="prev" ${state.page <= 1 ? 'disabled' : ''} style="padding:9px 12px;border:1px solid #f04a0a;border-radius:10px;background:#fff;color:#f04a0a;font-weight:700;cursor:pointer;${state.page <= 1 ? 'opacity:.5;cursor:not-allowed;' : ''}">Önceki</button>
      <div style="font-size:14px;color:#475569;font-weight:700">Sayfa ${state.page} / ${totalPages}</div>
      <button type="button" data-page-action="next" ${state.page >= totalPages ? 'disabled' : ''} style="padding:9px 12px;border:1px solid #f04a0a;border-radius:10px;background:#fff;color:#f04a0a;font-weight:700;cursor:pointer;${state.page >= totalPages ? 'opacity:.5;cursor:not-allowed;' : ''}">Sonraki</button>
    `;
  }

  function renderCardItem(item) {
    const url = getUrl(item);
    const image = getImage(item);
    const title = getTitle(item);
    const summary = getSummary(item);
    const sourceName = getSourceName(item);
    const publishedAt = formatPublishedAt(getPublishedAt(item));
    const checked = state.selected.has(url) ? 'checked' : '';
    return `
      <article style="display:flex;flex-direction:column;overflow:hidden;border:1px solid #dbe3ef;border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(9,30,66,.06)">
        <div style="position:relative">
          ${image ? `<img src="${esc(image)}" alt="${esc(title)}" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#f3f6fa" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
          <div style="display:${image ? 'none' : 'flex'};width:100%;aspect-ratio:16/9;align-items:center;justify-content:center;background:#f3f6fa;color:#6b7280;font-weight:700">Görsel yok</div>
          <label style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,.95);border-radius:999px;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700">
            <input type="checkbox" data-select-url="${esc(url)}" ${checked}> Seç
          </label>
        </div>
        <div style="padding:14px 14px 16px;display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${scoreBadge('Genel', score(item, 'total_score'), 'general')}
            ${scoreBadge('Discover', score(item, 'discover_score'), 'discover')}
            ${scoreBadge('Trafik', score(item, 'traffic_score'), 'traffic')}
          </div>
          <h3 style="margin:0;font:700 22px/1.25 'Fira Sans Condensed',sans-serif;color:#111827">${esc(title)}</h3>
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:#64748b;font-weight:700">
            <div>${esc(publishedAt)}</div>
            <div>${esc(sourceName)}</div>
          </div>
          <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(summary)}</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <a href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:10px;background:#f04a0a;color:#fff;text-decoration:none;font-size:14px;font-weight:700;${url ? '' : 'pointer-events:none;opacity:.5;'}">Haberi Aç</a>
            <button type="button" data-copy-url="${esc(url)}" style="padding:10px 12px;border:1px solid #f04a0a;border-radius:10px;background:#fff;color:#f04a0a;font-size:14px;font-weight:700;cursor:pointer">URL kopyala</button>
          </div>
        </div>
      </article>`;
  }

  function renderListItem(item) {
    const url = getUrl(item);
    const image = getImage(item);
    const title = getTitle(item);
    const summary = getSummary(item);
    const sourceName = getSourceName(item);
    const publishedAt = formatPublishedAt(getPublishedAt(item));
    const checked = state.selected.has(url) ? 'checked' : '';
    return `
      <article style="display:grid;grid-template-columns:180px minmax(0,1fr);gap:14px;align-items:stretch;border:1px solid #dbe3ef;border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(9,30,66,.06);overflow:hidden">
        <div style="position:relative;background:#f3f6fa;min-height:140px">
          ${image ? `<img src="${esc(image)}" alt="${esc(title)}" style="display:block;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
          <div style="display:${image ? 'none' : 'flex'};width:100%;height:100%;align-items:center;justify-content:center;background:#f3f6fa;color:#6b7280;font-weight:700">Görsel yok</div>
          <label style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,.95);border-radius:999px;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700">
            <input type="checkbox" data-select-url="${esc(url)}" ${checked}> Seç
          </label>
        </div>
        <div style="padding:14px 14px 16px;display:flex;flex-direction:column;gap:10px;min-width:0">
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${scoreBadge('Genel', score(item, 'total_score'), 'general')}
            ${scoreBadge('Discover', score(item, 'discover_score'), 'discover')}
            ${scoreBadge('Trafik', score(item, 'traffic_score'), 'traffic')}
          </div>
          <h3 style="margin:0;font:700 24px/1.2 'Fira Sans Condensed',sans-serif;color:#111827">${esc(title)}</h3>
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:#64748b;font-weight:700">
            <div>${esc(publishedAt)}</div>
            <div>${esc(sourceName)}</div>
          </div>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#475569">${esc(summary)}</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <a href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 12px;border-radius:10px;background:#f04a0a;color:#fff;text-decoration:none;font-size:14px;font-weight:700;${url ? '' : 'pointer-events:none;opacity:.5;'}">Haberi Aç</a>
            <button type="button" data-copy-url="${esc(url)}" style="padding:10px 12px;border:1px solid #f04a0a;border-radius:10px;background:#fff;color:#f04a0a;font-size:14px;font-weight:700;cursor:pointer">URL kopyala</button>
          </div>
        </div>
      </article>`;
  }

  function renderItems() {
    root();
    const grid = document.getElementById('tb-grid');
    const status = document.getElementById('tb-status');
    const sort = document.getElementById('tb-sort');
    if (sort) sort.value = state.sort;
    setViewButtons();
    renderSourceTabs();

    const items = getPagedItems();
    const total = filteredItems().length;
    if (!state.refreshing) {
      status.textContent = `${total} içerik listeleniyor`;
    }

    grid.className = state.viewMode;

    if (!items.length) {
      grid.innerHTML = `<div style="padding:24px;border:1px solid #dbe3ef;border-radius:18px;background:#fff">Henüz içerik yok.</div>`;
      renderPagination();
      return;
    }

    grid.innerHTML = items.map((item) => state.viewMode === 'list' ? renderListItem(item) : renderCardItem(item)).join('');
    renderPagination();
  }

  function renderSources() {
    root();
    const wrap = document.getElementById('tb-sources-list');
    if (!wrap) return;
    if (!state.sources.length) {
      wrap.innerHTML = `<div style="font-size:14px;color:#64748b">Henüz kaynak görünmüyor.</div>`;
      return;
    }
    wrap.innerHTML = state.sources.map((s) => {
      const feed = pick(s.rss_url, s.feed_url);
      const site = pick(s.site_url, s.url);
      return `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px"><div style="font-weight:700;color:#111827">${esc(s.name || 'İsimsiz kaynak')}</div><div style="margin-top:6px;font-size:12px;color:#64748b;word-break:break-all">${esc(feed || site)}</div></div>`;
    }).join('');
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 60000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const fetchOptions = { cache: 'no-store', ...options, signal: controller.signal };
      delete fetchOptions.timeoutMs;
      const res = await fetch(url, fetchOptions);
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(data?.error || text || `HTTP ${res.status}`);
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('İstek zaman aşımına uğradı.');
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function loadRecommendations() {
    const data = await fetchJson(`/api/recommendations?sort=${encodeURIComponent(state.sort)}&t=${Date.now()}`, { timeoutMs: 20000 });
    state.items = Array.isArray(data?.items) ? data.items : [];
    state.page = 1;
    renderItems();
  }

  async function loadSources() {
    const data = await fetchJson(`/api/sources?t=${Date.now()}`, { timeoutMs: 20000 });
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

  async function runIngestBatches(token, statusEl) {
    let offset = 0;
    const sourceLimit = 4;
    let totalIngested = 0;
    let totalUpdated = 0;
    let batches = 0;
    const debugRows = [];
    while (batches < 6) {
      statusEl.textContent = `RSS içerikleri alınıyor, parti ${batches + 1}...`;
      const qs = `?token=${encodeURIComponent(token)}&source_limit=${sourceLimit}&source_offset=${offset}&item_limit=10&t=${Date.now()}`;
      const result = await fetchJson(`/api/ingest${qs}`, { timeoutMs: 40000 });
      totalIngested += result.ingested ?? 0;
      totalUpdated += result.updated ?? 0;
      debugRows.push(...(Array.isArray(result.debug) ? result.debug : []));
      state.ingestDebug = debugRows;
      renderDebug();
      batches += 1;
      if (!result.has_more || (result.processed_sources ?? 0) < sourceLimit) break;
      offset += sourceLimit;
    }
    return { totalIngested, totalUpdated, batches, debugRows };
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
    state.refreshing = true;
    state.ingestDebug = [];
    renderDebug();
    setRefreshButtonState(true);
    try {
      const ingest = await runIngestBatches(token, status);
      status.textContent = 'Puanlama ve aday listesi güncelleniyor...';
      const qs = `?token=${encodeURIComponent(token)}&t=${Date.now()}`;
      const scoreData = await fetchJson(`/api/score${qs}`, { timeoutMs: 90000 });
      state.page = 1;
      status.textContent = 'Kartlar yenileniyor...';
      await Promise.allSettled([loadRecommendations(), loadSources()]);
      status.textContent = `İçerikler güncellendi. Alınan: ${ingest.totalIngested}, güncellenen: ${ingest.totalUpdated}, işlenen: ${scoreData.processed ?? 0}`;
    } finally {
      state.refreshing = false;
      setRefreshButtonState(false);
    }
  }

  async function triggerCleanup() {
    const status = document.getElementById('tb-cleanup-status');
    const periodEl = document.getElementById('tb-cleanup-period');
    const period = periodEl ? periodEl.value : 'all';
    let token = localStorage.getItem('tb_radar_cron_token') || '';
    if (!token) {
      token = window.prompt('CRON_TOKEN değerini girin');
      if (!token) {
        status.textContent = 'Temizleme iptal edildi.';
        return;
      }
      localStorage.setItem('tb_radar_cron_token', token);
    }
    const confirmTextMap = {
      all: 'Tüm haberleri silmek üzeresiniz. Devam edilsin mi?',
      '1d': 'Son 1 günün haberleri silinecek. Devam edilsin mi?',
      '1w': 'Son 1 haftanın haberleri silinecek. Devam edilsin mi?',
      '1m': 'Son 1 ayın haberleri silinecek. Devam edilsin mi?'
    };
    if (!window.confirm(confirmTextMap[period] || 'Seçili haberler silinecek. Devam edilsin mi?')) {
      status.textContent = 'Temizleme iptal edildi.';
      return;
    }
    state.cleaning = true;
    setCleanupButtonState(true);
    status.textContent = 'Haberler siliniyor...';
    try {
      const result = await fetchJson(`/api/sources?token=${encodeURIComponent(token)}&t=${Date.now()}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period }), timeoutMs: 60000
      });
      state.items = [];
      state.page = 1;
      state.ingestDebug = [];
      renderDebug();
      await Promise.allSettled([loadRecommendations(), loadSources()]);
      status.textContent = `Temizleme tamamlandı. Adaylar: ${result.deleted_topic_candidates ?? 0}, ham kayıtlar: ${result.deleted_raw_feed_items ?? 0}`;
    } finally {
      state.cleaning = false;
      setCleanupButtonState(false);
    }
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), timeoutMs: 20000
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
      state.sort = sort.value || 'published_at';
      state.page = 1;
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
      try { await triggerRefresh(); } catch (err) {
        state.refreshing = false; setRefreshButtonState(false); document.getElementById('tb-status').textContent = `Hata: ${err.message}`;
      }
      return;
    }
    const cleanupBtn = e.target.closest('#tb-cleanup');
    if (cleanupBtn) {
      try { await triggerCleanup(); } catch (err) {
        state.cleaning = false; setCleanupButtonState(false); document.getElementById('tb-cleanup-status').textContent = `Hata: ${err.message}`;
      }
      return;
    }
    const cardsBtn = e.target.closest('#tb-view-cards');
    if (cardsBtn) {
      state.viewMode = 'cards'; renderItems(); return;
    }
    const listBtn = e.target.closest('#tb-view-list');
    if (listBtn) {
      state.viewMode = 'list'; renderItems(); return;
    }
    const sourceTab = e.target.closest('[data-source-tab]');
    if (sourceTab) {
      state.sourceFilter = sourceTab.getAttribute('data-source-tab') || 'all';
      state.page = 1;
      renderItems();
      return;
    }
    const pageBtn = e.target.closest('[data-page-action]');
    if (pageBtn) {
      const action = pageBtn.getAttribute('data-page-action');
      if (action === 'prev' && state.page > 1) state.page -= 1;
      if (action === 'next' && state.page < getTotalPages()) state.page += 1;
      renderItems();
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
    if (copyBtn) await copyText(copyBtn.getAttribute('data-copy-url') || '', copyBtn);
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
      await Promise.allSettled([loadRecommendations(), loadSources()]);
      renderDebug();
      setRefreshButtonState(false);
      setCleanupButtonState(false);
      setViewButtons();
      renderSourceTabs();
    } catch (err) {
      const status = document.getElementById('tb-status');
      if (status) status.textContent = `Hata: ${err.message}`;
    }
  });
})();
