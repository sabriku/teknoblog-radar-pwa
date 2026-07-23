(() => {
  const VIEW_KEY = 'tb_news_card_view';
  const SORT_KEY = 'tb_news_sort';
  const VALID_SORTS = new Set(['discover_score', 'traffic_score', 'published_at', 'total_score', 'conversion_score', 'social_score', 'editorial_score']);
  const VALID_VIEWS = new Set(['cards-2', 'cards-3', 'cards-4', 'stack', 'compact', 'list']);
  const VIEW_LABELS = {
    'cards-2': ['▦', '2 sütun'],
    'cards-3': ['▦', '3 sütun'],
    'cards-4': ['▦', '4 sütun'],
    stack: ['▤', 'Alt alta'],
    compact: ['▥', 'Kompakt'],
    list: ['☰', 'Liste']
  };
  const savedView = localStorage.getItem(VIEW_KEY);
  const savedSort = localStorage.getItem(SORT_KEY);

  const state = {
    items: [],
    sources: [],
    sort: VALID_SORTS.has(savedSort) ? savedSort : 'discover_score',
    source: 'all',
    view: VALID_VIEWS.has(savedView) ? savedView : 'cards-3',
    page: 1,
    pageSize: 20,
    selected: new Set(),
    loading: false,
    lastError: '',
    requestSequence: 0
  };

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const pick = (...values) => {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
  };

  function decode(value) {
    const el = document.createElement('textarea');
    el.innerHTML = String(value ?? '');
    return el.value;
  }

  function publishedAt(item) { return pick(item?.published_at, item?.created_at, item?.updated_at); }
  function timestamp(item) { const time = new Date(publishedAt(item) || 0).getTime(); return Number.isFinite(time) ? time : 0; }
  function ageHours(item) { const time = timestamp(item); if (!time) return 999999; return Math.max(0, (Date.now() - time) / 3600000); }
  function isLast24h(item) { return ageHours(item) <= 24; }
  function score(item, key) { const value = Number(item?.[key]); return Number.isFinite(value) ? value : 0; }
  function title(item) { return decode(pick(item?.title, 'Başlıksız içerik')); }
  function summary(item) { return decode(pick(item?.summary, item?.excerpt, item?.description)); }
  function url(item) { return pick(item?.url, item?.canonical_url, item?.link, item?.article_url, item?.target_url, item?.source_url, item?.site_url); }
  function image(item) { return pick(item?.image_url, item?.image, item?.thumbnail, item?.thumb_url, item?.media_url); }
  function sourceName(item) { return pick(item?.source_name, 'Kaynak yok'); }

  function formatDate(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(date);
  }

  function todayLabel() {
    return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date());
  }

  function freshnessAdjustedScore(item, key) {
    const hours = ageHours(item);
    let penalty = 0;
    if (hours > 24) penalty -= 250;
    if (hours > 48) penalty -= 450;
    if (hours > 72) penalty -= 800;
    if (hours > 168) penalty -= 1500;
    return score(item, key) + penalty;
  }

  function visibleItems() {
    let list = [...state.items];
    if (state.sort === 'discover_score') list = list.filter(isLast24h);
    if (state.source !== 'all') list = list.filter((item) => sourceName(item) === state.source);
    return list;
  }

  function sortedItems() {
    return visibleItems().sort((a, b) => {
      if (state.sort === 'published_at') return timestamp(b) - timestamp(a);
      if (state.sort === 'discover_score') {
        const diff = score(b, 'discover_score') - score(a, 'discover_score');
        return diff || timestamp(b) - timestamp(a);
      }
      const diff = freshnessAdjustedScore(b, state.sort) - freshnessAdjustedScore(a, state.sort);
      return diff || timestamp(b) - timestamp(a);
    });
  }

  function pagedItems() {
    const start = (state.page - 1) * state.pageSize;
    return sortedItems().slice(start, start + state.pageSize);
  }

  function totalPages() { return Math.max(1, Math.ceil(visibleItems().length / state.pageSize)); }

  function scoreBadge(label, value, color, icon = '') {
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;border:1px solid ${color};color:${color};background:#fff;font-size:11px;font-weight:800">${icon ? `<span aria-hidden="true">${esc(icon)}</span>` : ''}<span>${esc(label)} ${esc(value)}</span></span>`;
  }

  function root() {
    let app = document.getElementById('tb-radar-root');
    if (app) return app;
    document.body.innerHTML = `
      <div id="tb-radar-root" style="max-width:1420px;margin:0 auto;padding:16px;font-family:'Open Sans',sans-serif;color:#111827;background:#f8fafc;min-height:100vh">
        <header style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:16px">
          <div>
            <div style="font:700 34px/1 'Fira Sans Condensed',sans-serif;color:#f04a0a">Teknoblog İçerik Radar</div>
            <div style="margin-top:8px;font-size:14px;color:#475569">${esc(todayLabel())}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end">
            <label for="tb-sort" style="font-size:13px;font-weight:800">Sıralama</label>
            <select id="tb-sort" style="padding:10px 12px;border:1px solid #d1d5db;border-radius:12px;background:#fff">
              <option value="published_at">En yeni içerikler</option>
              <option value="total_score">Genel potansiyel</option>
              <option value="discover_score">Discover uygunluğu, son 24 saat</option>
              <option value="traffic_score">Trafik potansiyeli</option>
              <option value="conversion_score">Dönüşüm potansiyeli</option>
              <option value="social_score">Sosyal ilgi</option>
              <option value="editorial_score">Editoryal öncelik</option>
            </select>
            <button id="tb-refresh" type="button" class="tb-primary-btn">↻ İçerikleri Yenile</button>
            <button id="tb-copy-selected" type="button" class="tb-small-btn">⧉ Seçilen URL'leri kopyala</button>
          </div>
        </header>
        <div id="tb-status" style="margin-bottom:12px;font-size:14px;color:#475569"></div>
        <div id="tb-source-tabs" style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"></div>
        <div id="tb-layout" style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px">
          <main>
            <div id="tb-news-viewbar"></div>
            <div id="tb-grid"></div>
            <div id="tb-pagination" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;flex-wrap:wrap"></div>
          </main>
          <aside style="display:flex;flex-direction:column;gap:16px">
            <section style="border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">🗂 Kaynak Listesi</div>
              <div id="tb-sources-list" style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow:auto"></div>
            </section>
            <section style="border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">🧾 İşlem Günlüğü</div>
              <div id="tb-debug" style="font-size:12px;color:#475569">Henüz işlem kaydı yok.</div>
            </section>
          </aside>
        </div>
      </div>
      <style>
        .tb-small-btn{padding:10px 12px;border:1px solid #f04a0a;border-radius:12px;background:#fff;color:#f04a0a;font-weight:800;cursor:pointer}
        .tb-primary-btn{padding:10px 14px;border:0;border-radius:12px;background:#f04a0a;color:#fff;font-weight:800;cursor:pointer}
        .tb-view-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #e5e7eb;background:#fff;color:#374151;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:900;cursor:pointer;box-shadow:0 3px 10px rgba(15,23,42,.04)}
        .tb-view-btn[aria-pressed='true']{border-color:#f04a0a;background:#fff1eb;color:#f04a0a;box-shadow:0 6px 16px rgba(240,74,10,.12)}
        .tb-view-icon{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:999px;background:#f8fafc;border:1px solid #e5e7eb;font-size:12px;line-height:1}
        .tb-view-btn[aria-pressed='true'] .tb-view-icon{background:#f04a0a;color:#fff;border-color:#f04a0a}
        @media(max-width:960px){#tb-layout{grid-template-columns:1fr!important}.tb-view-text{display:none}}
      </style>`;
    return document.getElementById('tb-radar-root');
  }

  function renderSourceTabs() {
    const wrap = document.getElementById('tb-source-tabs');
    if (!wrap) return;
    const names = ['all', ...new Set(state.items.map(sourceName).filter(Boolean))].sort((a, b) => a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b, 'tr'));
    if (!names.includes(state.source)) state.source = 'all';
    wrap.innerHTML = `<label for="tb-source-select" style="font-size:13px;font-weight:800;color:#111827;white-space:nowrap">Kaynak</label><select id="tb-source-select" style="min-width:260px;max-width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:12px;background:#fff;font-weight:800;color:#374151">${names.map((name) => `<option value="${esc(name)}"${state.source === name ? ' selected' : ''}>${esc(name === 'all' ? 'Tüm kaynaklar' : name)}</option>`).join('')}</select>`;
  }

  function renderViewBar() {
    const wrap = document.getElementById('tb-news-viewbar');
    if (!wrap) return;
    const buttons = Object.entries(VIEW_LABELS).map(([key, [icon, label]]) => `<button type="button" class="tb-view-btn" data-view="${esc(key)}" aria-pressed="${state.view === key ? 'true' : 'false'}" title="${esc(label)}"><span class="tb-view-icon" aria-hidden="true">${esc(icon)}</span><span class="tb-view-text">${esc(label)}</span></button>`).join('');
    wrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:10px;border:1px solid #e5e7eb;border-radius:18px;background:linear-gradient(135deg,#fff,#fff7ed)"><div style="display:flex;align-items:center;gap:8px;color:#111827;font-size:13px;font-weight:900"><span style="display:inline-grid;place-items:center;width:28px;height:28px;border-radius:10px;background:#f04a0a;color:#fff">▦</span><span>Haber görünümü</span></div><div style="display:flex;gap:6px;flex-wrap:wrap">${buttons}</div></div>`;
  }

  function gridColumnsForView() {
    if (state.view === 'list' || state.view === 'stack') return '1fr';
    if (state.view === 'cards-2') return 'repeat(2,minmax(0,1fr))';
    if (state.view === 'cards-4') return 'repeat(4,minmax(0,1fr))';
    if (state.view === 'compact') return 'repeat(auto-fill,minmax(220px,1fr))';
    return 'repeat(3,minmax(0,1fr))';
  }

  function viewSettings() {
    if (state.view === 'list') return { image: false, compact: true, clamp: 2, article: 'display:grid;grid-template-columns:minmax(0,1fr);' };
    if (state.view === 'compact') return { image: false, compact: true, clamp: 2, article: 'display:grid;grid-template-rows:1fr;' };
    if (state.view === 'stack') return { image: true, compact: false, clamp: 5, article: 'display:grid;grid-template-columns:minmax(260px,420px) minmax(0,1fr);' };
    if (state.view === 'cards-4') return { image: true, compact: true, clamp: 2, article: 'display:grid;grid-template-rows:auto 1fr;' };
    if (state.view === 'cards-2') return { image: true, compact: false, clamp: 4, article: 'display:grid;grid-template-rows:auto 1fr;' };
    return { image: true, compact: false, clamp: 3, article: 'display:grid;grid-template-rows:auto 1fr;' };
  }

  function renderCard(item) {
    const itemUrl = url(item);
    const itemImage = image(item);
    const checked = state.selected.has(itemUrl) ? 'checked' : '';
    const date = formatDate(publishedAt(item));
    const age = ageHours(item);
    const stale = age > 24;
    const settings = viewSettings();
    const titleSize = settings.compact ? '18px' : '22px';
    const padding = settings.compact ? '12px' : '14px';
    const topBorder = stale ? '#f59e0b' : '#f04a0a';
    const imageBlock = settings.image ? `<div style="position:relative;background:#f3f6fa;aspect-ratio:16/9">
        ${itemImage ? `<img src="${esc(itemImage)}" alt="${esc(title(item))}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#64748b;font-weight:800;background:linear-gradient(135deg,#fff7ed,#eff6ff)">📰 Görsel yok</div>`}
        <label style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,.95);border-radius:999px;padding:6px 10px;display:flex;gap:6px;font-size:12px;font-weight:800"><input type="checkbox" data-select-url="${esc(itemUrl)}" ${checked}> Seç</label>
      </div>` : '';
    const selectInline = settings.image ? '' : `<label style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;display:inline-flex;gap:6px;font-size:12px;font-weight:800;width:max-content"><input type="checkbox" data-select-url="${esc(itemUrl)}" ${checked}> Seç</label>`;
    return `<article style="${settings.article}border:1px solid ${stale ? '#fed7aa' : '#dbe3ef'};border-top:4px solid ${topBorder};border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(9,30,66,.06);overflow:hidden">
      ${imageBlock}
      <div style="padding:${padding};display:flex;flex-direction:column;gap:10px">
        ${selectInline}
        <div style="display:flex;gap:6px;flex-wrap:wrap">${scoreBadge('Genel', score(item, 'total_score'), '#c2410c', '★')}${scoreBadge('Discover', score(item, 'discover_score'), '#2563eb', 'G')}${scoreBadge('Trafik', score(item, 'traffic_score'), '#15803d', '↗')}${scoreBadge('Güven', score(item, 'score_confidence'), '#6d28d9', '✓')}</div>
        ${item.discover_probability != null ? `<div style="display:flex;gap:6px;flex-wrap:wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:11px;padding:8px;font-size:11px;font-weight:900;color:#334155"><span>✨ Discover olasılığı %${Number(item.discover_probability)}</span><span>📰 News %${Number(item.news_probability||0)}</span>${item.editorial_probability != null ? `<span>✍️ Editoryal tercih %${Number(item.editorial_probability)}</span>` : ''}<span>🎯 Model güveni %${Number(item.intelligence_confidence||0)}</span><span>Beklenen tıklama ${Number(item.expected_clicks_low||0)}–${Number(item.expected_clicks_high||0)}</span></div>` : ''}
        <h3 style="margin:0;font:700 ${titleSize}/1.25 'Fira Sans Condensed',sans-serif;color:#111827">${esc(title(item))}</h3>
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:#64748b;font-weight:800"><span>🕒 ${esc(date)}</span><span>🏷 ${esc(sourceName(item))}</span></div>
        ${stale ? `<div style="font-size:12px;color:#b45309;font-weight:800">⚠ 24 saatten eski, Discover için kullanılmamalı</div>` : ''}
        <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;display:-webkit-box;-webkit-line-clamp:${settings.clamp};-webkit-box-orient:vertical;overflow:hidden">${esc(summary(item))}</p>
        ${Array.isArray(item.score_reasons) && item.score_reasons.length ? `<details style="font-size:12px;color:#475569"><summary style="cursor:pointer;font-weight:800">Puan neden böyle?</summary><ul style="padding-left:18px">${item.score_reasons.map((reason) => `<li>${reason.impact > 0 ? '+' : ''}${Number(reason.impact || 0)} ${esc(reason.label || '')}</li>`).join('')}</ul></details>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a href="${esc(itemUrl || '#')}" target="_blank" rel="noopener noreferrer" style="padding:10px 12px;border-radius:10px;background:#f04a0a;color:#fff;text-decoration:none;font-size:14px;font-weight:800;${itemUrl ? '' : 'pointer-events:none;opacity:.5'}">Haberi Aç</a><button type="button" data-copy-url="${esc(itemUrl)}" class="tb-small-btn">URL kopyala</button><button type="button" data-add-queue='${esc(JSON.stringify({ candidate_id: item.id, title: title(item), url: itemUrl, source_name: sourceName(item), image_url: itemImage, status: 'new', priority: score(item, 'discover_score') }))}' class="tb-small-btn">Yazılacaklara ekle</button></div>
      </div>
    </article>`;
  }

  function renderItems() {
    root();
    const grid = document.getElementById('tb-grid');
    const status = document.getElementById('tb-status');
    const sort = document.getElementById('tb-sort');
    if (sort) sort.value = state.sort;
    renderSourceTabs();
    renderViewBar();
    const all = visibleItems();
    const items = pagedItems();
    status.textContent = state.lastError
      ? `Hata: ${state.lastError}`
      : state.sort === 'discover_score'
        ? `${all.length} içerik listeleniyor, Discover için son 24 saat filtresi aktif`
        : `${all.length} içerik listeleniyor`;
    grid.className = `tb-news-grid ${state.view}`;
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = gridColumnsForView();
    grid.style.gap = state.view === 'compact' ? '10px' : '14px';
    grid.innerHTML = items.length ? items.map(renderCard).join('') : '<div style="padding:24px;border:1px solid #dbe3ef;border-radius:18px;background:#fff">Henüz içerik yok.</div>';
    renderPagination();
  }

  function renderPagination() {
    const wrap = document.getElementById('tb-pagination');
    if (!wrap) return;
    const pages = totalPages();
    wrap.innerHTML = `<button type="button" data-page="prev" class="tb-small-btn" ${state.page <= 1 ? 'disabled' : ''}>Önceki</button><span style="font-size:13px;color:#64748b;font-weight:800">${state.page} / ${pages}</span><button type="button" data-page="next" class="tb-small-btn" ${state.page >= pages ? 'disabled' : ''}>Sonraki</button>`;
  }

  function renderSources() {
    const wrap = document.getElementById('tb-sources-list');
    if (!wrap) return;
    wrap.innerHTML = state.sources.length ? state.sources.map((source) => `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px"><div style="font-weight:800;color:#111827">${esc(source.name || 'İsimsiz kaynak')}</div><div style="margin-top:6px;font-size:12px;color:#64748b;word-break:break-all">${esc(pick(source.rss_url, source.feed_url, source.site_url, source.url))}</div></div>`).join('') : '<div style="font-size:14px;color:#64748b">Henüz kaynak görünmüyor.</div>';
  }

  async function fetchJson(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
    try {
      const response = await fetch(path, { cache: 'no-store', ...options, signal: controller.signal });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!response.ok || data.error) throw new Error(data.error || text || `HTTP ${response.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadRecommendations() {
    const requestId = ++state.requestSequence;
    const requestedSort = state.sort;
    try {
      state.lastError = '';
      const data = await fetchJson(`/api/recommendations?sort=${encodeURIComponent(requestedSort)}&t=${Date.now()}`, { timeoutMs: 25000 });
      if (requestId !== state.requestSequence || requestedSort !== state.sort) return;
      state.items = Array.isArray(data.items) ? data.items : [];
    } catch (error) {
      if (requestId !== state.requestSequence || requestedSort !== state.sort) return;
      state.items = [];
      state.lastError = error?.message || String(error);
    }
    state.page = 1;
    renderItems();
  }

  async function loadSources() {
    try {
      const data = await fetchJson(`/api/sources?t=${Date.now()}`, { timeoutMs: 20000 });
      state.sources = Array.isArray(data.items) ? data.items : [];
      renderSources();
    } catch {
      state.sources = [];
      renderSources();
    }
  }

  async function refreshContent() {
    const status = document.getElementById('tb-status');
    let token = localStorage.getItem('tb_radar_cron_token') || '';
    if (!token) token = window.prompt('CRON_TOKEN değerini girin') || '';
    if (!token) return;
    localStorage.setItem('tb_radar_cron_token', token);
    state.loading = true;
    status.textContent = 'İçerikler yenileniyor...';
    try {
      await fetchJson(`/api/ingest?token=${encodeURIComponent(token)}&source_limit=8&item_limit=12&t=${Date.now()}`, { timeoutMs: 60000 });
      await fetchJson(`/api/score?token=${encodeURIComponent(token)}&t=${Date.now()}`, { timeoutMs: 90000 });
      await Promise.allSettled([loadRecommendations(), loadSources()]);
      status.textContent = 'İçerikler güncellendi.';
    } catch (error) {
      status.textContent = `Hata: ${error.message}`;
    } finally {
      state.loading = false;
    }
  }

  function bind() {
    document.addEventListener('change', (event) => {
      if (event.target?.id === 'tb-sort') {
        const nextSort = VALID_SORTS.has(event.target.value) ? event.target.value : 'discover_score';
        state.sort = nextSort;
        localStorage.setItem(SORT_KEY, nextSort);
        state.page = 1;
        state.source = 'all';
        loadRecommendations();
      }
      if (event.target?.id === 'tb-source-select') {
        state.source = event.target.value || 'all';
        state.page = 1;
        renderItems();
      }
      if (event.target?.matches('[data-select-url]')) {
        const value = event.target.getAttribute('data-select-url');
        if (event.target.checked) state.selected.add(value);
        else state.selected.delete(value);
      }
    });
    document.addEventListener('click', async (event) => {
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) {
        const nextView = VALID_VIEWS.has(viewButton.getAttribute('data-view')) ? viewButton.getAttribute('data-view') : 'cards-3';
        state.view = nextView;
        localStorage.setItem(VIEW_KEY, nextView);
        renderItems();
        return;
      }
      const pageButton = event.target.closest('[data-page]');
      if (pageButton) {
        const dir = pageButton.getAttribute('data-page');
        state.page = dir === 'next' ? Math.min(totalPages(), state.page + 1) : Math.max(1, state.page - 1);
        renderItems();
        return;
      }
      if (event.target.closest('#tb-refresh')) { refreshContent(); return; }
      const copy = event.target.closest('[data-copy-url]');
      if (copy) {
        const value = copy.getAttribute('data-copy-url') || '';
        if (value) await navigator.clipboard.writeText(value);
        const old = copy.textContent;
        copy.textContent = 'Kopyalandı';
        setTimeout(() => { copy.textContent = old; }, 1000);
        return;
      }
      if (event.target.closest('#tb-copy-selected')) {
        await navigator.clipboard.writeText([...state.selected].filter(Boolean).join('\n'));
        alert('Seçilen URL’ler kopyalandı.');
      }
    });
  }

  async function start() {
    root();
    bind();
    renderItems();
    renderSources();
    await Promise.allSettled([loadRecommendations(), loadSources()]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
