(() => {
  const state = { query: '', type: 'all', period: '30d', page: 1, loading: false, data: null, error: '' };
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (value) => value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(value)) : '—';
  const labels = { all: 'Tümü', news: 'Haber', teknoblog: 'Teknoblog', trends: 'Trend', sources: 'Kaynak' };

  function root() { return document.getElementById('tb-search-root'); }
  function headerInput() { return document.getElementById('tb-global-search-input'); }
  function token() { return localStorage.getItem('tb_radar_cron_token') || localStorage.getItem('tb_cron_token') || ''; }

  function syncUrl() {
    const url = new URL(location.href);
    if (state.query) url.searchParams.set('q', state.query); else url.searchParams.delete('q');
    history.replaceState(null, '', `${url.pathname}${url.search}#search`);
  }

  function image(item) {
    return item.image_url ? `<img class="tb-search-image" src="${esc(item.image_url)}" alt="" loading="lazy" onerror="this.hidden=true">` : `<div class="tb-search-image tb-search-placeholder">${item.result_type === 'sources' ? '🗂️' : item.result_type === 'trends' ? '📈' : '📰'}</div>`;
  }

  function resultCard(item) {
    const scores = item.result_type === 'news' ? `<span>Discover ${item.discover_score || 0}</span><span>Trafik ${item.traffic_score || 0}</span>`
      : item.result_type === 'trends' ? `<span>Momentum ${item.momentum_score || 0}</span><span>${item.source_count || 0} kaynak</span>`
      : item.result_type === 'teknoblog' ? `<span>Discover ${item.discover_clicks || 0} tık</span><span>News ${item.news_clicks || 0} tık</span>` : '';
    const queue = ['news', 'trends'].includes(item.result_type) && item.url ? `<button data-search-queue='${esc(JSON.stringify({ candidate_id: item.id, title: item.title, url: item.url, source_name: item.source_name, image_url: item.image_url, status: 'new', priority: Math.max(item.discover_score || 50, item.momentum_score || 0) }))}'>＋ Yazılacaklara</button>` : '';
    return `<article class="tb-search-card">${image(item)}<div class="tb-search-body"><div class="tb-search-badges"><b>${labels[item.result_type] || item.result_type}</b>${scores}</div><h3>${esc(item.title)}</h3><p>${esc(item.source_name || '')}${item.published_at ? ` · ${fmt(item.published_at)}` : ''}</p>${item.summary ? `<div class="tb-search-summary">${esc(String(item.summary).replace(/<[^>]+>/g, '').slice(0, 220))}</div>` : ''}<nav>${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">Sonucu aç</a>` : ''}${queue}</nav></div></article>`;
  }

  function render() {
    const el = root(); if (!el) return;
    const counts = state.data?.counts || {};
    let content = '<div class="tb-search-empty">Aramak istediğiniz konuyu yazın. Haberler, Teknoblog arşivi, trend kümeleri ve kaynaklar birlikte taranır.</div>';
    if (state.loading) content = '<div class="tb-search-empty">Aranıyor…</div>';
    else if (state.error) content = `<div class="tb-search-empty">Hata: ${esc(state.error)}</div>`;
    else if (state.data && !state.data.items?.length) content = '<div class="tb-search-empty">Bu ölçütlerle eşleşen sonuç bulunamadı.</div>';
    else if (state.data) content = `<div class="tb-search-stats"><b>${state.data.total} sonuç</b>${Object.entries(counts).map(([key, value]) => `<span>${labels[key] || key}: ${value}</span>`).join('')}</div><div class="tb-search-grid">${state.data.items.map(resultCard).join('')}</div>${state.data.total > state.page * state.data.limit ? '<button class="tb-search-more" data-search-more>Daha fazla sonuç</button>' : ''}`;
    el.innerHTML = `<style>.tb-search-box{display:grid;grid-template-columns:minmax(220px,1fr) 160px 150px auto;gap:8px;margin-bottom:14px}.tb-search-box input,.tb-search-box select{min-width:0;border:1px solid #cbd5e1;border-radius:12px;padding:11px;background:#fff;font:13px 'Open Sans',sans-serif}.tb-search-box button,.tb-search-more,.tb-search-card nav a,.tb-search-card nav button{border:1px solid #f04a0a;border-radius:11px;background:#fff;color:#c2410c;padding:9px 11px;font-size:12px;font-weight:900;text-decoration:none;cursor:pointer}.tb-search-box button{background:#f04a0a;color:#fff}.tb-search-stats{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:8px 0 14px}.tb-search-stats span,.tb-search-badges span,.tb-search-badges b{border-radius:999px;padding:4px 8px;background:#eef2ff;color:#3730a3;font-size:10px;font-weight:900}.tb-search-badges b{background:#fff1eb;color:#c2410c}.tb-search-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}.tb-search-card{overflow:hidden;border:1px solid #e2e8f0;border-radius:17px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.05)}.tb-search-image{width:100%;aspect-ratio:16/8.6;object-fit:cover;background:#f1f5f9}.tb-search-placeholder{display:grid;place-items:center;font-size:38px}.tb-search-body{padding:13px}.tb-search-badges{display:flex;gap:4px;flex-wrap:wrap}.tb-search-card h3{margin:9px 0 5px;font-size:17px;line-height:1.3}.tb-search-card p,.tb-search-summary{font-size:12px;color:#64748b;line-height:1.5}.tb-search-summary{margin:8px 0}.tb-search-card nav{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.tb-search-empty{padding:24px;border:1px dashed #cbd5e1;border-radius:15px;text-align:center;color:#64748b;background:#f8fafc}.tb-search-more{display:block;margin:16px auto}.tb-global-search{display:flex;gap:7px;align-items:center;min-width:min(100%,390px)}.tb-global-search input{min-width:0;flex:1;border:1px solid #cbd5e1;border-radius:999px;padding:10px 14px;background:#fff;font-size:13px}.tb-global-search button{border:0;border-radius:999px;background:#111827;color:#fff;padding:10px 13px;font-weight:900;cursor:pointer}@media(max-width:720px){.tb-search-box{grid-template-columns:1fr 1fr}.tb-search-box input{grid-column:1/-1}.tb-search-grid{grid-template-columns:1fr}.tb-global-search{width:100%}}</style><form class="tb-search-box" id="tb-search-form"><input id="tb-search-query" value="${esc(state.query)}" placeholder="Örn. Galaxy Z Fold 8, OpenAI, Pixel…" autocomplete="off"><select id="tb-search-type"><option value="all">Tüm alanlar</option><option value="news">Haberler</option><option value="teknoblog">Teknoblog arşivi</option><option value="trends">Trend kümeleri</option><option value="sources">Kaynaklar</option></select><select id="tb-search-period"><option value="24h">Son 24 saat</option><option value="7d">Son 7 gün</option><option value="30d">Son 30 gün</option><option value="90d">Son 90 gün</option><option value="all">Tüm zamanlar</option></select><button type="submit">🔎 Ara</button></form><div id="tb-search-results">${content}</div>`;
    document.getElementById('tb-search-type').value = state.type;
    document.getElementById('tb-search-period').value = state.period;
  }

  async function search(reset = true) {
    if (reset) state.page = 1;
    if (state.query.trim().length < 2) { state.data = null; state.error = ''; render(); return; }
    state.loading = true; state.error = ''; render(); syncUrl();
    try {
      const params = new URLSearchParams({ q: state.query.trim(), type: state.type, period: state.period, page: String(state.page), limit: '24' });
      const response = await fetch(`/api/search?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      state.data = reset || !state.data ? data : { ...data, items: [...state.data.items, ...data.items] };
    } catch (error) { state.error = error?.message || String(error); }
    finally { state.loading = false; render(); }
  }

  function openSearch(query) {
    state.query = String(query || '').trim();
    if (headerInput()) headerInput().value = state.query;
    const tab = document.querySelector('[data-spa-tab="search"]'); tab?.click();
    search(true);
  }

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'tb-global-search-form') { event.preventDefault(); openSearch(headerInput()?.value); return; }
    if (event.target.id !== 'tb-search-form') return;
    event.preventDefault(); state.query = document.getElementById('tb-search-query')?.value || ''; state.type = document.getElementById('tb-search-type')?.value || 'all'; state.period = document.getElementById('tb-search-period')?.value || '30d'; search(true);
  });
  document.addEventListener('click', async (event) => {
    if (event.target.closest('[data-search-more]')) { state.page += 1; await search(false); return; }
    const button = event.target.closest('[data-search-queue]'); if (!button) return;
    try {
      const body = JSON.parse(button.dataset.searchQueue);
      const response = await fetch(`/api/intelligence?token=${encodeURIComponent(token())}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_upsert', ...body }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      button.textContent = '✓ Eklendi'; button.disabled = true;
    } catch (error) { alert(error?.message || String(error)); }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' || (event.key === '/' && !/input|textarea|select/i.test(event.target.tagName))) { event.preventDefault(); headerInput()?.focus(); }
  });
  window.addEventListener('tb-spa-tab-change', (event) => { if (event.detail?.tab === 'search' && !state.data && state.query.length >= 2) search(true); });

  function start() {
    const params = new URLSearchParams(location.search); state.query = params.get('q') || '';
    if (headerInput()) headerInput().value = state.query;
    render();
    if (location.hash === '#search' && state.query.length >= 2) search(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
