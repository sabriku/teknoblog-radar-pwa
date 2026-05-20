(() => {
  const FILTER_KEY = 'tb_phase2_filter';
  const COMPETITOR_SOURCES = [
    'Webrazzi', 'ShiftDelete.Net', 'DonanımHaber', 'Android Authority', 'The Verge',
    '9to5Google', 'MacRumors', 'Windows Central', 'SamMobile', 'GSMArena',
    'LOG.com.tr', 'TechRadar', 'TechCrunch', 'Digital Trends', 'Ars Technica', 'Google Blog'
  ];

  const state = {
    metaByUrl: new Map(),
    metaByTitleKey: new Map(),
    filter: localStorage.getItem(FILTER_KEY) || 'all',
    ready: false,
    observer: null,
    scheduled: null,
    lastAnnotatedSignature: ''
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

  function normalizeTitleKey(value = '') {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+-\s+[^-]+$/g, '')
      .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
      .replace(/\b(the|and|for|with|from|that|this|will|have|has|about|daha|için|ile|bir|ve|son|new|yeni|güncelleme|update|launch|announced|duyurdu|tanıttı)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 8)
      .join(' ');
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
    return map[String(value || '').trim()] || String(value || 'Detay haber');
  }

  function competitorState(cluster = {}) {
    return Number(cluster.competitor_count || 0) > 0 ? 'Rakipte var' : 'Rakip boşluğu';
  }

  function buildClusterMeta(cluster = {}) {
    return {
      clusterName: String(cluster.cluster_name || '').trim(),
      trendScore: Number(cluster.trend_score || 0),
      earlySignalScore: Number(cluster.early_signal_score || 0),
      recommendation: recommendationLabel(cluster.recommendation_type),
      rivalCount: Number(cluster.competitor_count || 0),
      competitorState: competitorState(cluster),
      turkeySignals: Number(cluster.turkey_interest_score || 0),
      sourceCount: Number(cluster.source_count || 0),
      isEarly: Number(cluster.early_signal_score || 0) >= 55,
      isCompetitorGap: Number(cluster.competitor_count || 0) === 0,
      isTrendLinked: true
    };
  }

  function buildMetaMaps(clusters = []) {
    const byUrl = new Map();
    const byTitle = new Map();

    clusters.forEach((cluster) => {
      const meta = buildClusterMeta(cluster);
      const titleKey = normalizeTitleKey(cluster.cluster_name || '');
      if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, meta);

      const linked = Array.isArray(cluster.linked_news) ? cluster.linked_news : [];
      linked.forEach((news) => {
        const url = normalizeUrl(news?.candidate_url || news?.url || '');
        const newsTitleKey = normalizeTitleKey(news?.candidate_title || news?.title || '');
        if (url) byUrl.set(url, meta);
        if (newsTitleKey && !byTitle.has(newsTitleKey)) byTitle.set(newsTitleKey, meta);
      });
    });

    return { byUrl, byTitle };
  }

  async function loadMeta() {
    const res = await fetch('/api/trend-overview?limit=80', { cache: 'no-store', credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    const { byUrl, byTitle } = buildMetaMaps(items);
    state.metaByUrl = byUrl;
    state.metaByTitleKey = byTitle;
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
    if (!grid || !grid.parentElement) return;
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
    const html = filters.map(([key, label]) => `<button type="button" data-phase2-filter="${esc(key)}" class="tb-phase2-filter ${state.filter === key ? 'active' : ''}">${esc(label)}</button>`).join('');
    if (bar.innerHTML !== html) bar.innerHTML = html;
  }

  function currentSignature(inputs) {
    return inputs
      .map((input) => normalizeUrl(input.getAttribute('data-select-url') || ''))
      .join('|') + `::${state.filter}`;
  }

  function findMetaForArticle(article, inputUrl) {
    if (inputUrl && state.metaByUrl.has(inputUrl)) return state.metaByUrl.get(inputUrl);

    const titleNode = article.querySelector('h3');
    const titleText = titleNode ? titleNode.textContent || '' : '';
    const titleKey = normalizeTitleKey(titleText);
    if (titleKey && state.metaByTitleKey.has(titleKey)) return state.metaByTitleKey.get(titleKey);

    const link = article.querySelector('a[href]');
    const href = normalizeUrl(link?.getAttribute('href') || '');
    if (href && state.metaByUrl.has(href)) return state.metaByUrl.get(href);

    return null;
  }

  function annotateCards(force = false) {
    ensureStyle();
    renderToolbar();
    const inputs = [...document.querySelectorAll('input[data-select-url]')];
    const signature = currentSignature(inputs);
    if (!force && state.lastAnnotatedSignature === signature) return;
    state.lastAnnotatedSignature = signature;

    inputs.forEach((input) => {
      const url = normalizeUrl(input.getAttribute('data-select-url') || '');
      const article = input.closest('article');
      if (!article) return;
      const meta = findMetaForArticle(article, url);
      article.style.display = filterMatch(meta) ? '' : 'none';
      if (!meta) return;

      const markup = `
        <div class="tb-phase2-badges">
          <span class="tb-phase2-badge" data-tone="trend">Trend ${esc(meta.trendScore)}</span>
          <span class="tb-phase2-badge" data-tone="signal">${meta.isEarly ? 'Erken sinyal güçlü' : 'Erken sinyal orta'}</span>
          <span class="tb-phase2-badge" data-tone="recommendation">${esc(meta.recommendation)}</span>
          <span class="tb-phase2-badge" data-tone="competitor">${esc(meta.competitorState)}</span>
        </div>
        <div class="tb-phase2-cluster"><span>Trend kümesi:</span> ${esc(meta.clusterName)}</div>
        <div class="tb-phase2-note">Kaynak ${esc(meta.sourceCount)} • Türkiye sinyali ${esc(meta.turkeySignals)} • Rakip görünürlüğü ${esc(meta.rivalCount)}</div>
      `;

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

      if (host.innerHTML !== markup) host.innerHTML = markup;
    });
  }

  function scheduleAnnotate(force = false) {
    if (state.scheduled) cancelAnimationFrame(state.scheduled);
    state.scheduled = requestAnimationFrame(() => {
      state.scheduled = null;
      annotateCards(force);
    });
  }

  function attachObserver() {
    if (state.observer) state.observer.disconnect();
    const grid = document.getElementById('tb-grid');
    if (!grid) return;
    state.observer = new MutationObserver((mutations) => {
      const shouldRun = mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length);
      if (shouldRun) scheduleAnnotate(true);
    });
    state.observer.observe(grid, { childList: true, subtree: true });
  }

  async function boot() {
    try {
      await loadMeta();
      annotateCards(true);
      attachObserver();
      setTimeout(() => scheduleAnnotate(true), 900);
    } catch {
      /* ignore phase 2 enhancer failures to avoid breaking the app */
    }
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-phase2-filter]');
    if (!btn) return;
    state.filter = btn.getAttribute('data-phase2-filter') || 'all';
    localStorage.setItem(FILTER_KEY, state.filter);
    state.lastAnnotatedSignature = '';
    scheduleAnnotate(true);
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
