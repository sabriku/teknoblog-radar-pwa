(() => {
  const PREF_OPEN_KEY = 'tb_trend_radar_open';
  const PREF_TAB_KEY = 'tb_trend_radar_tab';

  const COMPETITOR_SOURCES = [
    'Webrazzi',
    'ShiftDelete.Net',
    'DonanımHaber',
    'Android Authority',
    'The Verge',
    '9to5Google',
    'MacRumors',
    'Windows Central',
    'SamMobile',
    'GSMArena',
    'LOG.com.tr',
    'TechRadar',
    'TechCrunch',
    'Digital Trends',
    'Ars Technica'
  ];

  const state = {
    clusters: [],
    recommendations: [],
    panel: localStorage.getItem(PREF_TAB_KEY) || 'trends',
    ready: false,
    isOpen: localStorage.getItem(PREF_OPEN_KEY) === '1'
  };

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul'
    }).format(d);
  }

  function recommendationLabel(value = '') {
    const map = {
      'satın_alma': 'Satın alma içeriği',
      'karşılaştırma': 'Karşılaştırma',
      'hızlı_haber': 'Hızlı haber',
      'takip_dosyası': 'Takip dosyası',
      'discover_hızlı_haber': 'Discover odaklı hızlı haber',
      'detay_haber': 'Detay haber'
    };
    return map[String(value || '').trim()] || 'Detay haber';
  }

  function normalizeCluster(item = {}) {
    const linkedNews = Array.isArray(item?.linked_news) ? item.linked_news : [];
    const sample = item?.summary?.sample_topics?.[0] || '';
    return {
      id: item?.id || '',
      cluster_name: String(item?.cluster_name || item?.summary?.display_name || sample || 'Trend başlığı').trim(),
      trend_score: Number(item?.trend_score || 0),
      early_signal_score: Number(item?.early_signal_score || 0),
      discover_potential_score: Number(item?.discover_potential_score || 0),
      seo_potential_score: Number(item?.seo_potential_score || 0),
      affiliate_potential_score: Number(item?.affiliate_potential_score || 0),
      turkey_interest_score: Number(item?.turkey_interest_score || 0),
      source_count: Number(item?.source_count || 0),
      signal_count: Number(item?.signal_count || 0),
      competitor_count: Number(item?.competitor_count || 0),
      recommendation: recommendationLabel(item?.recommendation_type),
      status: String(item?.status || ''),
      first_seen_at: item?.first_seen_at || null,
      last_seen_at: item?.last_seen_at || null,
      linked_news: linkedNews.map((news) => ({
        title: String(news?.candidate_title || '').trim(),
        url: String(news?.candidate_url || '').trim(),
        source_name: String(news?.source_name || '').trim(),
        match_score: Number(news?.match_score || 0)
      })),
      avg_discover: Number(item?.summary?.avg_discover_score || 0),
      avg_traffic: Number(item?.summary?.avg_traffic_score || 0),
      avg_signal: Number(item?.summary?.avg_signal_score || 0)
    };
  }

  function buildRecommendations(clusters = []) {
    return clusters
      .filter((cluster) => cluster.trend_score >= 45 || cluster.discover_potential_score >= 68)
      .slice(0, 12)
      .map((cluster) => ({
        title: cluster.cluster_name,
        priority: Math.round((cluster.trend_score * 0.45) + (cluster.discover_potential_score * 0.35) + (cluster.seo_potential_score * 0.20)),
        recommendation: cluster.recommendation,
        reason: [
          cluster.discover_potential_score >= 70 ? 'Discover potansiyeli güçlü' : 'Discover potansiyeli orta seviyede',
          cluster.source_count >= 3 ? `${cluster.source_count} farklı trend kaynağında görünür` : 'Henüz sınırlı trend kaynağında görünüyor',
          cluster.turkey_interest_score >= 70 ? 'Türkiye ilgisi güçlü' : 'Türkiye ilgisi sınırlı'
        ].join(' • '),
        examples: cluster.linked_news.slice(0, 2)
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  function sourcePerformance(clusters = []) {
    const map = new Map();
    clusters.forEach((cluster) => {
      const linked = cluster.linked_news.length ? cluster.linked_news : [{ source_name: 'Trend feed', match_score: 0 }];
      linked.forEach((news) => {
        const source = String(news?.source_name || 'Trend feed').trim();
        if (!map.has(source)) {
          map.set(source, {
            source,
            count: 0,
            avgDiscover: 0,
            avgSeo: 0,
            avgTrend: 0,
            lastPublished: null,
            highDiscover: 0
          });
        }
        const row = map.get(source);
        row.count += 1;
        row.avgDiscover += cluster.discover_potential_score;
        row.avgSeo += cluster.seo_potential_score;
        row.avgTrend += cluster.trend_score;
        if (cluster.discover_potential_score >= 70) row.highDiscover += 1;
        const p = cluster.last_seen_at;
        if (p) {
          const ts = new Date(p).getTime();
          if (!row.lastPublished || ts > row.lastPublished) row.lastPublished = ts;
        }
      });
    });

    return [...map.values()]
      .map((row) => ({
        ...row,
        avgDiscover: Math.round(row.avgDiscover / Math.max(1, row.count)),
        avgSeo: Math.round(row.avgSeo / Math.max(1, row.count)),
        avgTrend: Math.round(row.avgTrend / Math.max(1, row.count)),
        highDiscoverRatio: Math.round((row.highDiscover / Math.max(1, row.count)) * 100)
      }))
      .sort((a, b) => b.avgDiscover - a.avgDiscover)
      .slice(0, 10);
  }

  function competitorOverview(clusters = []) {
    const map = new Map(COMPETITOR_SOURCES.map((source) => [source, {
      source,
      count: 0,
      avgDiscover: 0,
      latestTitle: '',
      latestPublishedAt: null,
      latestUrl: ''
    }]));

    clusters.forEach((cluster) => {
      cluster.linked_news.forEach((news) => {
        if (!COMPETITOR_SOURCES.includes(news.source_name)) return;
        const row = map.get(news.source_name);
        row.count += 1;
        row.avgDiscover += cluster.discover_potential_score;
        const currentTs = new Date(cluster.last_seen_at || 0).getTime();
        const existingTs = new Date(row.latestPublishedAt || 0).getTime();
        if (!row.latestPublishedAt || currentTs > existingTs) {
          row.latestPublishedAt = cluster.last_seen_at || null;
          row.latestTitle = news.title || cluster.cluster_name;
          row.latestUrl = news.url || '';
        }
      });
    });

    return [...map.values()]
      .map((row) => ({
        ...row,
        avgDiscover: row.count ? Math.round(row.avgDiscover / row.count) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  async function fetchTrendOverview() {
    const res = await fetch('/api/trend-overview?limit=40', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return Array.isArray(data?.items) ? data.items.map(normalizeCluster) : [];
  }

  function ensureStyle() {
    if (document.getElementById('tb-trend-radar-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-trend-radar-style';
    style.textContent = `
      #tb-trend-radar-wrap { overflow:hidden; }
      #tb-trend-radar-wrap button[data-trend-tab].active { background:#f04a0a; color:#fff; border-color:#f04a0a; }
      #tb-trend-radar-wrap button[data-trend-tab] { background:#fff; color:#f04a0a; border:1px solid #f04a0a; }
      #tb-trend-radar-wrap .tb-trend-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
      #tb-trend-radar-wrap .tb-trend-card { border:1px solid #e2e8f0; border-radius:16px; background:#fff; padding:14px; box-shadow:0 6px 18px rgba(9,30,66,.05); }
      #tb-trend-radar-wrap .tb-trend-muted { color:#64748b; font-size:12px; }
      #tb-trend-radar-wrap .tb-trend-header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; padding:16px 18px; border-radius:18px; background:linear-gradient(180deg,#fff7ed 0%,#fff 100%); border:1px solid #fed7aa; }
      #tb-trend-radar-wrap .tb-summary-pill { display:flex; flex-direction:column; gap:3px; min-width:88px; padding:8px 10px; border-radius:14px; background:#fff; border:1px solid #e5e7eb; }
      #tb-trend-radar-wrap .tb-summary-pill strong { font:700 22px/1 'Fira Sans Condensed',sans-serif; color:#111827; }
      #tb-trend-radar-wrap .tb-summary-pill span { font-size:11px; color:#64748b; font-weight:700; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='trend'] { border-color:#fdba74; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='signal'] { border-color:#93c5fd; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='recommendation'] { border-color:#86efac; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='competitor'] { border-color:#c4b5fd; }
      #tb-trend-radar-wrap .tb-trend-body { margin-top:12px; padding:4px 2px 2px; }
      #tb-trend-radar-wrap .tb-collapse-btn { display:inline-flex; align-items:center; gap:8px; padding:10px 12px; border-radius:999px; border:1px solid #f04a0a; background:#fff; color:#f04a0a; font-size:13px; font-weight:700; cursor:pointer; }
      #tb-trend-radar-wrap .tb-chevron { transition:transform .2s ease; }
      #tb-trend-radar-wrap[data-open='0'] .tb-chevron { transform:rotate(-90deg); }
      #tb-trend-radar-wrap[data-open='0'] .tb-trend-body { display:none; }
      @media (max-width:980px){ #tb-trend-radar-wrap { margin-bottom:16px; } }
    `;
    document.head.appendChild(style);
  }

  function setPrefs() {
    localStorage.setItem(PREF_OPEN_KEY, state.isOpen ? '1' : '0');
    localStorage.setItem(PREF_TAB_KEY, state.panel);
  }

  function renderPanel() {
    ensureStyle();
    const main = document.querySelector('#tb-layout main');
    if (!main) return false;

    let wrap = document.getElementById('tb-trend-radar-wrap');
    if (!wrap) {
      wrap = document.createElement('section');
      wrap.id = 'tb-trend-radar-wrap';
      wrap.style.marginBottom = '18px';
      wrap.style.border = '1px solid #dbe3ef';
      wrap.style.borderRadius = '20px';
      wrap.style.background = '#fff';
      wrap.style.padding = '16px';
      wrap.style.boxShadow = '0 8px 24px rgba(9,30,66,.06)';
      main.prepend(wrap);
    }

    wrap.setAttribute('data-open', state.isOpen ? '1' : '0');

    const clusters = state.clusters;
    const hotTrends = clusters.slice(0, 8);
    const earlySignals = [...clusters].sort((a, b) => b.early_signal_score - a.early_signal_score).slice(0, 8);
    const recommendations = state.recommendations;
    const sources = sourcePerformance(clusters);
    const rivals = competitorOverview(clusters);

    const tabs = [
      ['trends', 'Trend Radarı'],
      ['signals', 'Erken Sinyaller'],
      ['recommendations', 'Önerilen İçerikler'],
      ['sources', 'Kaynak Performansı'],
      ['competitors', 'Rakip Takibi']
    ];

    const summary = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:stretch">
        <div class="tb-summary-pill" data-tone="trend"><strong>${hotTrends.length}</strong><span>Sıcak Trend</span></div>
        <div class="tb-summary-pill" data-tone="signal"><strong>${earlySignals.filter((item) => item.early_signal_score >= 55).length}</strong><span>Erken Sinyal</span></div>
        <div class="tb-summary-pill" data-tone="recommendation"><strong>${recommendations.length}</strong><span>Önerilen İçerik</span></div>
        <div class="tb-summary-pill" data-tone="competitor"><strong>${rivals.filter((item) => item.count > 0).length}</strong><span>Rakip Hareketi</span></div>
      </div>
    `;

    const renderTrendCards = (items, variant) => `
      <div class="tb-trend-grid">
        ${items.map((cluster) => `
          <article class="tb-trend-card">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
              <div style="font:700 22px/1.2 'Fira Sans Condensed',sans-serif;color:#111827">${esc(cluster.cluster_name)}</div>
              <div style="padding:6px 8px;border-radius:999px;background:${variant === 'signals' ? '#eff6ff' : '#fff7ed'};color:${variant === 'signals' ? '#1d4ed8' : '#c2410c'};font-size:12px;font-weight:700;white-space:nowrap">${variant === 'signals' ? `Erken ${cluster.early_signal_score}` : `Trend ${cluster.trend_score}`}</div>
            </div>
            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;font-size:12px;color:#475569;font-weight:700">
              <span>Discover ${cluster.discover_potential_score}</span>
              <span>SEO ${cluster.seo_potential_score}</span>
              <span>Kaynak ${cluster.source_count}</span>
              <span>TR ${cluster.turkey_interest_score}</span>
              <span>Rakip ${cluster.competitor_count}</span>
            </div>
            <div style="margin-top:10px;font-size:14px;color:#334155;line-height:1.55">${esc(cluster.recommendation)}</div>
            <div class="tb-trend-muted" style="margin-top:10px">Son görünme: ${esc(cluster.last_seen_at ? fmtDate(cluster.last_seen_at) : 'Bilinmiyor')}</div>
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
              ${cluster.linked_news.slice(0, 2).map((item) => `<a href="${esc(item.url || '#')}" target="_blank" rel="noopener noreferrer" style="font-size:13px;color:#f04a0a;text-decoration:none;font-weight:700">${esc(item.title || cluster.cluster_name)}</a>`).join('')}
            </div>
          </article>
        `).join('')}
      </div>`;

    const renderRecommendations = `
      <div class="tb-trend-grid">
        ${recommendations.map((item) => `
          <article class="tb-trend-card">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
              <div style="font:700 22px/1.2 'Fira Sans Condensed',sans-serif;color:#111827">${esc(item.title)}</div>
              <div style="padding:6px 8px;border-radius:999px;background:#ecfdf5;color:#166534;font-size:12px;font-weight:700;white-space:nowrap">Öncelik ${item.priority}</div>
            </div>
            <div style="margin-top:10px;font-size:14px;color:#334155;font-weight:700">${esc(item.recommendation)}</div>
            <div class="tb-trend-muted" style="margin-top:8px;line-height:1.5">${esc(item.reason)}</div>
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
              ${item.examples.map((example) => `<a href="${esc(example.url || '#')}" target="_blank" rel="noopener noreferrer" style="font-size:13px;color:#f04a0a;text-decoration:none;font-weight:700">${esc(example.title || item.title)}</a>`).join('')}
            </div>
          </article>
        `).join('')}
      </div>`;

    const renderSources = `
      <div style="display:grid;gap:10px">
        ${sources.map((source) => `
          <article class="tb-trend-card" style="padding:12px 14px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
              <div style="font:700 20px/1.2 'Fira Sans Condensed',sans-serif;color:#111827">${esc(source.source)}</div>
              <div style="padding:6px 8px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:700">Discover ${source.avgDiscover}</div>
            </div>
            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;font-size:12px;color:#475569;font-weight:700">
              <span>Küme ${source.count}</span>
              <span>Trend ${source.avgTrend}</span>
              <span>SEO ${source.avgSeo}</span>
              <span>Yüksek Discover oranı %${source.highDiscoverRatio}</span>
            </div>
            <div class="tb-trend-muted" style="margin-top:8px">Son görünme: ${esc(source.lastPublished ? fmtDate(source.lastPublished) : 'Bilinmiyor')}</div>
          </article>
        `).join('')}
      </div>`;

    const renderCompetitors = `
      <div style="display:grid;gap:10px">
        ${rivals.map((item) => `
          <article class="tb-trend-card" style="padding:12px 14px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
              <div style="font:700 20px/1.2 'Fira Sans Condensed',sans-serif;color:#111827">${esc(item.source)}</div>
              <div style="padding:6px 8px;border-radius:999px;background:${item.count > 0 ? '#fff7ed' : '#f8fafc'};color:${item.count > 0 ? '#7c3aed' : '#64748b'};font-size:12px;font-weight:700">${item.count} eşleşme</div>
            </div>
            <div class="tb-trend-muted" style="margin-top:8px">Ortalama Discover: ${item.avgDiscover}</div>
            ${item.latestTitle ? `<a href="${esc(item.latestUrl || '#')}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:10px;font-size:14px;color:#f04a0a;text-decoration:none;font-weight:700">${esc(item.latestTitle)}</a>` : `<div class="tb-trend-muted" style="margin-top:10px">Henüz görünür içerik yok.</div>`}
            ${item.latestPublishedAt ? `<div class="tb-trend-muted" style="margin-top:6px">Son yayın: ${esc(fmtDate(item.latestPublishedAt))}</div>` : ''}
          </article>
        `).join('')}
      </div>`;

    const panelHtml = state.panel === 'trends'
      ? renderTrendCards(hotTrends, 'trends')
      : state.panel === 'signals'
      ? renderTrendCards(earlySignals, 'signals')
      : state.panel === 'recommendations'
      ? renderRecommendations
      : state.panel === 'sources'
      ? renderSources
      : renderCompetitors;

    wrap.innerHTML = `
      <div class="tb-trend-header">
        <div style="display:flex;flex-direction:column;gap:10px;min-width:280px;flex:1 1 420px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="font:700 28px/1 'Fira Sans Condensed',sans-serif;color:#111827">Trend ve Karar Katmanı</div>
            <div style="padding:7px 10px;border-radius:999px;background:#fff;color:#c2410c;font-size:12px;font-weight:700;border:1px solid #fdba74">Backend trend verisi aktif</div>
          </div>
          <div style="font-size:14px;color:#475569;line-height:1.55">Panel artık /api/trend-overview verisini kullanıyor. Trend kümeleri, öneriler ve bağlı haberler doğrudan backend tarafında üretiliyor.</div>
          ${summary}
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:flex-end;flex:0 0 auto">
          <button type="button" id="tb-trend-toggle" class="tb-collapse-btn">
            <span class="tb-chevron">▾</span>
            ${state.isOpen ? 'Daralt' : 'Göster'}
          </button>
        </div>
      </div>
      <div class="tb-trend-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          ${tabs.map(([key, label]) => `<button type="button" data-trend-tab="${esc(key)}" class="${state.panel === key ? 'active' : ''}" style="padding:9px 12px;border-radius:999px;font-size:13px;font-weight:700;cursor:pointer">${esc(label)}</button>`).join('')}
        </div>
        <div id="tb-trend-panel-body">${panelHtml}</div>
      </div>
    `;

    return true;
  }

  async function boot() {
    try {
      state.clusters = await fetchTrendOverview();
      state.recommendations = buildRecommendations(state.clusters);
      state.ready = true;
      renderPanel();
    } catch (error) {
      const main = document.querySelector('#tb-layout main');
      if (!main) return;
      let wrap = document.getElementById('tb-trend-radar-wrap');
      if (!wrap) {
        wrap = document.createElement('section');
        wrap.id = 'tb-trend-radar-wrap';
        wrap.style.marginBottom = '18px';
        wrap.style.border = '1px solid #fecaca';
        wrap.style.borderRadius = '20px';
        wrap.style.background = '#fff';
        wrap.style.padding = '16px';
        main.prepend(wrap);
      }
      wrap.innerHTML = `<div style="font:700 24px/1 'Fira Sans Condensed',sans-serif;color:#991b1b">Trend katmanı yüklenemedi</div><div style="margin-top:10px;font-size:14px;color:#475569">${esc(error.message || error)}</div>`;
    }
  }

  document.addEventListener('click', (event) => {
    const tabBtn = event.target.closest('[data-trend-tab]');
    if (tabBtn) {
      state.panel = tabBtn.getAttribute('data-trend-tab') || 'trends';
      setPrefs();
      if (state.ready) renderPanel();
      return;
    }

    const toggleBtn = event.target.closest('#tb-trend-toggle');
    if (toggleBtn) {
      state.isOpen = !state.isOpen;
      setPrefs();
      if (state.ready) renderPanel();
    }
  });

  function waitForApp() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const main = document.querySelector('#tb-layout main');
      if (main) {
        clearInterval(timer);
        boot();
      }
      if (tries > 50) clearInterval(timer);
    }, 300);
  }

  document.addEventListener('DOMContentLoaded', waitForApp);
})();
