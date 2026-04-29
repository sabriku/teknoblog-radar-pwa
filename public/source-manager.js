(() => {
  const state = {
    editingId: '',
    sources: []
  };

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function statusEl() {
    return document.getElementById('tb-status');
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 60000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const fetchOptions = { cache: 'no-store', credentials: 'same-origin', ...options, signal: controller.signal };
      delete fetchOptions.timeoutMs;
      const res = await fetch(url, fetchOptions);
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(data?.error || text || `HTTP ${res.status}`);
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('İstek zaman aşımına uğradı.');
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function ensureSourceSelect() {
    const bar = document.getElementById('tb-source-tabs');
    if (!bar || document.getElementById('tb-source-select-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'tb-source-select-wrap';
    wrap.style.marginBottom = '16px';
    wrap.innerHTML = `
      <label for="tb-source-select" style="display:block;margin-bottom:8px;font-size:13px;font-weight:700;color:#475569">Kaynak filtresi</label>
      <select id="tb-source-select" style="width:100%;padding:11px 12px;border:1px solid #d1d5db;border-radius:12px;background:#fff;font-size:14px"></select>
    `;
    bar.parentNode.insertBefore(wrap, bar);
    bar.style.display = 'none';
  }

  function syncSourceDropdown() {
    ensureSourceSelect();
    const select = document.getElementById('tb-source-select');
    if (!select) return;
    const buttons = [...document.querySelectorAll('#tb-source-tabs [data-source-tab]')];
    const current = select.value || 'all';
    select.innerHTML = buttons.map((btn) => {
      const value = btn.getAttribute('data-source-tab') || 'all';
      return `<option value="${esc(value)}">${esc(btn.textContent || 'Tümü')}</option>`;
    }).join('');
    select.value = [...select.options].some((o) => o.value === current) ? current : 'all';
  }

  async function loadSources() {
    const data = await fetchJson(`/api/sources?t=${Date.now()}`, { timeoutMs: 30000 });
    state.sources = Array.isArray(data?.items) ? data.items : [];
    renderSourceCards();
  }

  function currentFormValues(source) {
    return {
      name: String(source?.name || ''),
      rss_url: String(source?.rss_url || source?.feed_url || ''),
      site_url: String(source?.site_url || ''),
      market_relevance: String(source?.market_relevance || 'global'),
      priority_weight: Number(source?.priority_weight || 50),
      trust_score: Number(source?.trust_score || 70),
      is_active: source?.is_active !== false
    };
  }

  function ensureFormExtras() {
    const form = document.getElementById('tb-source-form');
    if (!form || document.getElementById('tb-source-extra-fields')) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    const extras = document.createElement('div');
    extras.id = 'tb-source-extra-fields';
    extras.style.display = 'contents';
    extras.innerHTML = `
      <input name="priority_weight" type="number" min="0" max="100" value="50" placeholder="Öncelik puanı" style="padding:11px 12px;border:1px solid #d1d5db;border-radius:10px">
      <input name="trust_score" type="number" min="0" max="100" value="70" placeholder="Güven puanı" style="padding:11px 12px;border:1px solid #d1d5db;border-radius:10px">
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;color:#334155"><input name="is_active" type="checkbox" checked> Kaynak aktif</label>
      <button id="tb-source-cancel" type="button" style="display:none;padding:11px 14px;border:1px solid #f04a0a;border-radius:10px;background:#fff;color:#f04a0a;font-weight:700;cursor:pointer">Düzenlemeyi İptal Et</button>
    `;
    submitBtn?.before(extras);
  }

  function fillForm(source) {
    const form = document.getElementById('tb-source-form');
    const status = document.getElementById('tb-source-form-status');
    if (!form) return;
    ensureFormExtras();
    const vals = currentFormValues(source);
    form.name.value = vals.name;
    form.rss_url.value = vals.rss_url;
    form.site_url.value = vals.site_url;
    form.market_relevance.value = vals.market_relevance;
    form.priority_weight.value = vals.priority_weight;
    form.trust_score.value = vals.trust_score;
    form.is_active.checked = vals.is_active;
    state.editingId = String(source.id || '');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Kaynağı Güncelle';
    const cancelBtn = document.getElementById('tb-source-cancel');
    if (cancelBtn) cancelBtn.style.display = 'block';
    if (status) status.textContent = `Düzenleme modu: ${source.name || 'Kaynak'}`;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function resetFormMode() {
    const form = document.getElementById('tb-source-form');
    const status = document.getElementById('tb-source-form-status');
    if (!form) return;
    state.editingId = '';
    form.reset();
    ensureFormExtras();
    form.priority_weight.value = 50;
    form.trust_score.value = 70;
    form.is_active.checked = true;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Kaynağı Ekle';
    const cancelBtn = document.getElementById('tb-source-cancel');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (status) status.textContent = '';
  }

  function renderSourceCards() {
    const wrap = document.getElementById('tb-sources-list');
    if (!wrap) return;
    if (!state.sources.length) {
      wrap.innerHTML = '<div style="font-size:14px;color:#64748b">Henüz kaynak görünmüyor.</div>';
      return;
    }
    wrap.innerHTML = state.sources.map((s) => {
      const feed = s.rss_url || s.feed_url || '';
      return `
        <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px">
          <div style="font-weight:700;color:#111827">${esc(s.name || 'İsimsiz kaynak')}</div>
          <div style="margin-top:6px;font-size:12px;color:#64748b;word-break:break-all">${esc(feed)}</div>
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;font-size:11px;color:#64748b;font-weight:700">
            <span>Öncelik: ${esc(s.priority_weight ?? 50)}</span>
            <span>Güven: ${esc(s.trust_score ?? 70)}</span>
            <span>${s.is_active === false ? 'Pasif' : 'Aktif'}</span>
          </div>
          <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">
            <button type="button" data-source-edit="${esc(s.id)}" style="padding:8px 10px;border:1px solid #f04a0a;border-radius:10px;background:#fff;color:#f04a0a;font-size:12px;font-weight:700;cursor:pointer">Düzenle</button>
            <button type="button" data-source-fetch="${esc(s.id)}" style="padding:8px 10px;border:1px solid #0f766e;border-radius:10px;background:#fff;color:#0f766e;font-size:12px;font-weight:700;cursor:pointer">Haber Çek</button>
            <button type="button" data-source-delete="${esc(s.id)}" style="padding:8px 10px;border:1px solid #b91c1c;border-radius:10px;background:#fff;color:#b91c1c;font-size:12px;font-weight:700;cursor:pointer">Sil</button>
          </div>
        </div>
      `;
    }).join('');
  }

  async function handleEdit(sourceId) {
    const source = state.sources.find((item) => String(item.id) === String(sourceId));
    if (source) fillForm(source);
  }

  async function handleDelete(sourceId) {
    const source = state.sources.find((item) => String(item.id) === String(sourceId));
    if (!window.confirm(`${source?.name || 'Bu kaynak'} silinsin mi? İlişkili ham kayıtlar da kaldırılacak.`)) return;
    const status = statusEl();
    if (status) status.textContent = `${source?.name || 'Kaynak'} siliniyor...`;
    await fetchJson('/api/sources', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId }),
      timeoutMs: 60000
    });
    await loadSources();
    if (status) status.textContent = `${source?.name || 'Kaynak'} silindi.`;
  }

  async function handleFetch(sourceId) {
    const source = state.sources.find((item) => String(item.id) === String(sourceId));
    const status = statusEl();
    if (status) status.textContent = `${source?.name || 'Kaynak'} için haberler çekiliyor...`;
    const result = await fetchJson('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fetch_source', source_id: sourceId }),
      timeoutMs: 90000
    });
    if (status) status.textContent = `${source?.name || 'Kaynak'} güncellendi. Alınan: ${Number(result.ingested || 0)}, güncellenen: ${Number(result.updated || 0)}.`;
  }

  async function handleFormSubmit(event) {
    const form = event.target.closest('#tb-source-form');
    if (!form || !state.editingId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = document.getElementById('tb-source-form-status');
    const payload = {
      id: state.editingId,
      name: String(form.name.value || '').trim(),
      rss_url: String(form.rss_url.value || '').trim(),
      site_url: String(form.site_url.value || '').trim(),
      market_relevance: String(form.market_relevance.value || 'global').trim(),
      priority_weight: Number(form.priority_weight.value || 50),
      trust_score: Number(form.trust_score.value || 70),
      is_active: Boolean(form.is_active.checked)
    };
    if (status) status.textContent = 'Kaynak güncelleniyor...';
    await fetchJson('/api/sources', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 30000
    });
    resetFormMode();
    await loadSources();
    if (status) status.textContent = 'Kaynak güncellendi.';
  }

  function bindEvents() {
    document.addEventListener('change', (event) => {
      const select = event.target.closest('#tb-source-select');
      if (!select) return;
      const value = select.value || 'all';
      const tabBtn = document.querySelector(`#tb-source-tabs [data-source-tab="${CSS.escape(value)}"]`);
      tabBtn?.click();
    });

    document.addEventListener('click', (event) => {
      const editBtn = event.target.closest('[data-source-edit]');
      if (editBtn) return void handleEdit(editBtn.getAttribute('data-source-edit'));
      const deleteBtn = event.target.closest('[data-source-delete]');
      if (deleteBtn) return void handleDelete(deleteBtn.getAttribute('data-source-delete'));
      const fetchBtn = event.target.closest('[data-source-fetch]');
      if (fetchBtn) return void handleFetch(fetchBtn.getAttribute('data-source-fetch'));
      const cancelBtn = event.target.closest('#tb-source-cancel');
      if (cancelBtn) return void resetFormMode();
    });

    document.addEventListener('submit', handleFormSubmit, true);
  }

  function watchSourceTabs() {
    const bar = document.getElementById('tb-source-tabs');
    if (!bar) return;
    const observer = new MutationObserver(() => syncSourceDropdown());
    observer.observe(bar, { childList: true, subtree: true });
    syncSourceDropdown();
  }

  async function boot() {
    ensureFormExtras();
    bindEvents();
    watchSourceTabs();
    await loadSources();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
