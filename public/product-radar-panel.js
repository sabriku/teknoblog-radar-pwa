(() => {
  const state = { items: [], brands: [], hours: '72', type: 'all', media: 'all', brand: 'all', loading: false, error: '', refreshedAt: '', coverage: null };
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const authToken = () => localStorage.getItem('tb_radar_cron_token') || localStorage.getItem('tb_cron_token') || '';
  const fmt = (value) => value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(value)) : '—';
  const age = (value) => { const hours = Math.max(0, (Date.now() - new Date(value).getTime()) / 3600000); return hours < 1 ? `${Math.max(1, Math.round(hours * 60))} dk` : hours < 24 ? `${Math.round(hours)} sa` : `${Math.round(hours / 24)} gün`; };

  function queuePayload(item) {
    const references = (item.social_assets || []).map((asset) => ({ url: asset.url, source_name: `${item.brand} · ${asset.platform === 'youtube' ? 'YouTube' : asset.platform === 'instagram' ? 'Instagram' : 'X'}`, title: asset.title || 'Resmî ürün paylaşımı' }));
    return { candidate_id: `product:${item.id}`, title: item.title, url: item.url, source_name: item.source_name, published_at: item.published_at, image_url: item.image_url || item.social_assets?.find((asset) => asset.thumbnail_url)?.thumbnail_url || '', total_score: item.launch_score, discover_probability: item.launch_score, news_probability: Math.min(100, item.launch_score + 4), status: 'approved', notes: `${item.brand} ${item.launch_type === 'service' ? 'hizmet' : 'ürün'} duyurusu`, references };
  }

  function mediaCard(asset) {
    const label = asset.platform === 'youtube' ? 'YouTube' : asset.platform === 'instagram' ? 'Instagram' : 'X';
    const icon = asset.platform === 'youtube' ? '▶' : asset.platform === 'instagram' ? '◎' : '𝕏';
    const image = asset.thumbnail_url ? `<img src="${esc(asset.thumbnail_url)}" alt="" loading="lazy" onerror="this.remove()">` : '';
    return `<a class="tb-pr-media tb-pr-${esc(asset.platform)}" href="${esc(asset.url)}" target="_blank" rel="noopener">${image}<span><b>${icon} ${label}</b><small>${esc(asset.title || `${asset.author_name || ''} resmî paylaşımı`)}</small></span></a>`;
  }

  function card(item) {
    const payload = esc(JSON.stringify(queuePayload(item)));
    const cover = item.image_url || item.social_assets?.find((asset) => asset.thumbnail_url)?.thumbnail_url || '';
    const reasons = Array.isArray(item.reasons) ? item.reasons : [];
    return `<article class="tb-pr-card" data-product-card="${esc(item.id)}">
      ${cover ? `<img class="tb-pr-cover" src="${esc(cover)}" alt="" loading="lazy" onerror="this.remove()">` : '<div class="tb-pr-cover tb-pr-placeholder">◈</div>'}
      <div class="tb-pr-body"><div class="tb-pr-meta"><span class="tb-pr-brand">${esc(item.brand || 'Marka')}</span><span>${item.launch_type === 'service' ? 'Hizmet' : 'Ürün'}</span><span>${age(item.published_at)} önce</span><strong>${Number(item.launch_score || 0)} puan</strong></div>
      <h3>${esc(item.title)}</h3><p>${esc(item.summary || '').slice(0, 280)}</p>
      <div class="tb-pr-reasons">${reasons.map((reason) => `<span>✓ ${esc(reason)}</span>`).join('')}</div>
      ${(item.social_assets || []).length ? `<div class="tb-pr-media-grid">${item.social_assets.map(mediaCard).join('')}</div>` : '<div class="tb-pr-no-media">Bu duyuruda doğrulanmış resmî sosyal video bağlantısı bulunamadı.</div>'}
      <div class="tb-pr-actions"><a href="${esc(item.url)}" target="_blank" rel="noopener">Resmî duyuruyu aç</a><button data-pr-queue='${payload}'>＋ Yazılacaklara</button><button data-pr-slack='${payload}'>Slack’e gönder</button></div></div>
    </article>`;
  }

  function options(values, selected, first) { return `${first ? `<option value="all">${esc(first)}</option>` : ''}${values.map(([value,label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('')}`; }

  function render() {
    const root = document.getElementById('tb-product-radar-root'); if (!root) return false;
    root.innerHTML = `<style>
      #tb-product-radar-root{padding:0;overflow:hidden}.tb-pr-hero{padding:20px;background:linear-gradient(135deg,#172554,#1e3a8a 58%,#0f766e);color:#fff}.tb-pr-hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}.tb-pr-hero h2{font:800 30px/1 'Fira Sans Condensed',sans-serif;margin:0 0 8px}.tb-pr-hero p{margin:0;max-width:760px;color:#dbeafe;font-size:13px;line-height:1.55}.tb-pr-refresh{border:1px solid rgba(255,255,255,.55);background:rgba(255,255,255,.12);color:#fff;border-radius:11px;padding:9px 12px;font-weight:900;cursor:pointer}.tb-pr-controls{display:grid;grid-template-columns:repeat(4,minmax(135px,1fr));gap:9px;margin-top:16px}.tb-pr-control{display:grid;gap:4px}.tb-pr-control label{font-size:10px;font-weight:900;color:#bfdbfe;text-transform:uppercase}.tb-pr-control select{width:100%;border:1px solid rgba(255,255,255,.35);background:#fff;color:#172554;border-radius:10px;padding:9px;font-weight:800}.tb-pr-status{padding:10px 16px;border-bottom:1px solid #e2e8f0;background:#eff6ff;color:#475569;font-size:12px}.tb-pr-status.error{background:#fef2f2;color:#991b1b}.tb-pr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;padding:16px}.tb-pr-card{overflow:hidden;border:1px solid #dbe3ef;border-radius:18px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.06)}.tb-pr-cover{display:block;width:100%;aspect-ratio:16/8.5;object-fit:cover;background:#e2e8f0}.tb-pr-placeholder{display:grid;place-items:center;font-size:45px;color:#60a5fa;background:linear-gradient(135deg,#eff6ff,#ecfeff)}.tb-pr-body{padding:14px}.tb-pr-meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.tb-pr-meta span,.tb-pr-meta strong{padding:4px 7px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:900}.tb-pr-meta .tb-pr-brand{background:#dbeafe;color:#1d4ed8}.tb-pr-meta strong{background:#dcfce7;color:#166534}.tb-pr-card h3{font-size:19px;line-height:1.25;margin:10px 0 7px}.tb-pr-card p{font-size:12px;color:#64748b;line-height:1.5;margin:0}.tb-pr-reasons{display:flex;gap:5px;flex-wrap:wrap;margin:10px 0}.tb-pr-reasons span{font-size:10px;color:#166534;background:#f0fdf4;border-radius:7px;padding:4px 6px}.tb-pr-media-grid{display:grid;gap:7px;margin:10px 0}.tb-pr-media{display:grid;grid-template-columns:74px 1fr;align-items:center;min-height:52px;border:1px solid #e2e8f0;border-radius:11px;overflow:hidden;text-decoration:none;color:#334155;background:#f8fafc}.tb-pr-media>img{width:74px;height:52px;object-fit:cover}.tb-pr-media>span{display:grid;gap:2px;padding:7px}.tb-pr-media b{font-size:11px}.tb-pr-media small{font-size:10px;color:#64748b;line-height:1.3}.tb-pr-youtube b{color:#dc2626}.tb-pr-instagram b{color:#c026d3}.tb-pr-x b{color:#111827}.tb-pr-no-media{margin:10px 0;padding:9px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;font-size:10px}.tb-pr-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.tb-pr-actions a,.tb-pr-actions button{border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#334155;padding:8px 9px;font-size:10px;font-weight:900;text-decoration:none;cursor:pointer}.tb-pr-actions button:first-of-type{border-color:#f97316;color:#c2410c}.tb-pr-empty{margin:16px;padding:20px;border:1px dashed #93c5fd;border-radius:14px;background:#eff6ff;color:#475569}.tb-queue-added{border-color:#fb923c!important;background:#fff7ed!important;box-shadow:0 0 0 3px rgba(249,115,22,.14)!important}@media(max-width:720px){.tb-pr-controls{grid-template-columns:1fr 1fr}.tb-pr-grid{grid-template-columns:1fr;padding:12px}}@media(max-width:430px){.tb-pr-controls{grid-template-columns:1fr}.tb-pr-hero{padding:16px}}
    </style><div class="tb-pr-hero"><div class="tb-pr-hero-top"><div><h2>🛰️ Yeni Ürün Radarı</h2><p>Sabit birkaç üreticiye bağlı kalmadan ${state.coverage?.brands_monitored || '50+'} teknoloji markasının resmî haber odalarını ve resmî alan adlarındaki yeni duyuruları tarar. Güçlü lansman sinyalleri ile doğrulanmış YouTube, Instagram ve X paylaşımları aynı kartta birleştirilir.</p></div><button class="tb-pr-refresh" ${state.loading ? 'disabled' : ''}>↻ Şimdi eşzamanla</button></div><div class="tb-pr-controls"><div class="tb-pr-control"><label>Zaman</label><select data-pr-filter="hours">${options([['6','Son 6 saat'],['24','Son 24 saat'],['72','Son 3 gün'],['168','Son 7 gün']],state.hours)}</select></div><div class="tb-pr-control"><label>Tür</label><select data-pr-filter="type">${options([['product','Ürün'],['service','Hizmet']],state.type,'Tümü')}</select></div><div class="tb-pr-control"><label>Resmî medya</label><select data-pr-filter="media">${options([['youtube','YouTube videolu'],['instagram','Instagram paylaşımlı'],['x','X paylaşımlı']],state.media,'Tümü')}</select></div><div class="tb-pr-control"><label>Marka</label><select data-pr-filter="brand">${options(state.brands.map((brand) => [brand,brand]),state.brand,'Tüm markalar')}</select></div></div></div>
      <div class="tb-pr-status ${state.error ? 'error' : ''}">${esc(state.loading ? 'Resmî duyurular ve videolar eşzamanlanıyor…' : state.error || `${state.items.length} güncel duyuru · Son kontrol ${fmt(state.refreshedAt)}`)}</div>
      ${state.items.length ? `<div class="tb-pr-grid">${state.items.map(card).join('')}</div>` : `<div class="tb-pr-empty">${state.loading ? 'Veriler hazırlanıyor…' : 'Seçilen ölçütlerde güncel resmî ürün veya hizmet duyurusu bulunamadı.'}</div>`}`;
    root.querySelector('.tb-pr-refresh')?.addEventListener('click', () => load(true));
    root.querySelectorAll('[data-pr-filter]').forEach((select) => select.addEventListener('change', () => { state[select.dataset.prFilter] = select.value; load(false); }));
    return true;
  }

  async function queue(item, button) {
    const response = await fetch(`/api/intelligence?token=${encodeURIComponent(authToken())}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_upsert', ...item }) });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    button.textContent = '✓ Yazılacaklarda'; button.disabled = true; button.closest('.tb-pr-card')?.classList.add('tb-queue-added');
  }

  document.addEventListener('click', async (event) => {
    const queueButton = event.target.closest('[data-pr-queue]');
    if (queueButton) { queueButton.disabled = true; try { await queue(JSON.parse(queueButton.dataset.prQueue || '{}'), queueButton); } catch (error) { queueButton.disabled = false; alert(`Yazılacaklar hatası: ${error.message}`); } return; }
    const slackButton = event.target.closest('[data-pr-slack]');
    if (slackButton) { slackButton.disabled = true; try { const item = JSON.parse(slackButton.dataset.prSlack || '{}'); const response = await fetch('/api/push-to-slack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [item] }) }); const data = await response.json().catch(() => ({})); if (!response.ok || data.ok === false) throw new Error(data.error || data.errors?.[0] || `HTTP ${response.status}`); await queue(item, slackButton); slackButton.textContent = '✓ Slack’e gönderildi'; } catch (error) { slackButton.disabled = false; alert(`Slack hatası: ${error.message}`); } }
  });

  async function load(force = false) {
    state.loading = true; state.error = ''; render();
    try {
      const params = new URLSearchParams({ hours: state.hours, limit: '60', _: String(Date.now()) });
      if (state.type !== 'all') params.set('type', state.type); if (state.media !== 'all') params.set('media', state.media); if (state.brand !== 'all') params.set('brand', state.brand);
      if (force) { params.set('refresh','1'); params.set('token',authToken()); }
      const response = await fetch(`/api/product-radar?${params}`, { cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      state.items = Array.isArray(data.items) ? data.items : []; state.brands = Array.isArray(data.brands) ? data.brands : state.brands; state.coverage = data.coverage || state.coverage; state.refreshedAt = data.refreshed_at || new Date().toISOString();
    } catch (error) { state.items = []; state.error = `Yeni Ürün Radarı verisi alınamadı: ${error.message || error}`; }
    finally { state.loading = false; render(); }
  }

  function start() { if (!render()) return setTimeout(start, 150); const activate = (event) => { if (event.detail?.tab === 'product-radar' && !state.items.length && !state.loading) load(false); }; window.addEventListener('tb-spa-tab-change', activate); if (location.hash === '#product-radar') load(false); setInterval(() => { if (location.hash === '#product-radar') load(false); }, 15 * 60000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
