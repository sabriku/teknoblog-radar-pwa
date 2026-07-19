(() => {
  const COUNTRIES = [
    ['all', 'Türkiye + dünya'],
    ['WORLD', 'Dünya geneli'],
    ['TR', 'Türkiye'],
    ['US', 'ABD'],
    ['GB', 'Birleşik Krallık'],
    ['DE', 'Almanya'],
    ['JP', 'Japonya'],
    ['KR', 'Güney Kore'],
    ['IN', 'Hindistan'],
    ['FR', 'Fransa'],
    ['IT', 'İtalya'],
    ['BR', 'Brezilya']
  ];
  const WINDOWS = [
    ['4h', 'Son 4 saat'],
    ['24h', 'Son 24 saat'],
    ['48h', 'Son 48 saat'],
    ['168h', 'Son 7 gün']
  ];
  const CATEGORIES = [
    ['all', 'Bilim + Teknoloji'],
    ['science', 'Bilim'],
    ['technology', 'Teknoloji']
  ];
  const state = { items: [], loading: false, error: '', refreshedAt: '', sourceLabel: 'Google Trends · Şu Anda Trend Olanlar', country: 'all', window: '24h', category: 'all', countries: COUNTRIES, windows: WINDOWS, categories: CATEGORIES, sync: [], turkeyCount: 0, worldCount: 0 };

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(date);
  }

  function ensureStyle() {
    if (document.getElementById('tb-google-trends-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-google-trends-style';
    style.textContent = `
      #tb-google-trends-wrap{display:flex;flex-direction:column;gap:14px}
      .tb-gt-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;padding:14px;border:1px solid #fed7aa;border-radius:18px;background:linear-gradient(180deg,#fff7ed,#fff)}
      .tb-gt-head h2{font:700 28px/1 'Fira Sans Condensed',sans-serif;margin:0;color:#111827}
      .tb-gt-head p{font-size:13px;color:#64748b;margin:6px 0 0;line-height:1.5;max-width:720px}
      .tb-gt-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;justify-content:flex-end}
      .tb-gt-control{display:flex;flex-direction:column;gap:5px}.tb-gt-control label{font-size:11px;font-weight:900;color:#334155}.tb-gt-control select{min-width:145px;padding:9px 11px;border:1px solid #d1d5db;border-radius:12px;background:#fff;color:#111827;font-size:12px;font-weight:800}
      .tb-gt-refresh{border:1px solid #f04a0a;background:#fff;color:#f04a0a;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:900;cursor:pointer}
      .tb-gt-refresh:disabled{opacity:.62;cursor:not-allowed}.tb-gt-status{font-size:12px;color:#64748b;padding:0 2px}.tb-gt-status[data-error='1']{color:#b91c1c}
      .tb-gt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .tb-gt-card{border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:14px;box-shadow:0 4px 12px rgba(15,23,42,.04);border-top:4px solid #f04a0a}
      .tb-gt-card h3{font:700 20px/1.25 'Fira Sans Condensed',sans-serif;color:#111827;margin:8px 0;overflow-wrap:anywhere}
      .tb-gt-section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 0;padding:12px 2px 4px;border-bottom:1px solid #e2e8f0}.tb-gt-section-title h3{margin:0;font-size:18px}.tb-gt-section-title span{font-size:11px;color:#64748b}
      .tb-gt-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.tb-gt-chip{border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc;color:#475569;padding:5px 8px;font-size:11px;font-weight:800}
      .tb-gt-chip.hot{border-color:#fdba74;background:#fff7ed;color:#c2410c}.tb-gt-chip.tech{border-color:#93c5fd;background:#eff6ff;color:#1d4ed8}.tb-gt-chip.country{border-color:#fed7aa;background:#fff7ed;color:#9a3412}
      .tb-gt-summary{font-size:12px;line-height:1.55;color:#475569}.tb-gt-link{display:inline-flex;margin-top:10px;color:#f04a0a;text-decoration:none;font-size:12px;font-weight:900}.tb-gt-link:hover{text-decoration:underline}
      .tb-gt-empty{border:1px dashed #cbd5e1;border-radius:14px;padding:16px;text-align:center;color:#64748b;font-size:13px}
    `;
    document.head.appendChild(style);
  }

  function mount() { return document.querySelector('#tb-google-trends-wrap') || document.querySelector('#tb-layout main') || document.querySelector('main'); }
  function itemUrl(item) { return item.category_url || item.url || item.link || item.source_url || '#'; }
  function itemScore(item) { return item.trend_score ?? item.total_score ?? item.discover_score ?? 0; }
  function itemSummary(item) { return item.summary || item.description || item.excerpt || 'Bu trend için ilişkili sorgu bilgisi bulunmuyor.'; }
  function compact(value) { return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0)); }
  function countryLabel(code) { return COUNTRIES.find(([value]) => value === code)?.[1] || code || 'Bilinmiyor'; }
  function windowLabel(value) { return WINDOWS.find(([key]) => key === value)?.[1] || value || 'Son 24 saat'; }
  function categoryLabel(value) { return CATEGORIES.find(([key]) => key === value)?.[1] || value || 'Bilim + Teknoloji'; }
  function options(list, current) { return list.map(([value, label]) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`).join(''); }

  function render() {
    ensureStyle();
    const target = mount();
    if (!target) return false;
    let wrap = document.getElementById('tb-google-trends-wrap');
    if (!wrap) { wrap = document.createElement('section'); wrap.id = 'tb-google-trends-wrap'; target.appendChild(wrap); }
    const card = (item) => `
      <article class="tb-gt-card">
        <div class="tb-gt-meta">
          <span class="tb-gt-chip country">${esc(item.country_name || countryLabel(item.country_code))}</span>
          <span class="tb-gt-chip hot">${esc(compact(item.search_volume))}+ arama</span>
          <span class="tb-gt-chip hot">%${esc(item.growth_percentage || 0)} artış</span>
          <span class="tb-gt-chip ${item.is_active ? 'tech' : ''}">${item.is_active ? 'Etkin' : 'Sona erdi'}</span>
          ${item.stale ? '<span class="tb-gt-chip">Son sağlam veri</span>' : ''}
          <span class="tb-gt-chip tech">${esc(item.category || categoryLabel(state.category))}</span>
          <span class="tb-gt-chip">${esc(item.window_label || windowLabel(state.window))}</span>
          <span class="tb-gt-chip">Başlangıç ${esc(fmtDate(item.published_at || item.created_at || item.updated_at))}</span>
        </div>
        <h3>${esc(item.title)}</h3>
        <div class="tb-gt-summary">${esc(itemSummary(item))}</div>
        <a class="tb-gt-link" href="${esc(item.url || itemUrl(item))}" target="_blank" rel="noopener noreferrer">Google Trends'te incele</a>
      </article>
    `;
    const turkey = state.items.filter((item) => item.country_code === 'TR');
    const world = state.items.filter((item) => item.country_code !== 'TR');
    const cards = `${turkey.length ? `<div class="tb-gt-section-title"><h3>🇹🇷 Türkiye</h3><span>${turkey.length} güncel Bilim/Teknoloji trendi</span></div><div class="tb-gt-grid">${turkey.map(card).join('')}</div>` : ''}${world.length ? `<div class="tb-gt-section-title"><h3>🌍 Dünya</h3><span>${world.length} güncel Bilim/Teknoloji trendi</span></div><div class="tb-gt-grid">${world.map(card).join('')}</div>` : ''}`;
    wrap.innerHTML = `
      <div class="tb-gt-head">
        <div>
          <h2>${esc(state.sourceLabel)}</h2>
          <p>Google Trends'in kullandığı güncel Trending Now veri akışıyla ortalama 10 dakikada bir eşzamanlanır. Yalnızca Google'ın kategori kimliği 15 (Bilim) ve 18 (Teknoloji) olarak işaretlediği gerçek trendler gösterilir; RSS veya anahtar kelime filtresi kullanılmaz.</p>
        </div>
        <div class="tb-gt-controls">
          <div class="tb-gt-control"><label for="tb-gt-country">Ülke</label><select id="tb-gt-country">${options(state.countries, state.country)}</select></div>
          <div class="tb-gt-control"><label for="tb-gt-category">Kategori</label><select id="tb-gt-category">${options(state.categories, state.category)}</select></div>
          <div class="tb-gt-control"><label for="tb-gt-window">Zaman penceresi</label><select id="tb-gt-window">${options(state.windows, state.window)}</select></div>
          <button type="button" class="tb-gt-refresh" ${state.loading ? 'disabled' : ''}>Trendleri Yenile</button>
        </div>
      </div>
      <div class="tb-gt-status" data-error="${state.error ? '1' : '0'}">${esc(state.loading ? 'Google Trends ile eşzamanlanıyor...' : state.error || `Son eşzamanlama: ${fmtDate(state.refreshedAt) || 'henüz yok'} · ${categoryLabel(state.category)} · ${windowLabel(state.window)} · Türkiye ${state.turkeyCount} · Dünya ${state.worldCount}`)}</div>
      ${cards || '<div class="tb-gt-empty">Google Trends seçili ülke, kategori ve zaman penceresinde eşleşen güncel trend döndürmedi. Genel gündemle doldurma yapılmadı.</div>'}
    `;
    wrap.querySelector('.tb-gt-refresh')?.addEventListener('click', load);
    wrap.querySelector('#tb-gt-country')?.addEventListener('change', (event) => { state.country = event.target.value || 'all'; load(); });
    wrap.querySelector('#tb-gt-category')?.addEventListener('change', (event) => { state.category = event.target.value || 'all'; load(); });
    wrap.querySelector('#tb-gt-window')?.addEventListener('change', (event) => { state.window = event.target.value || '24h'; load(); });
    return true;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  async function load() {
    state.loading = true; state.error = ''; render();
    try {
      const params = new URLSearchParams({ google_trends: '1', limit: '72', geo: state.country, category: state.category, window: state.window, _: String(Date.now()) });
      const data = await fetchJson(`/api/trend-overview?${params.toString()}`);
      state.items = Array.isArray(data.items) ? data.items : [];
      state.refreshedAt = data.refreshed_at || new Date().toISOString();
      state.sourceLabel = data.source || 'Google Trends · Şu Anda Trend Olanlar';
      state.sync = Array.isArray(data.sync) ? data.sync : [];
      state.turkeyCount = Number(data.turkey_count || 0);
      state.worldCount = Number(data.world_count || 0);
      if (Array.isArray(data.countries) && data.countries.length) state.countries = [['all', 'Türkiye + dünya'], ['WORLD', 'Dünya geneli'], ...data.countries.map((country) => [country.code, country.name])];
      if (Array.isArray(data.available_windows) && data.available_windows.length) state.windows = data.available_windows.map((item) => [item.key, item.label]);
      if (Array.isArray(data.categories) && data.categories.length) state.categories = [['all', 'Bilim + Teknoloji'], ...data.categories.map((item) => [item.key, item.name])];
    } catch (error) {
      state.items = [];
      state.error = `Google Trends kategori akışı alınamadı: ${error?.message || 'Bilinmeyen hata'}`;
    } finally {
      state.loading = false; render();
    }
  }

  function start() { if (!render()) return setTimeout(start, 200); load(); setInterval(() => { if (location.hash === '#google-trends') load(); }, 10 * 60000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
