(() => {
  const state = { loading: false, error: '', data: null, stage: 'all' };
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = () => localStorage.getItem('tb_radar_cron_token') || localStorage.getItem('tb_cron_token') || '';
  const ago = (value) => {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value || 0).getTime()) / 60000));
    if (minutes < 60) return `${minutes} dk önce`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} sa önce`;
    return `${Math.round(minutes / 1440)} gün önce`;
  };
  const stageLabel = (stage) => ({ act_now: 'Şimdi yaz', emerging: 'Yükseliyor', watch: 'İzle', covered: 'Yazıldı' }[stage] || stage);
  const root = () => document.getElementById('tb-early-signal-root');

  async function post(body) {
    const response = await fetch(`/api/intelligence?token=${encodeURIComponent(token())}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function card(item) {
    const lead = item.competitor_count ? `İlk rakibe kadar ${item.lead_window_minutes} dk` : `${item.lead_window_minutes} dk açık fırsat penceresi`;
    const news = item.items?.[0] || {};
    const links = (item.items || []).slice(0, 4).map((entry) => `<a href="${esc(entry.url)}" target="_blank" rel="noopener">${esc(entry.source_name || 'Kaynak')}</a>`).join('');
    const references = (item.editorial_package?.references || item.source_timeline || item.items || []).slice(0, 6).map((entry) => ({ title: entry.title || '', source_name: entry.source_name || entry.source || '', url: entry.url || '' })).filter((entry) => entry.url);
    const queueData = esc(JSON.stringify({ candidate_id: news.id, title: item.cluster_name, url: news.url, source_name: news.source_name, image_url: news.image_url, status: 'new', priority: item.first_mover_score, references }));
    return `<article class="tb-e-card ${esc(item.signal_stage)}">${news.image_url ? `<img src="${esc(news.image_url)}" alt="" loading="lazy" onerror="this.hidden=true">` : ''}<div class="tb-e-body"><div class="tb-e-badges"><b>${stageLabel(item.signal_stage)}</b><span>Öncülük ${item.first_mover_score}</span><span>Patlama %${item.breakout_probability}</span></div><h3>${esc(item.cluster_name)}</h3><p><strong>İlk sinyal:</strong> ${esc(item.first_source_name || '—')} · ${ago(item.first_seen_at)}</p><div class="tb-e-window">⏱ ${esc(lead)}</div><div class="tb-e-facts"><span>${item.source_count} kaynak</span><span>${item.official_source_count} resmî</span><span>${item.competitor_count} Türkiye rakibi</span><span>Hız ${item.acceleration_score}</span></div><ul>${(item.reasons || []).map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul><nav>${links}<button data-early-queue="${queueData}">＋ Yazılacaklara</button><button data-early-slack="${queueData}">Slack'e gönder</button></nav></div></article>`;
  }

  function render() {
    const el = root(); if (!el) return;
    const data = state.data || {};
    const items = (data.items || []).filter((item) => state.stage === 'all' || item.signal_stage === state.stage);
    let content = state.loading ? '<div class="tb-e-empty">Erken sinyaller hesaplanıyor…</div>' : state.error ? `<div class="tb-e-empty">Hata: ${esc(state.error)}</div>` : items.length ? `<div class="tb-e-grid">${items.map(card).join('')}</div>` : '<div class="tb-e-empty">Bu eşikte açık ilk yayın fırsatı yok.</div>';
    el.innerHTML = `<style>.tb-e-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}.tb-e-head h2{margin:0}.tb-e-head p{margin:5px 0;color:#64748b;font-size:13px}.tb-e-actions,.tb-e-filters,.tb-e-badges,.tb-e-facts,.tb-e-card nav{display:flex;gap:7px;flex-wrap:wrap}.tb-e-actions button,.tb-e-filters button,.tb-e-card nav a,.tb-e-card nav button{border:1px solid #f04a0a;border-radius:10px;background:#fff;color:#c2410c;padding:8px 10px;font-size:11px;font-weight:900;text-decoration:none;cursor:pointer}.tb-e-filters{margin:13px 0}.tb-e-filters button.on{background:#111827;color:#fff;border-color:#111827}.tb-e-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px;margin:12px 0}.tb-e-metrics div{padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.tb-e-metrics b{display:block;font-size:24px}.tb-e-metrics span{font-size:11px;color:#64748b}.tb-e-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(285px,1fr));gap:12px}.tb-e-card{overflow:hidden;border:1px solid #e2e8f0;border-top:4px solid #94a3b8;border-radius:17px;background:#fff}.tb-e-card.act_now{border-top-color:#dc2626}.tb-e-card.emerging{border-top-color:#f59e0b}.tb-e-card img{width:100%;aspect-ratio:16/8.5;object-fit:cover;background:#f1f5f9}.tb-e-body{padding:13px}.tb-e-badges b,.tb-e-badges span,.tb-e-facts span{border-radius:999px;padding:4px 7px;background:#eef2ff;color:#3730a3;font-size:10px;font-weight:900}.tb-e-card.act_now .tb-e-badges b{background:#fee2e2;color:#991b1b}.tb-e-card.emerging .tb-e-badges b{background:#fef3c7;color:#92400e}.tb-e-card h3{font-size:18px;line-height:1.28;margin:9px 0}.tb-e-card p,.tb-e-card li{font-size:12px;color:#64748b}.tb-e-window{padding:9px;margin:8px 0;border-radius:11px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:900}.tb-e-facts{margin:8px 0}.tb-e-card ul{padding-left:19px;margin:9px 0}.tb-e-card nav{margin-top:10px}.tb-e-empty{padding:24px;border:1px dashed #cbd5e1;border-radius:14px;text-align:center;color:#64748b}@media(max-width:700px){.tb-e-grid{grid-template-columns:1fr}}</style><div class="tb-e-head"><div><h2>🚨 Öncü Radar</h2><p>Trend olmadan önce yakalanan, Teknoblog'a ilk yayın avantajı sağlayabilecek gelişmeler.</p></div><div class="tb-e-actions"><button data-early-reload>↻ Yenile</button></div></div><div class="tb-e-metrics"><div><b>${data.act_now || 0}</b><span>şimdi yaz</span></div><div><b>${data.emerging || 0}</b><span>yükselen sinyal</span></div><div><b>${data.watch || 0}</b><span>izlenecek konu</span></div><div><b>${data.scan_interval_minutes || 15} dk</b><span>tarama aralığı</span></div></div><div class="tb-e-filters">${[['all','Tümü'],['act_now','Şimdi yaz'],['emerging','Yükseliyor'],['watch','İzle']].map(([key,label]) => `<button class="${state.stage === key ? 'on' : ''}" data-early-stage="${key}">${label}</button>`).join('')}</div>${content}`;
  }

  async function load() {
    state.loading = true; state.error = ''; render();
    try { const response = await fetch(`/api/intelligence?section=early-signals&_=${Date.now()}`, { cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); state.data = data; }
    catch (error) { state.error = error?.message || String(error); }
    finally { state.loading = false; render(); }
  }

  document.addEventListener('click', async (event) => {
    const stage = event.target.closest('[data-early-stage]'); if (stage) { state.stage = stage.dataset.earlyStage; render(); return; }
    if (event.target.closest('[data-early-reload]')) { load(); return; }
    const queue = event.target.closest('[data-early-queue]');
    if (queue) { try { await post({ action: 'queue_upsert', ...JSON.parse(queue.dataset.earlyQueue) }); queue.textContent = '✓ Eklendi'; queue.disabled = true; } catch (error) { alert(error.message); } return; }
    const slack = event.target.closest('[data-early-slack]');
    if (slack) { try { const item = JSON.parse(slack.dataset.earlySlack); const response = await fetch('/api/push-to-slack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [item] }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); await post({ action: 'queue_upsert', ...item }); slack.textContent = '✓ Gönderildi'; slack.disabled = true; } catch (error) { alert(error.message); } }
  });
  window.addEventListener('tb-spa-tab-change', (event) => { if (event.detail?.tab === 'early-signals' && !state.data) load(); });
  function start() { render(); if (location.hash === '#early-signals') load(); setInterval(() => { if (location.hash === '#early-signals') load(); }, 5 * 60000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
