(() => {
  const state = { sources: [], query: '', status: 'all', editingId: '', busyId: '' };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 60000);
    const fetchOptions = { cache: 'no-store', credentials: 'same-origin', ...options, signal: controller.signal };
    delete fetchOptions.timeoutMs;
    try {
      const response = await fetch(url, fetchOptions);
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!response.ok || data.error) throw new Error(data.error || text || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('İstek zaman aşımına uğradı.');
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function setLoading(button, loading, text = 'İşleniyor…') {
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = loading;
    button.textContent = loading ? text : button.dataset.originalText;
  }

  function sourceTypeLabel(value) {
    return ({ news: 'Haber', official: 'Resmî', deals: 'Fırsat', competitor: 'Rakip', owned: 'Teknoblog' })[value] || value || 'Haber';
  }

  function marketLabel(value) {
    return ({ global: 'Global', local: 'Türkiye', mixed: 'Karma' })[value] || value || 'Global';
  }

  function ensureUi() {
    if (!$('tb-source-management-style')) {
      const style = document.createElement('style');
      style.id = 'tb-source-management-style';
      style.textContent = `
        .tb-sm-toolbar{display:flex;align-items:end;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:10px 0 14px;padding:12px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc}
        .tb-sm-filter{display:flex;align-items:end;gap:8px;flex-wrap:wrap;flex:1}.tb-sm-filter label{margin:0;min-width:190px;flex:1}.tb-sm-filter input,.tb-sm-filter select{margin-top:5px;background:#fff}
        .tb-sm-summary{display:flex;gap:6px;flex-wrap:wrap}.tb-sm-pill{padding:7px 9px;border:1px solid #dbe3ef;border-radius:999px;background:#fff;color:#475569;font-size:11px;font-weight:900}
        .tb-sm-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px;border:1px solid #dbe3ef;border-radius:16px;background:#fff;box-shadow:0 3px 12px rgba(15,23,42,.04)}
        .tb-sm-card.is-passive{background:#f8fafc;opacity:.75}.tb-sm-card.is-editing{border-color:#f04a0a;box-shadow:0 0 0 3px rgba(240,74,10,.08)}
        .tb-sm-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tb-sm-rank{display:inline-grid;place-items:center;min-width:36px;height:28px;padding:0 8px;border-radius:999px;background:#fff1eb;color:#d63d06;font-size:12px;font-weight:900}
        .tb-sm-name{font-size:15px;font-weight:900;color:#111827}.tb-sm-url{display:block;margin-top:6px;color:#64748b;font-size:11px;word-break:break-all;text-decoration:none}.tb-sm-url:hover{color:#f04a0a}
        .tb-sm-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.tb-sm-meta span{padding:5px 7px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:800}.tb-sm-meta .active{background:#dcfce7;color:#166534}.tb-sm-meta .passive{background:#fee2e2;color:#991b1b}
        .tb-sm-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;max-width:390px}.tb-sm-btn{border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;padding:7px 9px;font-size:11px;font-weight:900;cursor:pointer}.tb-sm-btn:hover{border-color:#f04a0a;color:#f04a0a}.tb-sm-btn.danger{border-color:#fecaca;color:#b91c1c}.tb-sm-btn.primary{border-color:#f04a0a;background:#f04a0a;color:#fff}.tb-sm-btn:disabled{opacity:.55;cursor:wait}
        .tb-sm-edit{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding-top:12px;border-top:1px solid #e2e8f0}.tb-sm-edit label{margin:0}.tb-sm-edit .wide{grid-column:span 2}.tb-sm-edit .full{grid-column:1/-1}.tb-sm-edit-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center;grid-column:1/-1}
        @media(max-width:820px){.tb-sm-card{grid-template-columns:1fr}.tb-sm-actions{justify-content:flex-start;max-width:none}.tb-sm-edit{grid-template-columns:1fr 1fr}.tb-sm-edit .wide{grid-column:1/-1}}
        @media(max-width:560px){.tb-sm-edit{grid-template-columns:1fr}.tb-sm-edit .wide,.tb-sm-edit .full{grid-column:1}.tb-sm-filter label{min-width:100%}.tb-sm-card{padding:12px}.tb-sm-btn{padding:8px 9px}}
      `;
      document.head.appendChild(style);
    }
    const list = $('sources-list');
    if (!list || $('tb-source-management-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'tb-source-management-toolbar';
    toolbar.className = 'tb-sm-toolbar';
    toolbar.innerHTML = `
      <div class="tb-sm-filter">
        <label>Kaynak ara<input id="tb-sm-search" type="search" placeholder="Ad, site veya RSS adresi"></label>
        <label style="flex:0 1 180px">Durum<select id="tb-sm-status"><option value="all">Tüm kaynaklar</option><option value="active">Yalnız aktif</option><option value="passive">Yalnız pasif</option></select></label>
      </div>
      <div class="tb-sm-summary" id="tb-sm-summary"></div>
    `;
    list.before(toolbar);
  }

  function visibleSources() {
    const query = state.query.toLocaleLowerCase('tr');
    return state.sources.filter((source) => {
      if (state.status === 'active' && source.is_active === false) return false;
      if (state.status === 'passive' && source.is_active !== false) return false;
      if (!query) return true;
      return [source.name, source.site_url, source.rss_url, source.feed_url, source.source_type].join(' ').toLocaleLowerCase('tr').includes(query);
    });
  }

  function editor(source) {
    const feed = source.rss_url || source.feed_url || '';
    const typeOptions = [['news','Haber'],['official','Resmî'],['competitor','Rakip'],['deals','Fırsat'],['owned','Teknoblog']];
    const marketOptions = [['global','Global'],['local','Türkiye odaklı'],['mixed','Karma']];
    return `
      <form class="tb-sm-edit" data-source-editor="${esc(source.id)}">
        <label class="wide">Kaynak adı<input name="name" required value="${esc(source.name || '')}"></label>
        <label>Kaynak türü<select name="source_type">${typeOptions.map(([value,label]) => `<option value="${value}" ${source.source_type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Pazar odağı<select name="market_relevance">${marketOptions.map(([value,label]) => `<option value="${value}" ${source.market_relevance === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label class="wide">RSS / Feed URL<input name="rss_url" type="url" required value="${esc(feed)}"></label>
        <label class="wide">Site URL<input name="site_url" type="url" value="${esc(source.site_url || '')}"></label>
        <label>Önem puanı (0–100)<input name="priority_weight" type="number" min="0" max="100" required value="${clamp(source.priority_weight)}"></label>
        <label>Güven puanı (0–100)<input name="trust_score" type="number" min="0" max="100" required value="${clamp(source.trust_score)}"></label>
        <label class="full" style="display:flex;align-items:center;gap:8px"><input name="is_active" type="checkbox" style="width:auto" ${source.is_active === false ? '' : 'checked'}> Kaynak aktif ve içerik taramasına dahil</label>
        <div class="tb-sm-edit-actions"><button class="tb-sm-btn" type="button" data-source-cancel>Vazgeç</button><button class="tb-sm-btn primary" type="submit">Değişiklikleri kaydet</button></div>
      </form>`;
  }

  function renderSources() {
    ensureUi();
    const list = $('sources-list');
    const status = $('sources-status');
    if (!list) return;
    const items = visibleSources();
    const activeCount = state.sources.filter((source) => source.is_active !== false).length;
    const summary = $('tb-sm-summary');
    if (summary) summary.innerHTML = `<span class="tb-sm-pill">${state.sources.length} toplam</span><span class="tb-sm-pill">${activeCount} aktif</span><span class="tb-sm-pill">${state.sources.length - activeCount} pasif</span>`;
    if (status) status.textContent = items.length === state.sources.length ? 'Kaynaklar önem puanına göre sıralanıyor.' : `${items.length} kaynak filtreye uyuyor.`;
    if (!items.length) {
      list.innerHTML = '<div class="result skip">Bu filtreye uyan kaynak bulunamadı.</div>';
      return;
    }
    list.innerHTML = items.map((source) => {
      const feed = source.rss_url || source.feed_url || '';
      const editing = state.editingId === String(source.id);
      const busy = state.busyId === String(source.id);
      return `
        <article class="tb-sm-card ${source.is_active === false ? 'is-passive' : ''} ${editing ? 'is-editing' : ''}" data-source-card="${esc(source.id)}">
          <div>
            <div class="tb-sm-head"><span class="tb-sm-rank" title="Önem puanı">${clamp(source.priority_weight)}</span><strong class="tb-sm-name">${esc(source.name || 'Adsız kaynak')}</strong></div>
            ${feed ? `<a class="tb-sm-url" href="${esc(feed)}" target="_blank" rel="noopener noreferrer">${esc(feed)}</a>` : ''}
            <div class="tb-sm-meta"><span>${esc(sourceTypeLabel(source.source_type))}</span><span>${esc(marketLabel(source.market_relevance))}</span><span>Güven ${clamp(source.trust_score)}</span><span class="${source.is_active === false ? 'passive' : 'active'}">${source.is_active === false ? 'Pasif' : 'Aktif'}</span></div>
          </div>
          <div class="tb-sm-actions">
            <button class="tb-sm-btn" type="button" data-source-priority="up" data-id="${esc(source.id)}" title="Önemi 5 puan artır" ${busy || clamp(source.priority_weight) >= 100 ? 'disabled' : ''}>↑ Öne al</button>
            <button class="tb-sm-btn" type="button" data-source-priority="down" data-id="${esc(source.id)}" title="Önemi 5 puan azalt" ${busy || clamp(source.priority_weight) <= 0 ? 'disabled' : ''}>↓ Geri al</button>
            <button class="tb-sm-btn" type="button" data-source-toggle data-id="${esc(source.id)}" ${busy ? 'disabled' : ''}>${source.is_active === false ? 'Aktifleştir' : 'Pasifleştir'}</button>
            <button class="tb-sm-btn" type="button" data-source-fetch data-id="${esc(source.id)}" ${busy ? 'disabled' : ''}>↻ Haber çek</button>
            <button class="tb-sm-btn" type="button" data-source-edit data-id="${esc(source.id)}" ${busy ? 'disabled' : ''}>✎ Düzenle</button>
            <button class="tb-sm-btn danger" type="button" data-source-delete data-id="${esc(source.id)}" ${busy ? 'disabled' : ''}>Sil</button>
          </div>
          ${editing ? editor(source) : ''}
        </article>`;
    }).join('');
  }

  async function loadSources(message = '') {
    const status = $('sources-status');
    try {
      if (status) status.textContent = message || 'Kaynaklar yükleniyor…';
      const data = await fetchJson(`/api/sources?t=${Date.now()}`, { timeoutMs: 30000 });
      state.sources = Array.isArray(data.items) ? data.items : [];
      renderSources();
      if (message && status) status.textContent = message;
    } catch (error) {
      if (status) status.textContent = `Kaynaklar yüklenemedi: ${error.message || error}`;
    }
  }

  async function patchSource(id, payload, message) {
    state.busyId = String(id);
    renderSources();
    try {
      await fetchJson('/api/sources', { method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ id, ...payload }), timeoutMs: 30000 });
      state.editingId = '';
      await loadSources(message);
    } finally {
      state.busyId = '';
      renderSources();
    }
  }

  function renderBulkResults(data) {
    const target = $('bulk-results');
    if (!target) return;
    const counts = data.counts || {};
    target.innerHTML = `<div class="summary"><div><b>${Number(counts.added || 0)}</b><span>Eklenen</span></div><div><b>${Number(counts.skipped || 0)}</b><span>Atlanan</span></div><div><b>${Number(counts.failed || 0)}</b><span>Hatalı</span></div></div>${(data.added || []).map((source) => `<div class="result ok"><strong>Eklendi:</strong> ${esc(source.name)}<br><small>${esc(source.rss_url || source.feed_url || '')}</small></div>`).join('')}${(data.skipped || []).map((row) => `<div class="result skip"><strong>Atlandı:</strong> ${esc(row.rss_url)}<br><small>${esc(row.reason || '')}</small></div>`).join('')}${(data.failed || []).map((row) => `<div class="result fail"><strong>Hata:</strong> ${esc(row.rss_url)}<br><small>${esc(row.error || '')}</small></div>`).join('')}`;
  }

  async function submitBulk() {
    const button = $('bulk-submit');
    const status = $('bulk-status');
    const text = $('bulk-rss')?.value || '';
    if (!text.trim()) return void (status.textContent = 'RSS URL listesi boş.');
    try {
      setLoading(button, true, 'Ekleniyor…');
      status.textContent = 'Kaynaklar inceleniyor ve mevcut listeyle karşılaştırılıyor…';
      const data = await fetchJson('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ action: 'bulk_add', rss_urls: text, is_active: true }), timeoutMs: 120000 });
      status.textContent = `Tamamlandı: ${data.counts?.added || 0} eklendi, ${data.counts?.skipped || 0} atlandı, ${data.counts?.failed || 0} hata.`;
      renderBulkResults(data);
      await loadSources();
    } catch (error) { status.textContent = `Toplu ekleme hatası: ${error.message || error}`; }
    finally { setLoading(button, false); }
  }

  async function submitSingle(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $('single-status');
    const button = form.querySelector('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.priority_weight = clamp(payload.priority_weight);
    payload.trust_score = clamp(payload.trust_score);
    payload.is_active = form.is_active.checked;
    try {
      setLoading(button, true, 'Ekleniyor…');
      status.textContent = 'Kaynak ekleniyor…';
      const result = await fetchJson('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
      status.textContent = 'Kaynak eklendi. İlk haberleri çekebilirsiniz.';
      form.reset(); form.priority_weight.value = 50; form.trust_score.value = 70; form.is_active.checked = true;
      await loadSources();
      if (result?.item?.id) await fetchJson('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_source', source_id: result.item.id }), timeoutMs: 90000 }).catch(() => {});
    } catch (error) { status.textContent = `Kaynak eklenemedi: ${error.message || error}`; }
    finally { setLoading(button, false); }
  }

  async function onClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.id;
    const source = state.sources.find((item) => String(item.id) === String(id));
    if (button.matches('[data-source-edit]')) { state.editingId = state.editingId === String(id) ? '' : String(id); renderSources(); return; }
    if (button.matches('[data-source-cancel]')) { state.editingId = ''; renderSources(); return; }
    if (!source) return;
    try {
      if (button.matches('[data-source-priority]')) {
        const delta = button.dataset.sourcePriority === 'up' ? 5 : -5;
        await patchSource(id, { priority_weight: clamp(Number(source.priority_weight) + delta) }, `${source.name} önem sırası güncellendi.`);
      } else if (button.matches('[data-source-toggle]')) {
        await patchSource(id, { is_active: source.is_active === false }, `${source.name} ${source.is_active === false ? 'aktifleştirildi' : 'pasifleştirildi'}.`);
      } else if (button.matches('[data-source-fetch]')) {
        state.busyId = String(id); renderSources();
        const result = await fetchJson('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_source', source_id: id }), timeoutMs: 90000 });
        await loadSources(`${source.name}: ${Number(result.fetched || 0)} haber okundu, ${Number(result.ingested || 0)} yeni kayıt eklendi.`);
      } else if (button.matches('[data-source-delete]')) {
        const confirmed = window.confirm(`${source.name} kalıcı olarak silinsin mi? Bu kaynağa bağlı ham haber kayıtları da kaldırılacak. Yalnızca geçici olarak durdurmak istiyorsanız “Pasifleştir” seçeneğini kullanın.`);
        if (!confirmed) return;
        state.busyId = String(id); renderSources();
        await fetchJson('/api/sources', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_id: id }), timeoutMs: 60000 });
        await loadSources(`${source.name} ve ilişkili kayıtları silindi.`);
      }
    } catch (error) {
      const status = $('sources-status');
      if (status) status.textContent = `İşlem tamamlanamadı: ${error.message || error}`;
    } finally {
      state.busyId = '';
      renderSources();
    }
  }

  async function onEditorSubmit(event) {
    const form = event.target.closest('[data-source-editor]');
    if (!form) return;
    event.preventDefault();
    const id = form.dataset.sourceEditor;
    const values = Object.fromEntries(new FormData(form).entries());
    values.priority_weight = clamp(values.priority_weight);
    values.trust_score = clamp(values.trust_score);
    values.is_active = form.is_active.checked;
    try { await patchSource(id, values, `${values.name} güncellendi.`); }
    catch (error) { const status = $('sources-status'); if (status) status.textContent = `Kaynak güncellenemedi: ${error.message || error}`; }
  }

  function bind() {
    $('bulk-submit')?.addEventListener('click', submitBulk);
    $('bulk-clear')?.addEventListener('click', () => { $('bulk-rss').value = ''; $('bulk-results').innerHTML = ''; $('bulk-status').textContent = ''; });
    $('single-form')?.addEventListener('submit', submitSingle);
    $('sources-list')?.addEventListener('click', onClick);
    $('sources-list')?.addEventListener('submit', onEditorSubmit);
    $('tb-sm-search')?.addEventListener('input', (event) => { state.query = event.target.value || ''; renderSources(); });
    $('tb-sm-status')?.addEventListener('change', (event) => { state.status = event.target.value || 'all'; renderSources(); });
  }

  function boot() { ensureUi(); bind(); loadSources(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
