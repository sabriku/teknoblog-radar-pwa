(() => {
  const FILTER_KEY = 'tb_phase2_filter';
  const COMPETITOR_SOURCES = [
    'Webrazzi', 'ShiftDelete.Net', 'DonanımHaber', 'Android Authority', 'The Verge',
    '9to5Google', 'MacRumors', 'Windows Central', 'SamMobile', 'GSMArena'
  ];
  const BRAND_PATTERNS = [
    'Apple', 'iPhone', 'iPad', 'Mac', 'Samsung', 'Galaxy', 'Google', 'Gemini', 'Android',
    'OpenAI', 'ChatGPT', 'Microsoft', 'Windows', 'Copilot', 'Huawei', 'Xiaomi', 'Redmi',
    'POCO', 'Sony', 'PlayStation', 'Steam', 'Nintendo', 'Tesla', 'Nvidia', 'AMD', 'Intel',
    'Qualcomm', 'Snapdragon', 'MediaTek', 'One UI', 'iOS', 'WhatsApp', 'Meta'
  ];

  const state = {
    metaByUrl: new Map(),
    filter: localStorage.getItem(FILTER_KEY) || 'all',
    ready: false
  };

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeUrl(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw, window.location.origin);
      u.hash = '';
      return u.toString();
    } catch {
      return raw;
    }
  }

  function getTitle(item) {
    return String(item?.title || '').trim();
  }

  function getSource(item) {
    return String(item?.source_name || '').trim();
  }

  function getUrl(item) {
    return normalizeUrl(String(item?.url || item?.canonical_url || '').trim());
  }

  function getPublishedAt(item) {
    return item?.published_at || item?.created_at || item?.updated_at || null;
  }

  function score(item, key) {
    const n = Number(item?.[key]);
    return Number.isFinite(n) ? n : 0;
  }

  function hoursAgo(value) {
    const t = new Date(value).getTime();
    if (!Number.isFinite(t)) return 9999;
    return Math.max(0, (Date.now() - t) / 3600000);
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

  function classifyRecommendation(clusterName, avgDiscover) {
    const t = String(clusterName || '').toLowerCase();
    if (/(fiyat|indirim|kampanya|price|deal|sale|coupon|sepette)/.test(t)) return 'Satın alma içeriği';
    if (/(vs|karşılaştır|compare)/.test(t)) return 'Karşılaştırma';
    if (/(beta|update|güncelle|rollout|patch|one ui|ios|android)/.test(t)) return 'Hızlı haber';
    if (/(sızıntı|leak|rumor|report|iddia)/.test(t)) return 'Hızlı haber + takip';
    if (/(nasıl|how to|rehber|guide|ipuçları|tips)/.test(t)) return 'Rehber';
    return avgDiscover >= 72 ? 'Discover odaklı hızlı haber' : 'Detay haber';
  }

  function buildMeta(items) {
    const clusters = new Map();
    items.forEach((item) => {
      const key = normalizeTopic(getTitle(item));
      if (!key) return;
      if (!clusters.has(key)) {
        clusters.set(key, {
          clusterName: key,
          items: [],
          sources: new Set(),
          competitors: new Set(),
          turkeySignals: 0,
          latest: null,
          avgDiscover: 0,
          avgTraffic: 0,
          trendScore: 0,
          earlySignalScore: 0,
          recommendation: ''
        });
      }
      const cluster = clusters.get(key);
      cluster.items.push(item);
      const source = getSource(item);
      cluster.sources.add(source);
      if (COMPETITOR_SOURCES.includes(source)) cluster.competitors.add(source);
      if (/(Türkiye|Turkish|TR|Hepsiburada|Trendyol|MediaMarkt|Vodafone|Turkcell|Türk Telekom|BİM|A101|Migros)/i.test(getTitle(item) + ' ' + source)) {
        cluster.turkeySignals += 1;
      }
      const published = getPublishedAt(item);
      if (published) {
        const ts = new Date(published).getTime();
        if (!cluster.latest || ts > cluster.latest) cluster.latest = ts;
      }
    });

    const metaByUrl = new Map();
    [...clusters.values()].forEach((cluster) => {
      const count = cluster.items.length;
      cluster.avgDiscover = Math.round(cluster.items.reduce((a, item) => a + score(item, 'discover_score'), 0) / Math.max(1, count));
      cluster.avgTraffic = Math.round(cluster.items.reduce((a, item) => a + score(item, 'traffic_score'), 0) / Math.max(1, count));
      const freshnessBoost = cluster.latest ? Math.max(0, 26 - hoursAgo(cluster.latest)) : 0;
      const diversityBoost = Math.min(20, cluster.sources.size * 4);
      const turkeyBoost = Math.min(12, cluster.turkeySignals * 3);
      const discoverBoost = Math.round(cluster.avgDiscover * 0.35);
      const trafficBoost = Math.round(cluster.avgTraffic * 0.2);
      cluster.trendScore = Math.max(0, Math.min(100, freshnessBoost + diversityBoost + turkeyBoost + discoverBoost + trafficBoost));
      cluster.earlySignalScore = Math.max(0, Math.min(100,
        (cluster.sources.size <= 2 ? 35 : 10) +
        (cluster.latest ? Math.max(0, 24 - hoursAgo(cluster.latest)) : 0) +
        Math.round(cluster.avgDiscover * 0.25)
      ));
      cluster.recommendation = classifyRecommendation(cluster.clusterName, cluster.avgDiscover);

      cluster.items.forEach((item) => {
        const url = getUrl(item);
        if (!url) return;
        metaByUrl.set(url, {
          clusterName: cluster.clusterName,
          trendScore: cluster.trendScore,
          earlySignalScore: cluster.earlySignalScore,
          recommendation: cluster.recommendation,
          rivalCount: cluster.competitors.size,
          competitorState: cluster.competitors.size > 0 ? 'Rakipte var' : 'Rakip boşluğu',
          turkeySignals: cluster.turkeySignals,
          sourceCount: cluster.sources.size,
          isEarly: cluster.earlySignalScore >= 55,
          isCompetitorGap: cluster.competitors.size === 0,
          isTrendLinked: true
        });
      });
    });

    return metaByUrl;
  }

  async function loadMeta() {
    const res = await fetch('/api/recommendations?sort=published_at', { cache: 'no-store', credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    state.metaByUrl = buildMeta(items);
    state.ready = true;
  }

  function ensureStyle() {
    if (document.getElementById('tb-phase2-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-phase2-style';
    style.textContent = `
      .tb-phase2-bar { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 14px; }
      .tb-phase2-filter { padding:8px 11px; border-radius:999px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:12px; font-weight:700; cursor:pointer; }
      .tb-phase2-filter.active { border-color:#f04a0a; background:#fff7ed; color:#c2410c; }
      .tb-phase2-badges { display:flex; flex-wrap:wrap; gap:6px; margin-top:2px; }
      .tb-phase2-badge { display:inline-flex; align-items:center; gap:5px; padding:4px 8px; border-radius:999px; font-size:11px; font-weight:700; border:1px solid transparent; }
      .tb-phase2-cluster { margin-top:8px; font-size:13px; color:#334155; font-weight:700; }
      .tb-phase2-cluster span { color:#64748b; font-weight:600; }
      .tb-phase2-note { margin-top:8px; font-size:12px; color:#64748b; line-height:1.5; }
      .tb-phase2-badge[data-tone='trend'] { background:#fff7ed; color:#c2410c; border-color:#fdba74; }
      .tb-phase2-badge[data-tone='signal'] { background:#eff6ff; color:#1d4ed8; border-color:#93c5fd; }
      .tb-phase2-badge[data-tone='recommendation'] { background:#ecfdf5; color:#166534; border-color:#86efac; }
      .tb-phase2-badge[data-tone='competitor'] { background:#f5f3ff; color:#6d28d9; border-color:#c4b5fd; }
    `;
    document.head.appendChild(style);
  }

  function filterMatch(meta) {
    if (!meta) return state.filter === 'all';
    if (state.filter === 'all') return true;
    if (state.filter === 'trend') return meta.isTrendLinked;
    if (state.filter === 'signal') return meta.isEarly;
    if (state.filter === 'gap') return meta.isCompetitorGap;
    return true;
  }

  function renderToolbar() {
    const grid = document.getElementById('tb-grid');
    if (!grid) return;
    let bar = document.getElementById('tb-phase2-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'tb-phase2-bar';
      bar.className = 'tb-phase2-bar';
      grid.parentElement.insertBefore(bar, grid);
    }
    const filters = [
      ['all', 'Tüm kartlar'],
      ['trend', 'Yalnız trend bağlı'],
      ['signal', 'Erken sinyal'],
      ['gap', 'Rakip boşluğu']
    ];
    bar.innerHTML = filters.map(([key, label]) => `<button type="button" data-phase2-filter="${esc(key)}" class="tb-phase2-filter ${state.filter === key ? 'active' : ''}">${esc(label)}</button>`).join('');
  }

  function annotateCards() {
    ensureStyle();
    renderToolbar();
    const inputs = [...document.querySelectorAll('input[data-select-url]')];
    inputs.forEach((input) => {
      const url = normalizeUrl(input.getAttribute('data-select-url') || '');
      const article = input.closest('article');
      if (!article) return;
      const meta = state.metaByUrl.get(url);
      article.style.display = filterMatch(meta) ? '' : 'none';
      if (!meta) return;

      let host = article.querySelector('[data-phase2-host]');
      if (!host) {
        const title = article.querySelector('h3');
        host = document.createElement('div');
        host.setAttribute('data-phase2-host', '1');
        if (title && title.parentElement) {
          title.insertAdjacentElement('afterend', host);
        } else {
          article.appendChild(host);
        }
      }

      host.innerHTML = `
        <div class="tb-phase2-badges">
          <span class="tb-phase2-badge" data-tone="trend">Trend ${esc(meta.trendScore)}</span>
          <span class="tb-phase2-badge" data-tone="signal">${meta.isEarly ? 'Erken sinyal güçlü' : 'Erken sinyal orta'}</span>
          <span class="tb-phase2-badge" data-tone="recommendation">${esc(meta.recommendation)}</span>
          <span class="tb-phase2-badge" data-tone="competitor">${esc(meta.competitorState)}</span>
        </div>
        <div class="tb-phase2-cluster"><span>Trend kümesi:</span> ${esc(meta.clusterName)}</div>
        <div class="tb-phase2-note">Kaynak ${esc(meta.sourceCount)} • Türkiye sinyali ${esc(meta.turkeySignals)} • Rakip görünürlüğü ${esc(meta.rivalCount)}</div>
      `;
    });
  }

  async function boot() {
    try {
      await loadMeta();
      annotateCards();
      const root = document.getElementById('app') || document.body;
      const observer = new MutationObserver(() => {
        if (!state.ready) return;
        annotateCards();
      });
      observer.observe(root, { childList: true, subtree: true });
      setTimeout(annotateCards, 1200);
      setTimeout(annotateCards, 2500);
    } catch {
      /* ignore phase 2 enhancer failures to avoid breaking the app */
    }
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-phase2-filter]');
    if (!btn) return;
    state.filter = btn.getAttribute('data-phase2-filter') || 'all';
    localStorage.setItem(FILTER_KEY, state.filter);
    annotateCards();
  });

  document.addEventListener('DOMContentLoaded', () => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (document.getElementById('tb-grid')) {
        clearInterval(timer);
        boot();
      }
      if (tries > 50) clearInterval(timer);
    }, 300);
  });
})();
