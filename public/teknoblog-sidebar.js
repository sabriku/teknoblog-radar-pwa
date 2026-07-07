(() => {
  let loadedOnce = false;

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul'
    }).format(date);
  }

  function dayKey(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  function todayKey() { return dayKey(new Date()); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uniqueTodayItems(items = []) {
    const today = todayKey();
    const seen = new Set();
    return items
      .filter((item) => dayKey(item?.published_at || item?.created_at || item?.updated_at) === today)
      .filter((item) => {
        const key = String(item?.url || item?.link || item?.title || '').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.published_at || b.created_at || 0).getTime() - new Date(a.published_at || a.created_at || 0).getTime());
  }

  function buildPanel() {
    const section = document.createElement('section');
    section.id = 'tb-latest-teknoblog';
    section.style.border = '1px solid #fed7aa';
    section.style.borderRadius = '18px';
    section.style.background = 'linear-gradient(180deg,#fff7ed,#fff)';
    section.style.padding = '16px';
    section.style.boxShadow = '0 6px 18px rgba(9,30,66,.06)';
    section.style.order = '-999';

    section.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px">
        <div>
          <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif;color:#111827">📰 Teknoblog.com son haberler</div>
          <div style="margin-top:5px;font-size:12px;color:#64748b;font-weight:700;line-height:1.45">Bugün Teknoblog.com'da yayımlanan tüm içerikler</div>
        </div>
        <a href="https://www.teknoblog.com" target="_blank" rel="noopener noreferrer" style="flex:0 0 auto;font-size:12px;font-weight:800;color:#f04a0a;text-decoration:none;border:1px solid #f04a0a;border-radius:999px;padding:7px 9px;background:#fff">Siteye git</a>
      </div>
      <div id="tb-latest-teknoblog-count" style="margin-bottom:12px;font-size:13px;color:#64748b;font-weight:700">Bugünkü haber sayısı hesaplanıyor...</div>
      <div id="tb-latest-teknoblog-list" style="display:flex;flex-direction:column;gap:10px;font-size:14px;color:#334155;max-height:760px;overflow:auto;padding-right:4px">
        <div>Yükleniyor...</div>
      </div>
    `;

    return section;
  }

  async function fetchLatestPage(page = 1) {
    const params = new URLSearchParams({ t: String(Date.now()), limit: '60', page: String(page), today: '1', all_today: '1' });
    const response = await fetch(`/api/teknoblog-latest?${params.toString()}`, { cache: 'no-store', headers: { accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return Array.isArray(data?.items) ? data.items : [];
  }

  async function fetchAllTodayItems() {
    const all = [];
    for (let page = 1; page <= 6; page += 1) {
      const items = await fetchLatestPage(page);
      if (!items.length) break;
      all.push(...items);
      const todayItems = uniqueTodayItems(all);
      const oldest = items[items.length - 1];
      if (oldest && dayKey(oldest.published_at || oldest.created_at || oldest.updated_at) !== todayKey()) break;
      if (items.length < 60) break;
      if (todayItems.length >= 200) break;
    }
    return uniqueTodayItems(all);
  }

  async function loadLatest() {
    const list = document.getElementById('tb-latest-teknoblog-list');
    const count = document.getElementById('tb-latest-teknoblog-count');
    if (!list) return;
    try {
      const items = await fetchAllTodayItems();
      if (count) count.textContent = `Bugün yayımlanan haber sayısı: ${items.length}`;
      if (!items.length) {
        list.innerHTML = '<div style="font-size:13px;color:#64748b">Bugün yayımlanmış haber bulunamadı.</div>';
        return;
      }
      list.innerHTML = items.map((item, index) => {
        const dateText = formatDate(item.published_at || item.created_at || item.updated_at);
        return `
          <a href="${escapeHtml(item.url || item.link || '#')}" target="_blank" rel="noopener noreferrer" style="display:block;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;text-decoration:none;color:#111827;background:#fff">
            <div style="display:flex;gap:8px;align-items:flex-start">
              <span style="flex:0 0 auto;display:inline-grid;place-items:center;width:22px;height:22px;border-radius:999px;background:#fff1eb;color:#f04a0a;font-size:11px;font-weight:900">${index + 1}</span>
              <div style="min-width:0">
                <div style="font-weight:800;line-height:1.35;overflow-wrap:anywhere">${escapeHtml(item.title)}</div>
                <div style="margin-top:6px;font-size:12px;color:#64748b">${escapeHtml(dateText || 'Tarih yok')}</div>
              </div>
            </div>
          </a>
        `;
      }).join('');
    } catch (error) {
      if (count) count.textContent = 'Bugünkü haber sayısı alınamadı.';
      list.innerHTML = `<div style="font-size:13px;color:#b91c1c">Hata: ${escapeHtml(String(error.message || error))}</div>`;
    }
  }

  function findNewsAside() {
    const newsPanel = document.querySelector('[data-spa-panel="news"]');
    return newsPanel?.querySelector('#tb-layout aside') || document.querySelector('#tb-layout aside');
  }

  function insertPanel() {
    const aside = findNewsAside();
    if (!aside) return false;
    let panel = document.getElementById('tb-latest-teknoblog');
    if (!panel) {
      panel = buildPanel();
      loadedOnce = false;
    }
    if (aside.firstElementChild !== panel) aside.prepend(panel);
    if (!loadedOnce) {
      loadedOnce = true;
      loadLatest();
    }
    return true;
  }

  function start() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (insertPanel() || tries > 80) clearInterval(timer);
    }, 250);

    const observer = new MutationObserver(() => window.requestAnimationFrame(insertPanel));
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', () => setTimeout(insertPanel, 50));
    window.addEventListener('load', insertPanel);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
