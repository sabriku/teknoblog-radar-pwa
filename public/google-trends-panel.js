(() => {
  const COUNTRIES = [
    ['all', 'Türkiye + dünya'],
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
  const state = { items: [], loading: false, error: '', refreshedAt: '', sourceLabel: 'Bilim ve Teknoloji Trendleri', country: 'all', window: '24h', countries: COUNTRIES, windows: WINDOWS };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul'
    }).format(date);
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
      .tb-gt-control{display:flex;flex-direction:column;gap:5px}.tb-gt-control label{font-size:11px;font-weight:900;color:#334155}.tb-gt-control select{min-width:150px;padding:9px 11px;border:1px solid #d1d5db;border-radius:12px;background:#fff;color:#111827;font-size:12px;font-weight:800}
      .tb-gt-refresh{border:1px solid #f04a0a;background:#fff;color:#f04a0a;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:900;cursor:pointer}
      .tb-gt-refresh:disabled{opacity:.62;cursor:not-allowed}.tb-gt-status{font-size:12px;color:#64748b;padding:0 2px}.tb-gt-status[data-error='1']{color:#b91c1c}
      .tb-gt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .tb-gt-card{border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:14px;box-shadow:0 4px 12px rgba(15,23,42,.04);border-top:4px solid #f04a0a}
      .tb-gt-card h3{font:700 20px/1.25 'Fira Sans Condensed',sans-serif;color:#111827;margin:8px 0;overflow-wrap:anywhere}
      .tb-gt-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.tb-gt-chip{border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc;color:#475569;padding:5px 8px;font-size:11px;font-weight:800}
      .tb-gt-chip.hot{border-color:#fdba74;background:#fff7ed;color:#c2410c}.tb-gt-chip.tech{border-color:#93c5fd;background:#eff6ff;color:#1d4ed8}.tb-gt-chip.fallback{border-color:#c4b5fd;background:#f5f3ff;color:#6d28d9}.tb-gt-chip.country{border-color:#fed7aa;background:#fff7ed;color:#9a3412}
      .tb-gt-summary{font-size:12px;line-height:1.55;color:#475569}.tb-gt-link{display:inline-flex;margin-top:10px;color:#f04a0a;text-decoration:none;font-size:12px;font-weight:900}.tb-gt-link:hover{text-decoration:underline}
      .tb-gt-empty{border:1px dashed #cbd5e1;border-radius:14px;padding:16px;text-align:center;color:#64748b;font-size:13px}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    return document.querySelector('#tb-google-trends-wrap') || document.querySelector('#tb-layout main') || document.querySelector('main');
  }

  function itemUrl(item) { return item.url || item.link || item.source_url || '#'; }
  function itemScore(item) { return item.trend_score ?? item.total_score ?? item.discover_score ?? 0; }
  function itemSummary(item) { return item.summary || item.description || item.excerpt || 'Bilim ve teknoloji odağında yükselen konu.'; }
  function countryLabel(code) { return COUNTRIES.find(([value]) => value === code)?.[1] || code || 'Bilinmiyor'; }
  function windowLabel(value) { return WINDOWS.find(([key]) => key === value)?.[1] || value || 'Son 24 saat'; }

  function options(list, current) {
    return list.map(([value, label]) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
  }

  function render() {
    ensureStyle();
    const target = mount();
    if (!target) return false;
    let wrap = document.getElementById('tb-google-trends-wrap');
    if (!wrap) {
      wrap = document.createElement('section');
      wrap.id = 'tb-google-trends-wrap';
      target.appendChild(wrap);
    }

    const cards = state.items.map((item) => `
      <article class="tb-gt-card">
        <div class="tb-gt-meta">
          <span class="tb-gt-chip country">${esc(item.country_name || countryLabel(item.country_code))}</span>
          <span class="tb-gt-chip hot">Skor ${esc(itemScore(item))}</span>
          ${item.from_fallback ? '<span class="tb-gt-chip fallback">Tamamlayıcı akış</span>' : '<span class="tb-gt-chip tech">Bilim ve Teknoloji</span>'}
          <span class="tb-gt-chip">${esc(item.window_label || windowLabel(state.window))}</span>
          <span class="tb-gt-chip">${esc(fmtDate(item.published_at || item.created_at || item.updated_at))}</span>
        </div>
        <h3>${esc(item.title)}</h3>
        <div class="tb-gt-summary">${esc(itemSummary(item))}</div>
        <a class="tb-gt-link" href="${esc(itemUrl(item))}" target="_blank" rel="noopener noreferrer">Kaynağı aç</a>
      </article>
    `).join('');

    wrap.innerHTML = `
      <div class="tb-gt-head">
        <div>
          <h2>${esc(state.sourceLabel)}</h2>
          <p>Bu bölüm yalnızca bilim, teknoloji, yapay zeka, mobil, donanım, yazılım, uzay ve siber güvenlik odağındaki trend sinyallerini gösterir. Google Trends RSS içinden bu konular ayıklanır; yeterli eşleşme yoksa bilim-teknoloji haber akışıyla tamamlanır.</p>
        </div>
        <div class="tb-gt-controls">
          <div class="tb-gt-control"><label for="tb-gt-country">Ülke</label><select id="tb-gt-country">${options(state.countries, state.country)}</select></div>
          <div class="tb-gt-control"><label for="tb-gt-window">Zaman penceresi</label><select id="tb-gt-window">${options(state.windows, state.window)}</select></div>
          <button type="button" class="tb-gt-refresh" ${state.loading ? 'disabled' : ''}>Trendleri Yenile</button>
        </div>
      </div>
      <div class="tb-gt-status" data-error="${state.error ? '1' : '0'}">${esc(state.loading ? 'Akış yükleniyor...' : state.error || `Son kontrol: ${fmtDate(state.refreshedAt) || 'henüz yok'} · Zaman: ${windowLabel(state.window)} · Konu: ${state.items.length}`)}</div>
      ${cards ? `<div class="tb-gt-grid">${cards}</div>` : '<div class="tb-gt-empty">Seçili zaman penceresinde bilim ve teknoloji trendi bulunamadı.</div>'}
    `;
    wrap.querySelector('.tb-gt-refresh')?.addEventListener('click', load);
    wrap.querySelector('#tb-gt-country')?.addEventListener('change', (event) => { state.country = event.target.value || 'all'; load(); });
    wrap.querySelector('#tb-gt-window')?.addEventListener('change', (event) => { state.window = event.target.value || '24h'; load(); });
    return true;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  async function loadFallback() {
    const fallback = await fetchJson(`/api/trend-overview?google_news=1&limit=30&_=${Date.now()}`);
    state.items = (Array.isArray(fallback.items) ? fallback.items : []).map((item) => ({ ...item, from_fallback: true, is_tech: true, country_code: 'TR', country_name: 'Türkiye', window_label: windowLabel(state.window) }));
    state.refreshedAt = fallback.refreshed_at || new Date().toISOString();
    state.sourceLabel = 'Bilim ve Teknoloji Trendleri';
    state.error = '';
  }

  async function load() {
    state.loading = true;
    state.error = '';
    render();
    try {
      const params = new URLSearchParams({ google_trends: '1', limit: '48', geo: state.country, window: state.window, _: String(Date.now()) });
      const data = await fetchJson(`/api/trend-overview?${params.toString()}`);
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) {
        await loadFallback();
      } else {
        state.items = items;
        state.refreshedAt = data.refreshed_at || new Date().toISOString();
        state.sourceLabel = 'Bilim ve Teknoloji Trendleri';
        if (Array.isArray(data.countries) && data.countries.length) state.countries = [['all', 'Türkiye + dünya'], ...data.countries.map((country) => [country.code, country.name])];
        if (Array.isArray(data.available_windows) && data.available_windows.length) state.windows = data.available_windows.map((item) => [item.key, item.label]);
      }
    } catch (primaryError) {
      try {
        await loadFallback();
      } catch (fallbackError) {
        state.items = [];
        state.error = `Bilim ve teknoloji trend akışı alınamadı: ${fallbackError?.message || primaryError?.message || 'Bilinmeyen hata'}`;
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  function start() {
    if (!render()) return setTimeout(start, 200);
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
