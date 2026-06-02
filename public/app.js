(() => {
  const state = {
    items: [],
    sources: [],
    trends: [],
    sort: 'published_at',
    source: 'all',
    view: 'cards',
    page: 1,
    pageSize: 20,
    selected: new Set(),
    loading: false,
    trendLoading: false,
    trendWindow: '24h'
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

  function publishedAt(item) {
    return pick(item?.published_at, item?.created_at, item?.updated_at);
  }

  function timestamp(item) {
    const time = new Date(publishedAt(item) || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function ageHours(item) {
    const time = timestamp(item);
    if (!time) return 999999;
    return Math.max(0, (Date.now() - time) / 3600000);
  }

  function isLast24h(item) {
    return ageHours(item) <= 24;
  }

  function score(item, key) {
    const value = Number(item?.[key]);
    return Number.isFinite(value) ? value : 0;
  }

  function title(item) {
    return decode(pick(item?.title, 'Başlıksız içerik'));
  }

  function summary(item) {
    return decode(pick(item?.summary, item?.excerpt, item?.description));
  }

  function url(item) {
    return pick(item?.url, item?.canonical_url, item?.link, item?.article_url, item?.target_url, item?.source_url, item?.site_url);
  }

  function image(item) {
    return pick(item?.image_url, item?.image, item?.thumbnail, item?.thumb_url, item?.media_url);
  }

  function sourceName(item) {
    return pick(item?.source_name, 'Kaynak yok');
  }

  function formatDate(value) {
    const date = new Date(value || 0);
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

  function todayLabel() {
    return new Intl.DateTimeFormat('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Istanbul'
    }).format(new Date());
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

  function totalPages() {
    return Math.max(1, Math.ceil(visibleItems().length / state.pageSize));
  }

  function scoreBadge(label, value, color) {
    return `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;border:1px solid ${color};color:${color};background:#fff;font-size:11px;font-weight:800">${esc(label)} ${esc(value)}</span>`;
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
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
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
            <button id="tb-view-cards" type="button" class="tb-small-btn">Kart</button>
            <button id="tb-view-list" type="button" class="tb-small-btn">Liste</button>
            <button id="tb-refresh" type="button" class="tb-primary-btn">İçerikleri Yenile</button>
            <button id="tb-copy-selected" type="button" class="tb-small-btn">Seçilen URL'leri kopyala</button>
          </div>
        </header>
        <div id="tb-status" style="margin-bottom:12px;font-size:14px;color:#475569"></div>
        <section id="tb-google-trends-radar-section" style="margin-bottom:18px;border:1px solid #dbe3ef;border-radius:22px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(9,30,66,.06)">
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:14px">
            <div>
              <div style="font:700 24px/1 'Fira Sans Condensed',sans-serif;color:#111827">Google Trends Teknoloji Radarı</div>
              <div style="margin-top:8px;font-size:14px;line-height:1.5;color:#475569">Yalnızca bugünün ve son 24 saatin teknoloji trendleri gösterilir.</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap" id="tb-trend-window-tabs"></div>
          </div>
          <div id="tb-trend-status" style="margin-bottom:12px;font-size:13px;color:#64748b"></div>
          <div id="tb-trend-grid"></div>
        </section>
        <div id="tb-source-tabs" style="display:flex;gap:8px;overflow:auto;padding-bottom:8px;margin-bottom:16px"></div>
        <div id="tb-layout" style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px">
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
              <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;margin-bottom:12px">İşlem Günlüğü</div>
              <div id="tb-debug" style="font-size:12px;color:#475569">Henüz işlem kaydı yok.</div>
            </section>
          </aside>
        </div>
      </div>
      <style>
        .tb-small-btn{padding:10px 12px;border:1px solid #f04a0a;border-radius:12px;background:#fff;color:#f04a0a;font-weight:800;cursor:pointer}
        .tb-primary-btn{padding:10px 14px;border:0;border-radius:12px;background:#f04a0a;color:#fff;font-weight:800;cursor:pointer}
        @media(max-width:960px){#tb-layout{grid-template-columns:1fr!important}}
      </style>`;
    return document.getElementById('tb-radar-root');
  }

  function renderSourceTabs() {
    const wrap = document.getElementById('tb-source-tabs');
    if (!wrap) return;
    const names = ['all', ...new Set(visibleItems().map(sourceName).filter(Boolean))].sort((a, b) => a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b, 'tr'));
    if (!names.includes(state.source)) state.source = 'all';
    wrap.innerHTML = names.map((name) => {
      const active = state.source === name;
      const label = name === 'all' ? 'Tüm kaynaklar' : name;
      return `<button type="button" data-source-filter="${esc(name)}" style="flex:0 0 auto;padding:8px 12px;border-radius:999px;border:1px solid ${active ? '#f04a0a' : '#d1d5db'};background:${active ? '#fff1eb' : '#fff'};color:${active ? '#f04a0a' : '#374151'};font-weight:800;cursor:pointer">${esc(label)}</button>`;
    }).join('');
  }

  function renderCard(item) {
    const itemUrl = url(item);
    const itemImage = image(item);
    const checked = state.selected.has(itemUrl) ? 'checked' : '';
    const date = formatDate(publishedAt(item));
    const age = ageHours(item);
    const stale = age > 24;
    return `<article style="display:grid;grid-template-rows:auto 1fr;border:1px solid ${stale ? '#fed7aa' : '#dbe3ef'};border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(9,30,66,.06);overflow:hidden">
      <div style="position:relative;background:#f3f6fa;aspect-ratio:16/9">
        ${itemImage ? `<img src="${esc(itemImage)}" alt="${esc(title(item))}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#64748b;font-weight:800">Görsel yok</div>`}
        <label style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,.95);border-radius:999px;padding:6px 10px;display:flex;gap:6px;font-size:12px;font-weight:800"><input type="checkbox" data-select-url="${esc(itemUrl)}" ${checked}> Seç</label>
      </div>
      <div style="padding:14px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">${scoreBadge('Genel', score(item, 'total_score'), '#c2410c')}${scoreBadge('Discover', score(item, 'discover_score'), '#2563eb')}${scoreBadge('Trafik', score(item, 'traffic_score'), '#15803d')}</div>
        <h3 style="margin:0;font:700 22px/1.25 'Fira Sans Condensed',sans-serif;color:#111827">${esc(title(item))}</h3>
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:#64748b;font-weight:800"><span>${esc(date)}</span><span>${esc(sourceName(item))}</span></div>
        ${stale ? `<div style="font-size:12px;color:#b45309;font-weight:800">24 saatten eski, Discover için kullanılmamalı</div>` : ''}
        <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(summary(item))}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a href="${esc(itemUrl || '#')}" target="_blank" rel="noopener noreferrer" style="padding:10px 12px;border-radius:10px;background:#f04a0a;color:#fff;text-decoration:none;font-size:14px;font-weight:800;${itemUrl ? '' : 'pointer-events:none;opacity:.5'}">Haberi Aç</a><button type="button" data-copy-url="${esc(itemUrl)}" class="tb-small-btn">URL kopyala</button></div>
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
    const all = visibleItems();
    const items = pagedItems();
    status.textContent = state.sort === 'discover_score' ? `${all.length} içerik listeleniyor, Discover için son 24 saat filtresi aktif` : `${all.length} içerik listeleniyor`;
    grid.className = state.view;
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = state.view === 'list' ? '1fr' : 'repeat(auto-fit,minmax(300px,1fr))';
    grid.style.gap = '14px';
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

  function sparkline(points = []) {
    const values = points.map((p) => Number(p.count || 0));
    const max = Math.max(1, ...values);
    const width = 260;
    const height = 54;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const coords = values.map((value, i) => `${i * step},${height - (value / max) * 44 - 5}`).join(' ');
    return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:54px;display:block"><polyline fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/><line x1="0" y1="${height - 5}" x2="${width}" y2="${height - 5}" stroke="#e5e7eb" stroke-width="1"/></svg>`;
  }

  function renderTrendCard(item) {
    const links = Array.isArray(item.linked_news) ? item.linked_news : [];
    return `<article style="border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:14px;box-shadow:0 4px 12px rgba(15,23,42,.04)">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${scoreBadge('Trend', Math.round(score(item, 'trend_score')), '#7c3aed')}${scoreBadge('Discover', Math.round(score(item, 'discover_potential_score')), '#2563eb')}</div>
      <h3 style="margin:0 0 8px;font:700 20px/1.25 'Fira Sans Condensed',sans-serif;color:#111827">${esc(item.cluster_name || item.summary?.display_name || 'Trend')}</h3>
      <div style="font-size:12px;color:#64748b;font-weight:800;margin-bottom:8px">Sinyal: ${esc(item.window_signal_count || 0)} · Referans: ${esc(links.length)} · Maksimum yaş: ${esc(item.max_age_hours || 24)} saat</div>
      ${sparkline(item.sparkline || [])}
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">${links.length ? links.map((link) => `<a href="${esc(link.candidate_url || '#')}" target="_blank" rel="noopener noreferrer" style="font-size:13px;line-height:1.4;color:#f04a0a;font-weight:800;text-decoration:none">${esc(link.candidate_title || 'Haber referansı')}</a>`).join('') : '<span style="font-size:13px;color:#64748b">Son 24 saatte eşleşen haber referansı yok.</span>'}</div>
    </article>`;
  }

  function renderTrends() {
    const tabs = document.getElementById('tb-trend-window-tabs');
    const status = document.getElementById('tb-trend-status');
    const grid = document.getElementById('tb-trend-grid');
    if (!tabs || !status || !grid) return;
    tabs.innerHTML = ['4h', '24h'].map((key) => `<button type="button" data-trend-window="${key}" style="padding:8px 12px;border-radius:999px;border:1px solid ${state.trendWindow === key ? '#7c3aed' : '#d1d5db'};background:${state.trendWindow === key ? '#f5f3ff' : '#fff'};color:${state.trendWindow === key ? '#7c3aed' : '#374151'};font-weight:800;cursor:pointer">${key === '4h' ? 'Son 4 saat' : 'Son 24 saat'}</button>`).join('');
    status.textContent = state.trendLoading ? 'Trendler yükleniyor...' : `${state.trends.length} güncel trend kümesi listeleniyor`;
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(300px,1fr))';
    grid.style.gap = '12px';
    grid.innerHTML = state.trends.length ? state.trends.map(renderTrendCard).join('') : '<div style="padding:16px;border:1px dashed #cbd5e1;border-radius:14px;color:#64748b">Güncel trend kümesi bulunamadı.</div>';
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
    const data = await fetchJson(`/api/recommendations?sort=${encodeURIComponent(state.sort)}&t=${Date.now()}`, { timeoutMs: 25000 });
    state.items = Array.isArray(data.items) ? data.items : [];
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

  async function loadTrends() {
    state.trendLoading = true;
    renderTrends();
    try {
      const data = await fetchJson(`/api/trend-overview?window=${encodeURIComponent(state.trendWindow)}&limit=12&t=${Date.now()}`, { timeoutMs: 30000 });
      state.trends = Array.isArray(data.items) ? data.items : [];
    } catch {
      state.trends = [];
    } finally {
      state.trendLoading = false;
      renderTrends();
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
      await Promise.allSettled([loadRecommendations(), loadSources(), loadTrends()]);
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
        state.sort = event.target.value;
        state.page = 1;
        state.source = 'all';
        loadRecommendations();
      }
      if (event.target?.matches('[data-select-url]')) {
        const value = event.target.getAttribute('data-select-url');
        if (event.target.checked) state.selected.add(value);
        else state.selected.delete(value);
      }
    });
    document.addEventListener('click', async (event) => {
      const sourceButton = event.target.closest('[data-source-filter]');
      if (sourceButton) {
        state.source = sourceButton.getAttribute('data-source-filter') || 'all';
        state.page = 1;
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
      const trendButton = event.target.closest('[data-trend-window]');
      if (trendButton) {
        state.trendWindow = trendButton.getAttribute('data-trend-window') || '24h';
        loadTrends();
        return;
      }
      if (event.target.closest('#tb-view-cards')) { state.view = 'cards'; renderItems(); return; }
      if (event.target.closest('#tb-view-list')) { state.view = 'list'; renderItems(); return; }
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
    renderTrends();
    await Promise.allSettled([loadRecommendations(), loadSources(), loadTrends()]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
