(() => {
  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureStyle() {
    if (document.getElementById('tb-source-add-sidebar-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-source-add-sidebar-style';
    style.textContent = `
      #tb-source-add-panel{border:1px solid #dbe3ef;border-radius:18px;background:#fff;padding:14px;box-shadow:0 6px 18px rgba(9,30,66,.06)}
      #tb-source-add-panel h3{margin:0 0 10px;font:700 20px/1 'Fira Sans Condensed',sans-serif;color:#111827}
      #tb-source-form{display:flex;flex-direction:column;gap:8px}
      #tb-source-form input,#tb-source-form select{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #d1d5db;border-radius:10px;background:#fff;font-size:12px;color:#111827}
      #tb-source-form label{display:flex;align-items:center;gap:7px;font-size:12px;color:#334155;font-weight:700}
      #tb-source-form button{padding:9px 11px;border:0;border-radius:10px;background:#f04a0a;color:#fff;font-size:12px;font-weight:900;cursor:pointer}
      #tb-source-form button.secondary{border:1px solid #f04a0a;background:#fff;color:#f04a0a}
      #tb-source-form-status{min-height:16px;font-size:11.5px;color:#64748b;line-height:1.35}
      .tb-source-add-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    `;
    document.head.appendChild(style);
  }

  function findSidebar() {
    return document.querySelector('#tb-layout aside') || document.querySelector('aside');
  }

  function isTodayPanel(el) {
    const t = (el?.textContent || '').replace(/\s+/g, ' ').toLowerCase();
    return /bugün/.test(t) && /teknoblog/.test(t) && /yay/.test(t);
  }

  function findTodayPanel(sidebar) {
    if (!sidebar) return null;
    return [...sidebar.children].find(isTodayPanel) || document.getElementById('tb-today-published-panel');
  }

  function placePanel(panel, sidebar) {
    const today = findTodayPanel(sidebar);
    if (today && today.parentElement === sidebar) {
      if (today.nextSibling !== panel) sidebar.insertBefore(panel, today.nextSibling);
      return;
    }
    if (sidebar.firstChild !== panel) sidebar.insertBefore(panel, sidebar.firstChild);
  }

  function ensurePanel() {
    ensureStyle();
    const sidebar = findSidebar();
    if (!sidebar) return false;
    let panel = document.getElementById('tb-source-add-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'tb-source-add-panel';
      panel.innerHTML = `
        <h3>Kaynak ekle</h3>
        <form id="tb-source-form" autocomplete="off">
          <input name="name" placeholder="Kaynak adı" required>
          <input name="rss_url" placeholder="RSS / Feed URL" required>
          <input name="site_url" placeholder="Site URL, opsiyonel">
          <select name="market_relevance">
            <option value="global">Global</option>
            <option value="local">Türkiye odaklı</option>
            <option value="mixed">Karma</option>
          </select>
          <div class="tb-source-add-row">
            <input name="priority_weight" type="number" min="0" max="100" value="50" placeholder="Öncelik">
            <input name="trust_score" type="number" min="0" max="100" value="70" placeholder="Güven">
          </div>
          <label><input name="is_active" type="checkbox" checked> Kaynak aktif</label>
          <button type="submit">Kaynağı Ekle</button>
          <button id="tb-source-cancel" type="button" class="secondary" style="display:none">Düzenlemeyi İptal Et</button>
          <div id="tb-source-form-status"></div>
        </form>
      `;
    }
    placePanel(panel, sidebar);
    return true;
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 45000);
    try {
      const config = { cache: 'no-store', credentials: 'same-origin', ...options, signal: controller.signal };
      delete config.timeoutMs;
      const res = await fetch(url, config);
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok || data?.error) throw new Error(data?.error || text || `HTTP ${res.status}`);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function handleSubmit(event) {
    const form = event.target.closest('#tb-source-form');
    if (!form) return;
    const cancel = document.getElementById('tb-source-cancel');
    if (cancel && cancel.style.display !== 'none') return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const status = document.getElementById('tb-source-form-status');
    const submit = form.querySelector('button[type="submit"]');
    const payload = {
      name: String(form.name.value || '').trim(),
      rss_url: String(form.rss_url.value || '').trim(),
      site_url: String(form.site_url.value || '').trim(),
      market_relevance: String(form.market_relevance.value || 'global'),
      priority_weight: Number(form.priority_weight.value || 50),
      trust_score: Number(form.trust_score.value || 70),
      is_active: Boolean(form.is_active.checked)
    };

    if (!payload.name || !payload.rss_url) {
      if (status) status.textContent = 'Kaynak adı ve RSS URL gerekli.';
      return;
    }

    try {
      if (submit) submit.disabled = true;
      if (status) status.textContent = 'Kaynak ekleniyor...';
      const result = await fetchJson('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 45000
      });
      if (status) status.textContent = 'Kaynak eklendi. Haberler çekiliyor...';
      const sourceId = result?.item?.id;
      if (sourceId) {
        try {
          await fetchJson('/api/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_source', source_id: sourceId }),
            timeoutMs: 90000
          });
        } catch {}
      }
      if (status) status.textContent = 'Kaynak eklendi. Sayfa yenileniyor...';
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      if (status) status.textContent = `Kaynak eklenemedi: ${error?.message || String(error)}`;
      if (submit) submit.disabled = false;
    }
  }

  function start() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      ensurePanel();
      if (tries > 80) clearInterval(timer);
    }, 250);
    document.addEventListener('submit', handleSubmit, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();