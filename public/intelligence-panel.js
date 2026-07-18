(() => {
  const state = { tab: 'today', loading: false, data: {}, error: '' };
  const sections = {
    today: ['Bugün', 'summary'], clusters: ['Kümeler', 'clusters'], coverage: ['Kapsam', 'coverage'],
    queue: ['Yazılacaklar', 'queue'], sources: ['Kaynak Sağlığı', 'sources'], performance: ['Performans', 'performance'],
    lab: ['Puan Lab', 'scoring-lab'], system: ['Sistem', 'system']
  };
  const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => v ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(v)) : '—';
  const token = () => localStorage.getItem('tb_radar_cron_token') || localStorage.getItem('tb_cron_token') || '';

  async function get(section) {
    const response = await fetch(`/api/intelligence?section=${encodeURIComponent(section)}&_=${Date.now()}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  async function post(body, auth = false) {
    const response = await fetch(`/api/intelligence${auth ? `?token=${encodeURIComponent(token())}` : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  async function google(path = '', options = {}) {
    const response = await fetch(`/api/google-auth${path}`, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  const img = (item) => item?.image_url ? `<img class="tb-i-img" src="${esc(item.image_url)}" alt="" loading="lazy" onerror="this.hidden=true">` : '';
  const pill = (text, cls = '') => `<span class="tb-i-pill ${cls}">${esc(text)}</span>`;
  const empty = (text) => `<div class="tb-i-empty">${esc(text)}</div>`;
  function cards(items, mode) {
    if (!items?.length) return empty('Bu bölüm için henüz veri yok.');
    return `<div class="tb-i-grid">${items.map((item) => {
      const news = item.items?.[0] || item;
      let meta = `${news.source_name || ''} · ${fmt(news.published_at || news.created_at)}`;
      let badges = '';
      if (mode === 'clusters') badges = pill(`Momentum ${item.momentum_score}`, item.momentum_score >= 70 ? 'hot' : '') + pill(`${item.source_count} kaynak`) + pill(`Güven ${item.confidence_score}`);
      if (mode === 'coverage') badges = pill(item.recommendation === 'new_article' ? 'Yeni haber' : item.recommendation === 'update_existing' ? 'Güncelle' : 'Yazıldı') + pill(`Eşleşme ${item.match_score}`);
      return `<article class="tb-i-card">${img(news)}<div class="tb-i-body"><div>${badges}</div><h3>${esc(item.cluster_name || news.title)}</h3><p>${esc(meta)}</p>${item.matched_post ? `<p>Teknoblog eşleşmesi: <a href="${esc(item.matched_post.url)}" target="_blank">${esc(item.matched_post.title)}</a></p>` : ''}<div class="tb-i-actions"><a href="${esc(news.url || '#')}" target="_blank">Kaynak</a><button data-queue='${esc(JSON.stringify({ candidate_id: news.id, title: news.title, url: news.url, source_name: news.source_name, image_url: news.image_url, status: 'new', priority: Math.max(news.discover_score || 50, item.momentum_score || 0) }))}'>Yazılacaklara ekle</button></div></div></article>`;
    }).join('')}</div>`;
  }
  function summary(data) {
    const d = data.data || {};
    return `<div class="tb-i-metrics"><div><b>${d.fresh_candidates || 0}</b><span>24 saatlik aday</span></div><div><b>${d.active_sources || 0}</b><span>aktif kaynak</span></div><div><b>${d.queue_open || 0}</b><span>açık görev</span></div><div><b>${d.published_today || 0}</b><span>bugün yayımlandı</span></div><div><b>${d.images_24h || 0}</b><span>görselli içerik</span></div><div><b>%${d.disk?.used_percent ?? 0}</b><span>disk kullanımı</span></div></div><h3>Hızlanan konular</h3>${cards(d.rising_clusters || [], 'clusters')}<h3>İlgi isteyen kaynaklar</h3>${sourceTable(d.unhealthy_sources || [])}`;
  }
  function sourceTable(items) {
    if (!items?.length) return empty('Sorunlu kaynak bulunmuyor.');
    return `<div class="tb-i-table">${items.map((s) => `<div><b>${esc(s.name)}</b>${pill(`Kalite ${s.quality_score}`)}${pill(`${s.stored_items || 0} içerik`)}<span>${s.last_error ? esc(s.last_error) : `Son içerik ${fmt(s.last_item_at)}`}</span></div>`).join('')}</div>`;
  }
  function queue(items) {
    if (!items?.length) return empty('Yazılacaklar havuzu boş.');
    const done = items.filter((i) => i.status === 'published').length;
    return `<div class="tb-i-progress"><i style="width:${Math.round(done / Math.max(1, items.length) * 100)}%"></i></div><p>${done}/${items.length} tamamlandı</p><div class="tb-i-table">${items.map((i) => `<div>${i.image_url ? `<img src="${esc(i.image_url)}" loading="lazy" onerror="this.hidden=true">` : ''}<b>${esc(i.title)}</b>${pill(i.status)}${pill(`Öncelik ${i.priority}`)}<span>${esc(i.source_name || '')} · ${fmt(i.created_at)}</span><nav><a href="${esc(i.url)}" target="_blank">Kaynak</a>${['approved', 'writing', 'published', 'waiting', 'skipped'].map((status) => `<button data-status="${status}" data-item='${esc(JSON.stringify(i))}'>${status}</button>`).join('')}</nav></div>`).join('')}</div>`;
  }
  function performance(data) {
    const oauth = data.oauth || {};
    if (!oauth.configured) return `<div class="tb-i-callout"><b>Google Search Console'u bağla</b><p>OAuth bilgileri yerel PostgreSQL'de şifreli saklanır. Radar yalnızca Search Console verilerini okur.</p><div class="tb-i-form"><label>OAuth Client ID<input id="tb-google-client-id" autocomplete="off" placeholder="…apps.googleusercontent.com"></label><label>OAuth Client Secret<input id="tb-google-client-secret" type="password" autocomplete="new-password"></label><label>Search Console mülkü<input id="tb-google-site" value="${esc(oauth.site_url || 'sc-domain:teknoblog.com')}"></label><label>Yetkili yönlendirme adresi<input value="${esc(oauth.redirect_uri || '')}" readonly></label><button data-google-save>Kaydet ve Google ile bağlan</button></div></div>`;
    if (!oauth.connected) return `<div class="tb-i-callout"><b>OAuth uygulaması hazır.</b><p>Search Console okuma iznini vermek için Google hesabınızla bağlantıyı tamamlayın.</p><button data-google-connect>Google ile bağlan</button><p>Search Console mülkü: ${esc(oauth.site_url || '')}</p></div>`;
    const list = (items, mode) => items?.length ? `<div class="tb-i-table">${items.map((i) => `<div><b><a href="${esc(i.url)}" target="_blank">${esc(i.title || i.url)}</a></b>${pill(`Öncelik ${i.performance_priority}`, i.performance_priority >= 70 ? 'hot' : '')}${pill(`Discover ${i.discover_clicks}/${i.discover_impressions}`)}${pill(`News ${i.google_news_clicks}/${i.google_news_impressions}`)}<span>${fmt(i.published_at)} · ${i.age_days} gün önce</span></div>`).join('')}</div>` : empty(mode === 'discover' ? 'Son 14 günde Discover sinyali yok.' : 'Son 14 günde Google News sinyali yok.');
    const totals = data.totals || {}; const model = data.model || {};
    const evaluation=model.metrics?.evaluation||{};
    return `<div class="tb-i-actions"><button data-action="sync_gsc">Search Console'u eşzamanla</button><button data-action="train_model">Modeli yeniden eğit</button></div><p>Yalnızca son ${data.window_days || 14} günde yayımlanan yazılar gösterilir. Sıralamada Discover %58, Google News %32, Web %10 ağırlığa sahiptir.</p><div class="tb-i-metrics"><div><b>${totals.discover_clicks || 0}</b><span>Discover tıklaması</span></div><div><b>${totals.discover_impressions || 0}</b><span>Discover gösterimi</span></div><div><b>${totals.news_clicks || 0}</b><span>Google News tıklaması</span></div><div><b>${totals.news_impressions || 0}</b><span>Google News gösterimi</span></div><div><b>${model.sample_count || 0}</b><span>öğrenme örneği</span></div><div><b>%${evaluation.discover?.accuracy || 0}</b><span>Discover doğruluğu</span></div><div><b>%${evaluation.news?.accuracy || 0}</b><span>News doğruluğu</span></div><div><b>${model.model_version ? 'Aktif' : 'Bekliyor'}</b><span>${model.model_version ? esc(model.model_version) : 'ilk eğitim gerekli'}</span></div></div><h3>✨ Discover önceliği</h3>${list(data.discover_items, 'discover')}<h3>📰 Google News önceliği</h3>${list(data.news_items, 'news')}`;
  }
  function lab(data) {
    const d = data.distribution || {};
    return `<div class="tb-i-metrics"><div><b>${d.discover_avg ?? 0}</b><span>Discover ort.</span></div><div><b>${d.discover_min ?? 0}–${d.discover_max ?? 0}</b><span>Discover aralığı</span></div><div><b>${d.discover_distinct ?? 0}</b><span>farklı Discover</span></div><div><b>${d.traffic_avg ?? 0}</b><span>Trafik ort.</span></div><div><b>${d.traffic_min ?? 0}–${d.traffic_max ?? 0}</b><span>Trafik aralığı</span></div><div><b>${(d.discover_100 || 0) + (d.traffic_100 || 0)}</b><span>100'e yığılma</span></div></div>${sourceTable((data.sources || []).map((s) => ({ name: s.source_name, quality_score: s.discover_avg, stored_items: s.items, last_item_at: null, last_error: `Trafik ort. ${s.traffic_avg}` })))}`;
  }
  function system(data) {
    return `<div class="tb-i-metrics"><div><b>%${data.disk?.used_percent ?? 0}</b><span>disk kullanımı</span></div><div><b>${data.alerts?.length || 0}</b><span>son uyarı</span></div><div><b>${data.images?.filter((i) => i.status === 'ready').length || 0}</b><span>hazır görsel</span></div></div><div class="tb-i-actions"><button data-action="sync_teknoblog">Teknoblog hafızasını yenile</button><button data-action="run_alerts">Uyarıları değerlendir</button><button data-action="check_images">Görselleri kontrol et</button><button data-action="maintenance">Bakım çalıştır</button></div><h3>Son uyarılar</h3>${data.alerts?.length ? `<div class="tb-i-table">${data.alerts.map((a) => `<div><b>${esc(a.title)}</b>${pill(a.alert_type)}<span>${fmt(a.created_at)}</span></div>`).join('')}</div>` : empty('Uyarı yok.')}`;
  }
  function content() {
    const data = state.data[state.tab];
    if (state.loading) return empty('Veriler değerlendiriliyor…');
    if (state.error) return empty(`Hata: ${state.error}`);
    if (!data) return empty('Bölüm yüklenmedi.');
    if (state.tab === 'today') return summary(data);
    if (state.tab === 'clusters') return cards(data.items, 'clusters');
    if (state.tab === 'coverage') return cards(data.items, 'coverage');
    if (state.tab === 'queue') return queue(data.items);
    if (state.tab === 'sources') return sourceTable(data.items);
    if (state.tab === 'performance') return performance(data);
    if (state.tab === 'lab') return lab(data);
    return system(data);
  }
  function render() {
    const root = document.getElementById('tb-intelligence-root'); if (!root) return;
    root.innerHTML = `<style>.tb-i-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.tb-i-tabs,.tb-i-actions,.tb-i-card .tb-i-actions{display:flex;gap:7px;flex-wrap:wrap}.tb-i-tabs{margin:14px 0;overflow:auto}.tb-i-tabs button,.tb-i-actions button,.tb-i-actions a,.tb-i-card button,.tb-i-card a,.tb-i-table button,.tb-i-table a,.tb-i-callout button{border:1px solid #c7d2fe;background:#fff;color:#3730a3;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:800;text-decoration:none;cursor:pointer}.tb-i-tabs button.on{background:#4338ca;color:#fff}.tb-i-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0}.tb-i-metrics>div{border:1px solid #e2e8f0;border-radius:15px;padding:13px;background:#f8fafc}.tb-i-metrics b{font-size:25px;display:block;color:#111827}.tb-i-metrics span,.tb-i-card p,.tb-i-table span{font-size:12px;color:#64748b}.tb-i-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.tb-i-card{border:1px solid #e2e8f0;border-radius:17px;overflow:hidden;background:#fff}.tb-i-img{width:100%;aspect-ratio:16/9;object-fit:cover;background:#f1f5f9}.tb-i-body{padding:13px}.tb-i-card h3{font-size:18px;line-height:1.25;margin:8px 0}.tb-i-pill{display:inline-block;border-radius:999px;padding:4px 7px;margin:2px;background:#eef2ff;color:#3730a3;font-size:10px;font-weight:900}.tb-i-pill.hot{background:#ffedd5;color:#c2410c}.tb-i-table{display:grid;gap:8px}.tb-i-table>div{display:grid;grid-template-columns:auto auto auto 1fr;gap:8px;align-items:center;border:1px solid #e2e8f0;border-radius:13px;padding:10px}.tb-i-table img{width:70px;height:46px;object-fit:cover;border-radius:8px}.tb-i-table nav{grid-column:1/-1;display:flex;gap:5px;flex-wrap:wrap}.tb-i-empty,.tb-i-callout{padding:16px;border:1px dashed #c7d2fe;border-radius:14px;color:#64748b;background:#f8fafc}.tb-i-form{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:10px;margin-top:14px}.tb-i-form label{display:grid;gap:5px;font-size:12px;font-weight:800;color:#334155}.tb-i-form input{border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:#fff;min-width:0}.tb-i-form button{align-self:end}.tb-i-progress{height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden}.tb-i-progress i{display:block;height:100%;background:#4f46e5}@media(max-width:700px){.tb-i-table>div,.tb-i-form{grid-template-columns:1fr}.tb-i-table nav{grid-column:1}.tb-i-grid{grid-template-columns:1fr}}</style><div class="tb-i-head"><div><h2>🧠 Radar Intelligence</h2><p>Karar, iş akışı ve sistem sağlığı tek yerde.</p></div><button data-reload>Yenile</button></div><div class="tb-i-tabs">${Object.entries(sections).map(([key, [label]]) => `<button class="${key === state.tab ? 'on' : ''}" data-i-tab="${key}">${label}</button>`).join('')}</div><div id="tb-i-content">${content()}</div>`;
  }
  async function load(tab = state.tab, force = false) {
    state.tab = tab; state.error = '';
    if (state.data[tab] && !force) { render(); return; }
    state.loading = true; render();
    try {
      state.data[tab] = await get(sections[tab][1]);
      if (tab === 'performance') state.data[tab].oauth = await google();
    } catch (e) { state.error = e.message || String(e); }
    finally { state.loading = false; render(); }
  }
  document.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-i-tab]'); if (tab) return load(tab.dataset.iTab);
    if (event.target.closest('[data-reload]')) return load(state.tab, true);
    const queued = event.target.closest('[data-queue],[data-add-queue]');
    if (queued) { try { await post({ action: 'queue_upsert', ...JSON.parse(queued.dataset.queue || queued.dataset.addQueue) }); queued.textContent = 'Eklendi'; state.data.queue = null; } catch (e) { alert(e.message); } return; }
    const status = event.target.closest('[data-status]');
    if (status) { try { await post({ action: 'queue_upsert', ...JSON.parse(status.dataset.item), status: status.dataset.status }); await load('queue', true); } catch (e) { alert(e.message); } return; }
    const connect = event.target.closest('[data-google-connect]');
    if (connect) { try { const data = await google('?action=start'); window.open(data.auth_url, 'tbGoogleOAuth', 'width=620,height=760'); } catch (e) { alert(e.message); } return; }
    const save = event.target.closest('[data-google-save]');
    if (save) {
      save.disabled = true;
      try {
        await google('', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-token': token() }, body: JSON.stringify({ client_id: document.getElementById('tb-google-client-id')?.value || '', client_secret: document.getElementById('tb-google-client-secret')?.value || '', site_url: document.getElementById('tb-google-site')?.value || 'sc-domain:teknoblog.com' }) });
        const data = await google('?action=start'); window.open(data.auth_url, 'tbGoogleOAuth', 'width=620,height=760');
      } catch (e) { alert(e.message); } finally { save.disabled = false; }
      return;
    }
    const action = event.target.closest('[data-action]');
    if (action) { action.disabled = true; try { await post({ action: action.dataset.action }, true); state.data = {}; await load(state.tab, true); } catch (e) { alert(e.message); } finally { action.disabled = false; } }
  });
  window.addEventListener('message', (event) => { if (event.origin === location.origin && event.data?.type === 'tb-gsc-connected') load('performance', true); });
  function start() { render(); load('today'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
