(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok || data.error) throw new Error(data.error || text || `HTTP ${response.status}`);
    return data;
  }

  function setLoading(button, loading, text) {
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = loading;
    button.textContent = loading ? text : button.dataset.originalText;
  }

  function sourceTypeLabel(value) {
    const map = { news: 'Haber', official: 'Resmî', deals: 'Fırsat', competitor: 'Rakip takip' };
    return map[value] || value || 'Haber';
  }

  function marketLabel(value) {
    const map = { global: 'Global', local: 'Türkiye', mixed: 'Karma' };
    return map[value] || value || 'Global';
  }

  async function loadSources() {
    const status = $('sources-status');
    const list = $('sources-list');
    try {
      if (status) status.textContent = 'Kaynaklar yükleniyor...';
      const data = await fetchJson('/api/sources?t=' + Date.now());
      const items = data.items || [];
      if (status) status.textContent = `${items.length} kaynak listeleniyor.`;
      if (list) {
        list.innerHTML = items.map((source) => `
          <article class="source">
            <strong>${esc(source.name || 'Adsız kaynak')}</strong>
            <small>${esc(source.rss_url || source.feed_url || '')}</small>
            <small>${esc(source.site_url || '')}</small>
            <span class="badge">${esc(sourceTypeLabel(source.source_type))}</span>
            <span class="badge">${esc(marketLabel(source.market_relevance))}</span>
            <span class="badge">Öncelik ${Number(source.priority_weight || 0)}</span>
            <span class="badge">Güven ${Number(source.trust_score || 0)}</span>
            <span class="badge">${source.is_active === false ? 'Pasif' : 'Aktif'}</span>
          </article>
        `).join('') || '<div class="result skip">Kaynak bulunamadı.</div>';
      }
    } catch (error) {
      if (status) status.textContent = `Kaynaklar yüklenemedi: ${error.message || error}`;
    }
  }

  function renderBulkResults(data) {
    const target = $('bulk-results');
    if (!target) return;
    const counts = data.counts || {};
    const added = data.added || [];
    const skipped = data.skipped || [];
    const failed = data.failed || [];
    target.innerHTML = `
      <div class="summary">
        <div><b>${Number(counts.added || 0)}</b><span>Eklenen</span></div>
        <div><b>${Number(counts.skipped || 0)}</b><span>Atlanan</span></div>
        <div><b>${Number(counts.failed || 0)}</b><span>Hatalı</span></div>
      </div>
      ${added.map((source) => `<div class="result ok"><strong>Eklendi:</strong> ${esc(source.name)}<br><small>${esc(source.rss_url || source.feed_url || '')}</small><br><small>${esc(sourceTypeLabel(source.source_type))} · ${esc(marketLabel(source.market_relevance))} · Öncelik ${Number(source.priority_weight || 0)} · Güven ${Number(source.trust_score || 0)}</small></div>`).join('')}
      ${skipped.map((row) => `<div class="result skip"><strong>Atlandı:</strong> ${esc(row.rss_url)}<br><small>${esc(row.reason || '')}</small></div>`).join('')}
      ${failed.map((row) => `<div class="result fail"><strong>Hata:</strong> ${esc(row.rss_url)}<br><small>${esc(row.error || '')}</small></div>`).join('')}
    `;
  }

  async function submitBulk() {
    const button = $('bulk-submit');
    const status = $('bulk-status');
    const text = $('bulk-rss')?.value || '';
    if (!text.trim()) {
      if (status) status.textContent = 'RSS URL listesi boş.';
      return;
    }
    try {
      setLoading(button, true, 'Ekleniyor...');
      if (status) status.textContent = 'RSS kaynakları okunuyor, otomatik puanlanıyor ve mevcut listeyle karşılaştırılıyor...';
      const data = await fetchJson('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          action: 'bulk_add',
          rss_urls: text,
          is_active: true
        })
      });
      if (status) status.textContent = `Toplu ekleme tamamlandı. Eklenen: ${data.counts?.added || 0}, atlanan: ${data.counts?.skipped || 0}, hatalı: ${data.counts?.failed || 0}.`;
      renderBulkResults(data);
      await loadSources();
    } catch (error) {
      if (status) status.textContent = `Toplu ekleme hatası: ${error.message || error}`;
    } finally {
      setLoading(button, false);
    }
  }

  async function submitSingle(event) {
    event.preventDefault();
    const form = event.target;
    const status = $('single-status');
    const button = form.querySelector('button[type="submit"]');
    const payload = {
      name: String(form.name.value || '').trim(),
      rss_url: String(form.rss_url.value || '').trim(),
      site_url: String(form.site_url.value || '').trim(),
      market_relevance: String(form.market_relevance.value || 'global'),
      source_type: String(form.source_type.value || 'news'),
      priority_weight: Number(form.priority_weight.value || 50),
      trust_score: Number(form.trust_score.value || 70),
      is_active: Boolean(form.is_active.checked)
    };
    if (!payload.name || !payload.rss_url) {
      if (status) status.textContent = 'Kaynak adı ve RSS URL gerekli.';
      return;
    }
    try {
      setLoading(button, true, 'Ekleniyor...');
      if (status) status.textContent = 'Kaynak ekleniyor...';
      const result = await fetchJson('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload)
      });
      if (result?.item?.id) {
        try {
          await fetchJson('/api/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ action: 'fetch_source', source_id: result.item.id })
          });
        } catch {}
      }
      if (status) status.textContent = 'Kaynak eklendi.';
      form.reset();
      form.is_active.checked = true;
      await loadSources();
    } catch (error) {
      if (status) status.textContent = `Kaynak eklenemedi: ${error.message || error}`;
    } finally {
      setLoading(button, false);
    }
  }

  function bind() {
    $('bulk-submit')?.addEventListener('click', submitBulk);
    $('bulk-clear')?.addEventListener('click', () => { if ($('bulk-rss')) $('bulk-rss').value = ''; if ($('bulk-results')) $('bulk-results').innerHTML = ''; if ($('bulk-status')) $('bulk-status').textContent = ''; });
    $('single-form')?.addEventListener('submit', submitSingle);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bind(); loadSources(); }, { once: true });
  } else {
    bind();
    loadSources();
  }
})();
