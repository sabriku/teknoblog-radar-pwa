(() => {
  const STORAGE_KEY = 'tb_google_news_open';
  const REFRESH_MS = 60 * 60 * 1000;
  const MAX_LAYOUT_TRIES = 80;

  const state = {
    open: localStorage.getItem(STORAGE_KEY) === '1',
    items: [],
    loading: false,
    refreshedAt: null,
    error: ''
  };

  let refreshTimer = null;
  let started = false;

  function cleanText(v) {
    return String(v ?? '')
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
      .replace(/[\ufffd\u25a0-\u25ff]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function esc(v) {
    return cleanText(v)
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

  function ageHours(value) {
    const d = new Date(value || 0);
    if (Number.isNaN(d.getTime())) return 9999;
    return Math.max(0, (Date.now() - d.getTime()) / 3600000);
  }

  function fallbackImage(item = {}) {
    const source = encodeURIComponent(cleanText(item.source_name || 'Google News').slice(0, 28));
    return `https://placehold.co/640x360/f8fafc/334155?text=${source}`;
  }

  function guidanceFor(item = {}) {
    const text = `${item.title || ''} ${item.summary || ''} ${item.source_name || ''}`.toLowerCase();
    const hours = ageHours(item.published_at);
    let score = 0;
    const reasons = [];

    if (hours <= 2) { score += 30; reasons.push('çok yeni'); }
    else if (hours <= 6) { score += 24; reasons.push('güncel'); }
    else if (hours <= 12) { score += 16; reasons.push('aynı gün içinde'); }
    else if (hours <= 24) { score += 8; reasons.push('son 24 saat içinde'); }
    else { score -= 18; reasons.push('tazelik zayıf'); }

    if (/yapay\s*zeka|openai|chatgpt|gemini|claude|ai\b|android|iphone|ios|samsung|galaxy|google|apple|windows|nvidia|amd|intel|snapdragon|xiaomi|huawei|whatsapp|youtube|chrome/.test(text)) {
      score += 32;
      reasons.push('Teknoblog ana odağıyla uyumlu');
    }

    if (/güncelleme|update|beta|özellik|feature|sızıntı|leak|iddia|rapor|report|fiyat|indirim|kampanya|yasak|güvenlik|açık|hack|veri/.test(text)) {
      score += 18;
      reasons.push('haberleştirilebilir açı var');
    }

    if (/türkiye|tr\b|tl|turkcell|vodafone|türk telekom|bṫk|btk|rekabet kurumu/.test(text)) {
      score += 16;
      reasons.push('Türkiye ilgisi var');
    }

    if (/maç|macı|maçı|futbol|voleybol|basketbol|hangi kanalda|kupa/.test(text)) {
      score -= 60;
      reasons.push('teknoloji dışı sinyal');
    }

    if (score >= 56) return { label: 'Mutlaka gir', tone: 'hot', score, reason: reasons.slice(0, 3).join(', ') };
    if (score >= 32) return { label: 'Takip et', tone: 'watch', score, reason: reasons.slice(0, 3).join(', ') };
    return { label: 'Düşük öncelik', tone: 'low', score, reason: reasons.slice(0, 3).join(', ') || 'editoryal sinyal zayıf' };
  }

  function sortItems(items = []) {
    return [...items].sort((a, b) => guidanceFor(b).score - guidanceFor(a).score || new Date(b.published_at || 0) - new Date(a.published_at || 0));
  }

  function ensureStyle() {
    if (document.getElementById('tb-google-news-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-google-news-style';
    style.textContent = `
      #tb-google-news-wrap{margin-bottom:18px;border:1px solid #dbe3ef;border-radius:20px;background:#fff;padding:16px;box-shadow:0 8px 24px rgba(9,30,66,.06)}
      #tb-google-news-wrap[data-open='0'] .tb-google-news-body{display:none}
      #tb-google-news-wrap .tb-google-news-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      #tb-google-news-wrap .tb-google-news-toggle{display:flex;align-items:center;gap:10px;cursor:pointer;background:#fff;border:1px solid #dbe3ef;border-radius:999px;padding:10px 14px;font-weight:700;color:#111827}
      #tb-google-news-wrap .tb-google-news-toggle b{font:700 20px/1 'Fira Sans Condensed',sans-serif}
      #tb-google-news-wrap[data-open='0'] .tb-google-chevron{transform:rotate(-90deg)}
      #tb-google-news-wrap .tb-google-chevron{transition:transform .2s ease}
      #tb-google-news-wrap .tb-google-news-refresh{border:1px solid #2563eb;background:#fff;color:#2563eb;padding:9px 12px;border-radius:12px;font-weight:700;cursor:pointer}
      #tb-google-news-wrap .tb-google-news-refresh:disabled{opacity:.7;cursor:wait}
      #tb-google-news-wrap .tb-google-news-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:16px}
      #tb-google-news-wrap article{position:relative;border:1px solid #e5e7eb;border-radius:16px;background:#fff;box-shadow:0 4px 12px rgba(15,23,42,.04);overflow:hidden}
      #tb-google-news-wrap .tb-google-image{width:100%;aspect-ratio:16/9;background:#f1f5f9;object-fit:cover;display:block;border-bottom:1px solid #e5e7eb}
      #tb-google-news-wrap .tb-google-card-inner{padding:12px}
      #tb-google-news-wrap h3{font:700 17px/1.35 'Fira Sans Condensed',sans-serif;color:#111827;margin:0 0 8px;padding-right:34px}
      #tb-google-news-wrap .tb-google-meta{display:flex;flex-wrap:wrap;gap:6px;font-size:11px;color:#64748b;margin-bottom:8px}
      #tb-google-news-wrap .tb-google-summary{font-size:12px;line-height:1.55;color:#475569;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      #tb-google-news-wrap .tb-google-actions{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:10px}
      #tb-google-news-wrap .tb-google-link{font-size:12px;font-weight:700;color:#f04a0a;text-decoration:none}
      #tb-google-news-wrap .tb-google-link:hover{text-decoration:underline}
      #tb-google-news-wrap .tb-google-status{font-size:12px;color:#64748b;margin-top:10px}
      #tb-google-news-wrap .tb-google-status[data-error='1']{color:#b91c1c}
      #tb-google-news-wrap .tb-google-empty{border:1px dashed #cbd5e1;border-radius:14px;color:#64748b;font-size:13px;margin-top:14px;padding:14px;text-align:center}
      #tb-google-news-wrap .tb-guidance{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:800;margin-bottom:8px}
      #tb-google-news-wrap .tb-guidance.hot{background:#fff1eb;color:#c2410c;border:1px solid #fdba74}
      #tb-google-news-wrap .tb-guidance.watch{background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd}
      #tb-google-news-wrap .tb-guidance.low{background:#f8fafc;color:#64748b;border:1px solid #cbd5e1}
      #tb-google-news-wrap .tb-guidance-reason{font-size:11px;line-height:1.45;color:#64748b;margin-bottom:8px}
    `;
    document.head.appendChild(style);
  }

  function findMountTarget() {
    return (
      document.querySelector('#tb-layout main') ||
      document.querySelector('#tb-grid') ||
      document.querySelector('main')
    );
  }

  function statusText() {
    if (state.loading) return 'Google News Bilim ve Teknoloji akışı kontrol ediliyor...';
    if (state.error) return state.error;
    const must = state.items.filter((item) => guidanceFor(item).tone === 'hot').length;
    return `Saatlik kontrol: ${esc(fmtDate(state.refreshedAt) || 'Henüz yüklenmedi')} · Mutlaka girilecek konu: ${must}`;
  }

  function render() {
    ensureStyle();

    const target = findMountTarget();
    if (!target) return false;

    let wrap = document.getElementById('tb-google-news-wrap');
    if (!wrap) {
      wrap = document.createElement('section');
      wrap.id = 'tb-google-news-wrap';
      target.prepend(wrap);
    }

    wrap.setAttribute('data-open', state.open ? '1' : '0');

    const cards = sortItems(state.items).map((item, index) => {
      const image = cleanText(item.image_url || '') || fallbackImage(item);
      const guidance = guidanceFor(item);
      return `
        <article data-guidance="${esc(guidance.tone)}">
          <img class="tb-google-image" src="${esc(image)}" alt="${esc(item.title || 'Google News teknoloji haberi')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(fallbackImage(item))}'">
          <div class="tb-google-card-inner">
            <input type="checkbox" data-select-url="${esc(item.url)}" style="position:absolute;right:12px;top:12px;z-index:2">
            <div class="tb-guidance ${esc(guidance.tone)}">${esc(guidance.label)} · ${esc(guidance.score)}</div>
            <div class="tb-guidance-reason">${esc(guidance.reason)}</div>
            <h3>${esc(item.title)}</h3>
            <div class="tb-google-meta">
              <div>${esc(item.source_name || 'Google News')}</div>
              <div>${esc(fmtDate(item.published_at))}</div>
            </div>
            <div class="tb-google-summary">${esc(item.summary || '')}</div>
            <div class="tb-google-actions">
              <a class="tb-google-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Haberi aç</a>
              <span style="font-size:11px;color:#94a3b8">#${index + 1}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');

    wrap.innerHTML = `
      <div class="tb-google-news-head">
        <button type="button" class="tb-google-news-toggle" aria-expanded="${state.open ? 'true' : 'false'}">
          <span class="tb-google-chevron">▾</span>
          <b>Google News Teknoloji</b>
        </button>
        <button type="button" class="tb-google-news-refresh" ${state.loading ? 'disabled' : ''}>Google News Yenile</button>
      </div>

      <div class="tb-google-news-body">
        <div class="tb-google-status" data-error="${state.error ? '1' : '0'}">
          ${statusText()}
        </div>

        ${cards ? `<div class="tb-google-news-grid">${cards}</div>` : '<div class="tb-google-empty">Henüz gösterilecek Google News teknoloji haberi yok.</div>'}
      </div>
    `;

    wrap.querySelector('.tb-google-news-toggle')?.addEventListener('click', () => {
      state.open = !state.open;
      localStorage.setItem(STORAGE_KEY, state.open ? '1' : '0');
      render();
    });

    wrap.querySelector('.tb-google-news-refresh')?.addEventListener('click', async () => {
      await fetchNews(true);
    });

    return true;
  }

  async function fetchNews(force = false) {
    if (state.loading && !force) return;
    state.loading = true;
    state.error = '';
    render();

    try {
      const url = new URL('/api/trend-overview', window.location.origin);
      url.searchParams.set('google_news', '1');
      url.searchParams.set('limit', '40');
      url.searchParams.set('_', Date.now().toString());

      const res = await fetch(url.toString(), {
        cache: 'no-store',
        headers: {
          accept: 'application/json'
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);
      state.items = Array.isArray(data?.items) ? data.items : [];
      state.refreshedAt = data?.refreshed_at || new Date().toISOString();
    } catch (error) {
      console.error('Google News panel error:', error);
      state.error = `Google News verisi alınamadı: ${error?.message || 'Bilinmeyen hata'}`;
    } finally {
      state.loading = false;
      render();
    }
  }

  function waitForLayoutAndStart() {
    if (started) return;

    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const mounted = render();

      if (mounted) {
        clearInterval(timer);
        started = true;
        await fetchNews();
        if (!refreshTimer) refreshTimer = setInterval(() => fetchNews(), REFRESH_MS);
        return;
      }

      if (tries >= MAX_LAYOUT_TRIES) {
        clearInterval(timer);
        console.warn('Google News panel mount target not found.');
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForLayoutAndStart, { once: true });
  } else {
    waitForLayoutAndStart();
  }
})();