(() => {
  const PREF_OPEN_KEY = 'tb_trend_radar_open';
  const PREF_TAB_KEY = 'tb_trend_radar_tab';

  const state = {
    items: [],
    panel: localStorage.getItem(PREF_TAB_KEY) || 'trends',
    ready: false,
    isOpen: localStorage.getItem(PREF_OPEN_KEY) === '1'
  };

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
    'GSMArena'
  ];

  const BRAND_PATTERNS = [
    'Apple', 'iPhone', 'iPad', 'Mac', 'Samsung', 'Galaxy', 'Google', 'Gemini', 'Android',
    'OpenAI', 'ChatGPT', 'Microsoft', 'Windows', 'Copilot', 'Huawei', 'Xiaomi', 'Redmi',
    'POCO', 'Sony', 'PlayStation', 'Steam', 'Nintendo', 'Tesla', 'Nvidia', 'AMD', 'Intel',
    'Qualcomm', 'Snapdragon', 'MediaTek', 'One UI', 'iOS', 'WhatsApp', 'Meta'
  ];

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

  function hoursAgo(value) {
    const t = new Date(value).getTime();
    if (!Number.isFinite(t)) return 9999;
    return Math.max(0, (Date.now() - t) / 3600000);
  }

  function score(item, key) {
    const n = Number(item?.[key]);
    return Number.isFinite(n) ? n : 0;
  }

  function getTitle(item) {
    return String(item?.title || '').trim();
  }

  function getSource(item) {
    return String(item?.source_name || 'Kaynak yok').trim();
  }

  function getUrl(item) {
    return String(item?.url || item?.canonical_url || '').trim();
  }

  function getPublishedAt(item) {
    return item?.published_at || item?.created_at || item?.updated_at || null;
  }

  function normalizeTopic(title) {
    const raw = String(title || '');
    const brandHit = BRAND_PATTERNS.find((brand) => new RegExp(`\\b${brand.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(raw));
    if (brandHit) {
      const rest = raw
        .replace(new RegExp(`.*?\\b${brandHit.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i'), brandHit)
        .split(/[:|,-]/)[0]
        .replace(/\b(launch|launched|announced|revealed|introduces|update|rollout|beta|test|price|pricing|fiyat|indirim|kampanya|duyurdu|tanıttı|sızıntı|leak|rumor|report)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      return (rest || brandHit).slice(0, 80);
    }

    return raw
      .toLowerCase()
      .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
      .replace(/\b(the|and|for|with|from|that|this|will|have|has|about|daha|için|ile|bir|ve|ile|son|new|yeni|güncelleme|update|launch|announced|duyurdu|tanıttı)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 5)
      .join(' ')
      .slice(0, 80) || 'Diğer teknoloji başlıkları';
  }

  function classifyRecommendation(cluster) {
    const t = cluster.cluster_name.toLowerCase();
    if (/(fiyat|indirim|kampanya|price|deal|sale|coupon|sepette)/.test(t)) return 'Satın alma içeriği';
    if (/(vs|karşılaştır|compare)/.test(t)) return 'Karşılaştırma';
    if (/(beta|update|güncelle|rollout|patch|one ui|ios|android)/.test(t)) return 'Hızlı haber';
    if (/(sızıntı|leak|rumor|report|iddia)/.test(t)) return 'Hızlı haber + takip';
    if (/(nasıl|how to|rehber|guide|ipuçları|tips)/.test(t)) return 'Rehber';
    return cluster.avg_discover >= 72 ? 'Discover odaklı hızlı haber' : 'Detay haber';
  }

  function clusterItems(items) {
    const map = new Map();
    items.forEach((item) => {
      const key = normalizeTopic(getTitle(item));
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          cluster_name: key,
          items: [],
          sources: new Set(),
          competitors: new Set(),
          turkeySignals: 0,
          earliest: null,
          latest: null,
          avg_discover: 0,
          avg_total: 0,
          avg_traffic: 0,
          trend_score: 0,
          early_signal_score: 0,
          recommendation: '',
          rival_count: 0
        });
      }
      const cluster = map.get(key);
      cluster.items.push(item);
      const source = getSource(item);
      cluster.sources.add(source);
      if (COMPETITOR_SOURCES.includes(source)) cluster.competitors.add(source);
      if (/(Türkiye|Turkish|TR|Hepsiburada|Trendyol|MediaMarkt|Vodafone|Turkcell|Türk Telekom|BİM|A101|Migros)/i.test(getTitle(item) + ' ' + source)) {
        cluster.turkeySignals += 1;
      }
      const published = getPublishedAt(item);
      if (published) {
        const p = new Date(published).getTime();
        if (!cluster.earliest || p < cluster.earliest) cluster.earliest = p;
        if (!cluster.latest || p > cluster.latest) cluster.latest = p;
      }
    });

    return [...map.values()].map((cluster) => {
      const count = cluster.items.length;
      cluster.avg_discover = Math.round(cluster.items.reduce((a, item) => a + score(item, 'discover_score'), 0) / Math.max(1, count));
      cluster.avg_total = Math.round(cluster.items.reduce((a, item) => a + score(item, 'total_score'), 0) / Math.max(1, count));
      cluster.avg_traffic = Math.round(cluster.items.reduce((a, item) => a + score(item, 'traffic_score'), 0) / Math.max(1, count));
      cluster.rival_count = cluster.competitors.size;
      const freshnessBoost = cluster.latest ? Math.max(0, 26 - hoursAgo(cluster.latest)) : 0;
      const diversityBoost = Math.min(20, cluster.sources.size * 4);
      const turkeyBoost = Math.min(12, cluster.turkeySignals * 3);
      const discoverBoost = Math.round(cluster.avg_discover * 0.35);
      const trafficBoost = Math.round(cluster.avg_traffic * 0.20);
      cluster.trend_score = Math.max(0, Math.min(100, freshnessBoost + diversityBoost + turkeyBoost + discoverBoost + trafficBoost));
      cluster.early_signal_score = Math.max(0, Math.min(100,
        (cluster.sources.size <= 2 ? 35 : 10) +
        (cluster.latest ? Math.max(0, 24 - hoursAgo(cluster.latest)) : 0) +
        Math.round(cluster.avg_discover * 0.25)
      ));
      cluster.recommendation = classifyRecommendation(cluster);
      return cluster;
    }).sort((a, b) => b.trend_score - a.trend_score);
  }

  function sourcePerformance(items) {
    const map = new Map();
    items.forEach((item) => {
      const source = getSource(item);
      if (!map.has(source)) {
        map.set(source, { source, count: 0, avgDiscover: 0, avgTraffic: 0, avgTotal: 0, lastPublished: null, highDiscover: 0 });
      }
      const row = map.get(source);
      row.count += 1;
      row.avgDiscover += score(item, 'discover_score');
      row.avgTraffic += score(item, 'traffic_score');
      row.avgTotal += score(item, 'total_score');
      if (score(item, 'discover_score') >= 70) row.highDiscover += 1;
      const p = getPublishedAt(item);
      if (p) {
        const ts = new Date(p).getTime();
        if (!row.lastPublished || ts > row.lastPublished) row.lastPublished = ts;
      }
    });
    return [...map.values()].map((row) => ({
      ...row,
      avgDiscover: Math.round(row.avgDiscover / Math.max(1, row.count)),
      avgTraffic: Math.round(row.avgTraffic / Math.max(1, row.count)),
      avgTotal: Math.round(row.avgTotal / Math.max(1, row.count)),
      highDiscoverRatio: Math.round((row.highDiscover / Math.max(1, row.count)) * 100)
    })).sort((a, b) => b.avgDiscover - a.avgDiscover);
  }

  function competitorOverview(items) {
    return COMPETITOR_SOURCES.map((source) => {
      const sourceItems = items.filter((item) => getSource(item) === source);
      const lastItem = sourceItems.sort((a, b) => new Date(getPublishedAt(b) || 0) - new Date(getPublishedAt(a) || 0))[0] || null;
      return {
        source,
        count: sourceItems.length,
        avgDiscover: Math.round(sourceItems.reduce((a, item) => a + score(item, 'discover_score'), 0) / Math.max(1, sourceItems.length)),
        latestTitle: lastItem ? getTitle(lastItem) : '',
        latestPublishedAt: lastItem ? getPublishedAt(lastItem) : null,
        latestUrl: lastItem ? getUrl(lastItem) : ''
      };
    }).sort((a, b) => b.count - a.count);
  }

  function recommendationCards(clusters) {
    return clusters
      .filter((cluster) => cluster.trend_score >= 45 || cluster.avg_discover >= 70)
      .slice(0, 12)
      .map((cluster) => ({
        title: cluster.cluster_name,
        priority: Math.round((cluster.trend_score * 0.45) + (cluster.avg_discover * 0.35) + (cluster.avg_traffic * 0.20)),
        recommendation: cluster.recommendation,
        reason: [
          cluster.avg_discover >= 70 ? 'Discover sinyali güçlü' : 'Discover sinyali orta seviyede',
          cluster.sources.size >= 3 ? `${cluster.sources.size} farklı kaynakta görünür` : 'Henüz sınırlı kaynakta görünüyor',
          cluster.turkeySignals > 0 ? 'Türkiye ilgisi yakalandı' : 'Türkiye ilgisi henüz zayıf'
        ].join(' • '),
        examples: cluster.items.slice(0, 2)
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  async function fetchRecommendations() {
    const res = await fetch('/api/recommendations?sort=published_at', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return Array.isArray(data?.items) ? data.items : [];
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

    const clusters = clusterItems(state.items);
    const hotTrends = clusters.slice(0, 8);
    const earlySignals = [...clusters].sort((a, b) => b.early_signal_score - a.early_signal_score).slice(0, 8);
    const recommendations = recommendationCards(clusters);
    const sources = sourcePerformance(state.items).slice(0, 10);
    const rivals = competitorOverview(state.items).slice(0, 10);

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
              <span>Discover ${cluster.avg_discover}</span>
              <span>Trafik ${cluster.avg_traffic}</span>
              <span>Kaynak ${cluster.sources.size}</span>
              <span>TR ${cluster.turkeySignals}</span>
              <span>Rakip ${cluster.rival_count}</span>
            </div>
            <div style="margin-top:10px;font-size:14px;color:#334155;line-height:1.55">${esc(cluster.recommendation)}</div>
            <div class="tb-trend-muted" style="margin-top:10px">Son görünme: ${esc(cluster.latest ? fmtDate(cluster.latest) : 'Bilinmiyor')}</div>
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
              ${cluster.items.slice(0, 2).map((item) => `<a href="${esc(getUrl(item) || '#')}" target="_blank" rel="noopener noreferrer" style="font-size:13px;color:#f04a0a;text-decoration:none;font-weight:700">${esc(getTitle(item))}</a>`).join('')}
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
              ${item.examples.map((example) => `<a href="${esc(getUrl(example) || '#')}" target="_blank" rel="noopener noreferrer" style="font-size:13px;color:#f04a0a;text-decoration:none;font-weight:700">${esc(getTitle(example))}</a>`).join('')}
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
              <span>İçerik ${source.count}</span>
              <span>Trafik ${source.avgTraffic}</span>
              <span>Genel ${source.avgTotal}</span>
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
              <div style="padding:6px 8px;border-radius:999px;background:${item.count > 0 ? '#fff7ed' : '#f8fafc'};color:${item.count > 0 ? '#7c3aed' : '#64748b'};font-size:12px;font-weight:700">${item.count} içerik</div>
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
            <div style="padding:7px 10px;border-radius:999px;background:#fff;color:#c2410c;font-size:12px;font-weight:700;border:1px solid #fdba74">İçerik üretim paneli kapalı</div>
          </div>
          <div style="font-size:14px;color:#475569;line-height:1.55">Mevcut haber radarını bozmadan, konu kümeleri ve editoryal karar sinyalleri üstünden çalışan daha kompakt v2 görünümü.</div>
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
      state.items = await fetchRecommendations();
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
