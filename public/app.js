(() => {
  const state = {
    items: [],
    trendItems: [],
    sources: [],
    sort: 'published_at',
    selected: new Set(),
    refreshing: false,
    cleaning: false,
    trendLoading: false,
    page: 1,
    pageSize: 20,
    ingestDebug: [],
    viewMode: 'cards',
    sourceFilter: 'all',
    trendWindow: '24h'
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

  function formatDateTime(value) {
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

  function timeAgo(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const diffHours = Math.max(0, Math.round(diffMs / 3600000));
    if (diffHours < 1) return 'Az önce';
    if (diffHours < 24) return `${diffHours} saat önce`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} gün önce`;
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

  function ageHours(item) {
    const date = new Date(getPublishedAt(item) || 0);
    if (Number.isNaN(date.getTime())) return 999999;
    return Math.max(0, (Date.now() - date.getTime()) / 3600000);
  }

  function isDiscoverFresh(item) {
    return ageHours(item) <= 24;
  }

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
      },
      trend: {
        high: { bg: '#ede9fe', fg: '#6d28d9', border: '#c4b5fd' },
        mid: { bg: '#f5f3ff', fg: '#7c3aed', border: '#ddd6fe' },
        low: { bg: '#faf5ff', fg: '#9333ea', border: '#e9d5ff' }
      }
    };

    const palette = palettes[kind] || palettes.general;
    const level = value >= 75 ? 'high' : value >= 50 ? 'mid' : 'low';
    const label = value >= 75 ? 'Çok güçlü' : value >= 50 ? 'Güçlü' : value >= 35 ? 'Orta' : 'Düşük';
    return { ...palette[level], text: label };
  }

  function scoreBadge(label, value, kind) {
    const tone = scoreTone(value, kind);
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};font-size:11px;font-weight:700">${esc(label)} ${esc(value)} · ${esc(tone.text)}</span>`;
  }

  function visibleItems() {
    const base = state.sort === 'discover_score' ? state.items.filter(isDiscoverFresh) : state.items;
    return base;
  }

  function sourceFilterOptions() {
    const names = [...new Set(visibleItems().map(getSourceName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    return ['all', ...names];
  }

  function filteredItems() {
    const base = visibleItems();
    if (state.sourceFilter === 'all') return [...base];
    return base.filter((item) => getSourceName(item) === state.sourceFilter);
  }

  function getSortedItems() {
    return filteredItems().sort((a, b) => {
      if (state.sort === 'published_at') {
        return new Date(getPublishedAt(b) || 0).getTime() - new Date(getPublishedAt(a) || 0).getTime();
      }
      if (state.sort === 'discover_score') {
        const scoreDiff = score(b, 'discover_score') - score(a, 'discover_score');
        if (scoreDiff !== 0) return scoreDiff;
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
      <div id="tb-radar-root" style="max-width:1420px;margin:0 auto;padding:16px;font-family:'Open Sans',sans-serif;color:#111827;background:#f8fafc;min-height:100vh">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:16px">
          <div style="min-width:0">
            <div style="font:700 34px/1 'Fira Sans Condensed',sans-serif;color:#f04a0a;letter-spacing:.2px">Teknoblog İçerik Radar</div>
            <div style="margin-top:8px;font-size:14px;color:#475569">${esc(formatToday())}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <label for="tb-sort" style="font-size:13px;font-weight:700">Sıralama</label>
            <select id="tb-sort" style="padding:10px 12px;border:1px solid #d1d5db;border-radius:12px;background:#fff">
              <option value="published_at">En yeni içerikler</option>
              <option value="total_score">Genel potansiyel</option>
              <option value="discover_score">Discover uygunluğu, son 24 saat</option>
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

        <section style="margin-bottom:18px;border:1px solid #dbe3ef;border-radius:22px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:14px">
            <div>
              <div style="font:700 24px/1 'Fira Sans Condensed',sans-serif;color:#111827">Google Trends Teknoloji Radarı</div>
              <div style="margin-top:8px;font-size:14px;line-height:1.5;color:#475569">Teknolojiyle ilişkili trend kümeleri, ilgili haber bağlantıları ve ilgi yoğunluğu grafikleri burada listelenir.</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap" id="tb-trend-window-tabs"></div>
          </div>
          <div id="tb-trend-status" style="margin-bottom:12px;font-size:13px;color:#64748b"></div>
          <div id="tb-trend-grid"></div>
        </section>

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
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">Temizlik</div>
              <div style="display:flex;flex-direction:column;gap:10px">
                <select id="tb-cleanup-period" style="padding:10px 12px;border:1px solid #d1d5db;border-radius:12px;background:#fff">
                  <option value="1d">Son 1 gün</option>
                  <option value="1w">Son 1 hafta</option>
                  <option value="1m">Son 1 ay</option>
                  <option value="all">Tümü</option>
                </select>
                <button id="tb-cleanup" type="button" style="padding:10px 14px;border:1px solid #b91c1c;border-radius:12px;background:#fff;color:#b91c1c;font-weight:700;cursor:pointer">Seçili dönemi temizle</button>
                <div id="tb-cleanup-status" style="font-size:12px;color:#64748b;line-height:1.5"></div>
              </div>
            </section>
            <section style="border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">İşlem Günlüğü</div>
              <div id="tb-debug" style="display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto;font-size:12px;color:#475569"></div>
            </section>
          </aside>
        </div>
      </div>`;
    return document.getElementById('tb-radar-root');
  }

  function renderSourceTabs() {
    const wrap = document.getElementById('tb-source-tabs');
    if (!wrap) return;
    const options = sourceFilterOptions();
    if (!options.includes(state.sourceFilter)) state.sourceFilter = 'all';
    wrap.innerHTML = options.map((name) => {
      const active = name === state.sourceFilter;
      const label = name === 'all' ? 'Tüm kaynaklar' : name;
      return `<button type="button" data-source-filter="${esc(name)}" style="flex:0 0 auto;padding:8px 12px;border-radius:999px;border:1px solid ${active ? '#f04a0a' : '#d1d5db'};background:${active ? '#fff1eb' : '#fff'};color:${active ? '#f04a0a' : '#374151'};font-weight:700;cursor:pointer">${esc(label)}</button>`;
    }).join('');
  }

  function setViewButtons() {
    const card = document.getElementById('tb-view-cards');
    const list = document.getElementById('tb-view-list');
    if (card) card.style.background = state.viewMode === 'cards' ? '#fff1eb' : '#fff';
    if (list) list.style.background = state.viewMode === 'list' ? '#fff1eb' : '#fff';
  }

  function renderPagination() {
    const wrap = document.getElementById('tb-pagination');
    if (!wrap) return;
    const pages = getTotalPages();
    wrap.innerHTML = `
      <button type="button" data-page="prev" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer" ${state.page <= 1 ? 'disabled' : ''}>Önceki</button>
      <span style="font-size:13px;color:#64748b;font-weight:700">${state.page} / ${pages}</span>
      <button type="button" data-page="next" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer" ${state.page >= pages ? 'disabled' : ''}>Sonraki</button>
    `;
  }

  function renderDebug() {
    const wrap = document.getElementById('tb-debug');
    if (!wrap) return;
    if (!state.ingestDebug.length) {
      wrap.innerHTML = '<div>Henüz işlem kaydı yok.</div>';
      return;
    }
    wrap.innerHTML = state.ingestDebug.slice(0, 40).map((row) => `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:8px;background:#f8fafc">${esc(JSON.stringify(row))}</div>`).join('');
  }

  function renderTrendOverview() {
    const tabs = document.getElementById('tb-trend-window-tabs');
    const status = document.getElementById('tb-trend-status');
    const grid = document.getElementById('tb-trend-grid');
    if (!tabs || !status || !grid) return;
    tabs.innerHTML = ['4h', '24h'].map((windowKey) => {
      const active = windowKey === state.trendWindow;
      return `<button type="button" data-trend-window="${esc(windowKey)}" style="padding:8px 12px;border-radius:999px;border:1px solid ${active ? '#7c3aed' : '#d1d5db'};background:${active ? '#f5f3ff' : '#fff'};color:${active ? '#7c3aed' : '#374151'};font-weight:700;cursor:pointer">${esc(windowKey === '4h' ? 'Son 4 saat' : 'Son 24 saat')}</button>`;
    }).join('');
    status.textContent = state.trendLoading ? 'Trendler yükleniyor...' : `${state.trendItems.length} güncel trend kümesi listeleniyor`;
    grid.innerHTML = state.trendItems.length ? state.trendItems.map(renderTrendCard).join('') : '<div style="padding:16px;border:1px dashed #cbd5e1;border-radius:14px;color:#64748b">Güncel trend kümesi bulunamadı.</div>';
  }

  function sparklineSvg(points = []) {
    const values = points.map((p) => Number(p.count || 0));
    const max = Math.max(1, ...values);
    const width = 260;
    const height = 54;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const coords = values.map((value, i) => `${i * step},${height - (value / max) * 44 - 5}`).join(' ');
    return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:54px;display:block"><polyline fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/><line x1="0" y1="${height - 5}" x2="${width}" y2="${height - 5}" stroke="#e5e7eb" stroke-width="1"/></svg>`;
  }