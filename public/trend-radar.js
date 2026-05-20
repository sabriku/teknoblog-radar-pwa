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

  const PANEL_META = {
    trends: {
      label: 'Gündemdekiler',
      title: 'Şu anda öne çıkan trend kümeleri',
      desc: 'En yüksek trend skoruna sahip başlıklar burada görünür.',
      chip: 'Sıcak gündem',
      tone: 'trend',
      icon: '↗'
    },
    signals: {
      label: 'Erken Fırsatlar',
      title: 'Henüz büyümeden yakalanan sinyaller',
      desc: 'Erken sinyal puanı yüksek başlıklar, hızlı içerik fırsatı sunar.',
      chip: 'Erken sinyal',
      tone: 'signal',
      icon: '⚡'
    },
    recommendations: {
      label: 'Editör Önerileri',
      title: 'Yazıya dönüşmeye en yakın içerikler',
      desc: 'Discover, SEO ve Türkiye ilgisine göre önceliklendirilmiş öneriler.',
      chip: 'Öneri listesi',
      tone: 'recommendation',
      icon: '✦'
    },
    sources: {
      label: 'Kaynak Analizi',
      title: 'Hangi kaynaklar daha verimli sinyal üretiyor',
      desc: 'Trend kümelerine en çok katkı veren kaynaklar ve kalite düzeyleri.',
      chip: 'Kaynak görünümü',
      tone: 'source',
      icon: '◫'
    },
    competitors: {
      label: 'Rakip Takibi',
      title: 'Rakip yayınlarda hareket olan başlıklar',
      desc: 'Rakip kaynakların hangi başlıklarda yoğunlaştığı burada izlenir.',
      chip: 'Rakip görünümü',
      tone: 'competitor',
      icon: '◎'
    }
  };

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
      #tb-trend-radar-wrap .tb-trend-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }
      #tb-trend-radar-wrap .tb-trend-card { border:1px solid #e2e8f0; border-radius:18px; background:#fff; padding:16px; box-shadow:0 8px 22px rgba(15,23,42,.05); }
      #tb-trend-radar-wrap .tb-trend-muted { color:#64748b; font-size:12px; }
      #tb-trend-radar-wrap .tb-trend-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; flex-wrap:wrap; padding:18px 20px; border-radius:20px; background:linear-gradient(180deg,#fff7ed 0%,#fff 100%); border:1px solid #fed7aa; }
      #tb-trend-radar-wrap .tb-summary-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; width:100%; }
      #tb-trend-radar-wrap .tb-summary-pill { display:flex; align-items:flex-start; gap:12px; padding:14px; border-radius:16px; background:#fff; border:1px solid #e5e7eb; }
      #tb-trend-radar-wrap .tb-summary-icon { width:36px; height:36px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:700; flex:0 0 36px; }
      #tb-trend-radar-wrap .tb-summary-copy { display:flex; flex-direction:column; gap:3px; min-width:0; }
      #tb-trend-radar-wrap .tb-summary-copy strong { font:700 24px/1 'Fira Sans Condensed',sans-serif; color:#111827; }
      #tb-trend-radar-wrap .tb-summary-copy b { font-size:13px; color:#111827; }
      #tb-trend-radar-wrap .tb-summary-copy span { font-size:11px; color:#64748b; line-height:1.35; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='trend'] { border-color:#fdba74; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='trend'] .tb-summary-icon { background:#fff7ed; color:#c2410c; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='signal'] { border-color:#93c5fd; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='signal'] .tb-summary-icon { background:#eff6ff; color:#1d4ed8; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='recommendation'] { border-color:#86efac; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='recommendation'] .tb-summary-icon { background:#ecfdf5; color:#166534; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='competitor'] { border-color:#c4b5fd; }
      #tb-trend-radar-wrap .tb-summary-pill[data-tone='competitor'] .tb-summary-icon { background:#f5f3ff; color:#6d28d9; }
      #tb-trend-radar-wrap .tb-trend-body { margin-top:14px; padding:4px 2px 2px; }
      #tb-trend-radar-wrap .tb-collapse-btn { display:inline-flex; align-items:center; gap:8px; padding:10px 12px; border-radius:999px; border:1px solid #f04a0a; background:#fff; color:#f04a0a; font-size:13px; font-weight:700; cursor:pointer; }
      #tb-trend-radar-wrap .tb-chevron { transition:transform .2s ease; }
      #tb-trend-radar-wrap[data-open='0'] .tb-chevron { transform:rotate(-90deg); }
      #tb-trend-radar-wrap[data-open='0'] .tb-trend-body { display:none; }
      #tb-trend-radar-wrap .tb-tab-row { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
      #tb-trend-radar-wrap .tb-tab-btn { display:flex; align-items:flex-start; gap:10px; min-height:74px; min-width:190px; padding:12px 14px; border-radius:18px; border:1px solid #e2e8f0; background:#fff; cursor:pointer; text-align:left; transition:all .18s ease; }
      #tb-trend-radar-wrap .tb-tab-btn:hover { transform:translateY(-1px); box-shadow:0 8px 20px rgba(15,23,42,.06); }
      #tb-trend-radar-wrap .tb-tab-btn.active { box-shadow:0 10px 24px rgba(15,23,42,.08); }
      #tb-trend-radar-wrap .tb-tab-icon { width:34px; height:34px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; flex:0 0 34px; }
      #tb-trend-radar-wrap .tb-tab-copy { display:flex; flex-direction:column; gap:3px; min-width:0; }
      #tb-trend-radar-wrap .tb-tab-copy b { font-size:14px; color:#111827; }
      #tb-trend-radar-wrap .tb-tab-copy span { font-size:11px; color:#64748b; line-height:1.35; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='trend'] { border-color:#fdba74; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='trend'] .tb-tab-icon { background:#fff7ed; color:#c2410c; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='trend'].active { background:#fff7ed; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='signal'] { border-color:#93c5fd; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='signal'] .tb-tab-icon { background:#eff6ff; color:#1d4ed8; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='signal'].active { background:#eff6ff; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='recommendation'] { border-color:#86efac; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='recommendation'] .tb-tab-icon { background:#ecfdf5; color:#166534; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='recommendation'].active { background:#ecfdf5; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='source'] { border-color:#7dd3fc; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='source'] .tb-tab-icon { background:#ecfeff; color:#0f766e; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='source'].active { background:#ecfeff; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='competitor'] { border-color:#c4b5fd; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='competitor'] .tb-tab-icon { background:#f5f3ff; color:#6d28d9; }
      #tb-trend-radar-wrap .tb-tab-btn[data-tone='competitor'].active { background:#f5f3ff; }
      #tb-trend-radar-wrap .tb-panel-note { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:14px; padding:12px 14px; border:1px dashed #dbe3ef; border-radius:16px; background:#f8fafc; }
      #tb-trend-radar-wrap .tb-panel-note strong { display:block; font-size:14px; color:#111827; }
      #tb-trend-radar-wrap .tb-panel-note span { display:block; margin-top:2px; font-size:12px; color:#64748b; }
      #tb-trend-radar-wrap .tb-panel-chip { padding:7px 10px; border-radius:999px; font-size:12px; font-weight:700; }
      #tb-trend-radar-wrap .tb-panel-chip[data-tone='trend'] { background:#fff7ed; color:#c2410c; }
      #tb-trend-radar-wrap .tb-panel-chip[data-tone='signal'] { background:#eff6ff; color:#1d4ed8; }
      #tb-trend-radar-wrap .tb-panel-chip[data-tone='recommendation'] { background:#ecfdf5; color:#166534; }
      #tb-trend-radar-wrap .tb-panel-chip[data-tone='source'] { background:#ecfeff; color:#0f766e; }
      #tb-trend-radar-wrap .tb-panel-chip[data-tone='competitor'] { background:#f5f3ff; color:#6d28d9; }
      #tb-trend-radar-wrap .tb-card-head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
      #tb-trend-radar-wrap .tb-card-title { font:700 22px/1.18 'Fira Sans Condensed',sans-serif; color:#111827; }
      #tb-trend-radar-wrap .tb-score-badge { padding:6px 9px; border-radius:999px; font-size:12px; font-weight:700; white-space:nowrap; }
      #tb-trend-radar-wrap .tb-score-badge[data-tone='trend'] { background:#fff7ed; color:#c2410c; }
      #tb-trend-radar-wrap .tb-score-badge[data-tone='signal'] { background:#eff6ff; color:#1d4ed8; }
      #tb-trend-radar-wrap .tb-score-badge[data-tone='recommendation'] { background:#ecfdf5; color:#166534; }
      #tb-trend-radar-wrap .tb-score-badge[data-tone='source'] { background:#ecfeff; color:#0f766e; }
      #tb-trend-radar-wrap .tb-score-badge[data-tone='competitor'] { background:#f5f3ff; color:#6d28d9; }
      #tb-trend-radar-wrap .tb-metric-row { margin-top:10px; display:flex; flex-wrap:wrap; gap:6px; }
      #tb-trend-radar-wrap .tb-metric-chip { padding:4px 8px; border-radius:999px; background:#f8fafc; color:#475569; font-size:12px; font-weight:700; border:1px solid #e2e8f0; }
      #tb-trend-radar-wrap .tb-recommendation-label { margin-top:10px; font-size:14px; color:#334155; line-height:1.55; font-weight:700; }
      #tb-trend-radar-wrap .tb-links { margin-top:12px; display:flex; flex-direction:column; gap:8px; }
      #tb-trend-radar-wrap .tb-links a { color:#f04a0a; text-decoration:none; font-size:13px; font-weight:700; line-height:1.4; }
      #tb-trend-radar-wrap .tb-links a:hover { text-decoration:underline; }
      @media (max-width:980px){ #tb-trend-radar-wrap { margin-bottom:16px; } #tb-trend-radar-wrap .tb-tab-btn { min-width:100%; } }
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
    const activePanel = PANEL_META[state.panel] || PANEL_META.trends;

    const tabs = [
      ['trends', PANEL_META.trends],
      ['signals', PANEL_META.signals],
      ['recommendations', PANEL_META.recommendations],
      ['sources', PANEL_META.sources],
      ['competitors', PANEL_META.competitors]
    ];

    const summary = `
      <div class="tb-summary-grid">
        <div class="tb-summary-pill" data-tone="trend">
          <div class="tb-summary-icon">↗</div>
          <div class="tb-summary-copy"><strong>${hotTrends.length}</strong><b>Sıcak Trend</b><span>Genel trend puanı en yüksek başlık sayısı</span></div>
        </div>
        <div class="tb-summary-pill" data-tone="signal">
          <div class="tb-summary-icon">⚡</div>
          <div class="tb-summary-copy"><strong>${earlySignals.filter((item) => item.early_signal_score >= 55).length}</strong><b>Erken Sinyal</b><span>Henüz büyümeden yakalanan fırsat alanları</span></div>
        </div>
        <div class="tb-summary-pill" data-tone="recommendation">
          <div class="tb-summary-icon">✦</div>
          <div class="tb-summary-copy"><strong>${recommendations.length}</strong><b>Önerilen İçerik</b><span>Editöryal önceliği yüksek yazı fikirleri</span></div>
        </div>
        <div class="tb-summary-pill" data-tone="competitor">
          <div class="tb-summary-icon">◎</div>
          <div class="tb-summary-copy"><strong>${rivals.filter((item) => item.count > 0).length}</strong><b>Rakip Hareketi</b><span>Rakip kaynaklarda görünür hareket olan başlıklar</span></div>
        </div>
      </div>
    `;

    const renderTrendCards = (items, variant) => `
      <div class="tb-trend-grid">
        ${items.map((cluster) => `
          <article class="tb-trend-card">
            <div class="tb-card-head">
              <div class="tb-card-title">${esc(cluster.cluster_name)}</div>
              <div class="tb-score-badge" data-tone="${variant === 'signals' ? 'signal' : 'trend'}">${variant === 'signals' ? `Erken ${cluster.early_signal_score}` : `Trend ${cluster.trend_score}`}</div>
            </div>
            <div class="tb-metric-row">
              <span class="tb-metric-chip">Discover ${cluster.discover_potential_score}</span>
              <span class="tb-metric-chip">SEO ${cluster.seo_potential_score}</span>
              <span class="tb-metric-chip">Kaynak ${cluster.source_count}</span>
              <span class="tb-metric-chip">Türkiye ${cluster.turkey_interest_score}</span>
              <span class="tb-metric-chip">Rakip ${cluster.competitor_count}</span>
            </div>
            <div class="tb-recommendation-label">${esc(cluster.recommendation)}</div>
            <div class="tb-trend-muted" style="margin-top:10px">Son görünme: ${esc(cluster.last_seen_at ? fmtDate(cluster.last_seen_at) : 'Bilinmiyor')}</div>
            <div class="tb-links">
              ${cluster.linked_news.slice(0, 2).map((item) => `<a href="${esc(item.url || '#')}" target="_blank" rel="noopener noreferrer">${esc(item.title || cluster.cluster_name)}</a>`).join('') || '<div class="tb-trend-muted">Bu küme için bağlı haber henüz oluşmadı.</div>'}
            </div>
          </article>
        `).join('')}
      </div>`;

    const renderRecommendations = `
      <div class="tb-trend-grid">
        ${recommendations.map((item) => `
          <article class="tb-trend-card">
            <div class="tb-card-head">
              <div class="tb-card-title">${esc(item.title)}</div>
              <div class="tb-score-badge" data-tone="recommendation">Öncelik ${item.priority}</div>
            </div>
            <div class="tb-recommendation-label">${esc(item.recommendation)}</div>
            <div class="tb-trend-muted" style="margin-top:8px;line-height:1.5">${esc(item.reason)}</div>
            <div class="tb-links">
              ${item.examples.map((example) => `<a href="${esc(example.url || '#')}" target="_blank" rel="noopener noreferrer">${esc(example.title || item.title)}</a>`).join('') || '<div class="tb-trend-muted">Bu öneri için örnek haber henüz yok.</div>'}
            </div>
          </article>
        `).join('')}
      </div>`;

    const renderSources = `
      <div style="display:grid;gap:10px">
        ${sources.map((source) => `
          <article class="tb-trend-card" style="padding:12px 14px">
            <div class="tb-card-head">
              <div class="tb-card-title" style="font-size:20px">${esc(source.source)}</div>
              <div class="tb-score-badge" data-tone="source">Discover ${source.avgDiscover}</div>
            </div>
            <div class="tb-metric-row">
              <span class="tb-metric-chip">Küme ${source.count}</span>
              <span class="tb-metric-chip">Trend ${source.avgTrend}</span>
              <span class="tb-metric-chip">SEO ${source.avgSeo}</span>
              <span class="tb-metric-chip">Yüksek Discover %${source.highDiscoverRatio}</span>
            </div>
            <div class="tb-trend-muted" style="margin-top:8px">Son görünme: ${esc(source.lastPublished ? fmtDate(source.lastPublished) : 'Bilinmiyor')}</div>
          </article>
        `).join('')}
      </div>`;

    const renderCompetitors = `
      <div style="display:grid;gap:10px">
        ${rivals.map((item) => `
          <article class="tb-trend-card" style="padding:12px 14px">
            <div class="tb-card-head">
              <div class="tb-card-title" style="font-size:20px">${esc(item.source)}</div>
              <div class="tb-score-badge" data-tone="competitor">${item.count} eşleşme</div>
            </div>
            <div class="tb-trend-muted" style="margin-top:8px">Ortalama Discover: ${item.avgDiscover}</div>
            ${item.latestTitle ? `<div class="tb-links"><a href="${esc(item.latestUrl || '#')}" target="_blank" rel="noopener noreferrer">${esc(item.latestTitle)}</a></div>` : `<div class="tb-trend-muted" style="margin-top:10px">Henüz görünür içerik yok.</div>`}
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
        <div style="display:flex;flex-direction:column;gap:12px;min-width:280px;flex:1 1 520px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="font:700 28px/1 'Fira Sans Condensed',sans-serif;color:#111827">Trend ve Karar Katmanı</div>
            <div style="padding:7px 10px;border-radius:999px;background:#fff;color:#c2410c;font-size:12px;font-weight:700;border:1px solid #fdba74">Backend trend verisi aktif</div>
          </div>
          <div style="font-size:14px;color:#475569;line-height:1.55">Bu alan, hangi başlığın hızlı haber, hangi başlığın erken fırsat, hangi başlığın rakip takibi için önemli olduğunu tek yerden göstermesi için hazırlandı.</div>
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
        <div class="tb-tab-row">
          ${tabs.map(([key, meta]) => `<button type="button" data-trend-tab="${esc(key)}" data-tone="${esc(meta.tone)}" class="tb-tab-btn ${state.panel === key ? 'active' : ''}"><div class="tb-tab-icon">${esc(meta.icon)}</div><div class="tb-tab-copy"><b>${esc(meta.label)}</b><span>${esc(meta.desc)}</span></div></button>`).join('')}
        </div>
        <div class="tb-panel-note">
          <div><strong>${esc(activePanel.title)}</strong><span>${esc(activePanel.desc)}</span></div>
          <div class="tb-panel-chip" data-tone="${esc(activePanel.tone)}">${esc(activePanel.chip)}</div>
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
