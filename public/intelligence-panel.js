(() => {
  const VIEW_KEY = 'tb_decision_center_view';
  const sections = {
    today: ['Bugünün Kararı', 'summary'], early: ['Erken Sinyaller', 'early-signals'], clusters: ['Yükselen Konular', 'clusters'], lifecycle: ['Sinyal Akışı', 'lifecycle'], coverage: ['Teknoblog Kapsamı', 'coverage'],
    queue: ['Yazılacaklar', 'queue'], performance: ['Discover & News', 'performance'], accuracy: ['Model Doğruluğu', 'accuracy'], weekly: ['Haftalık Öğrenme', 'weekly-report'],
    pioneer: ['Öncülük Başarısı', 'pioneer-metrics'], lab: ['Puan Kontrolü', 'scoring-lab'], leadership: ['Kaynak Öncülüğü', 'leadership'], watchlists: ['İzleme Listeleri', 'watchlists'], sources: ['Kaynak Sağlığı', 'sources'], system: ['Sistem Bakımı', 'system']
  };
  const groups = [
    { key: 'decide', label: 'Bugün & Sinyaller', icon: '⚡', views: ['today', 'early', 'clusters', 'lifecycle', 'coverage'] },
    { key: 'workflow', label: 'Yazılacaklar', icon: '✍️', views: ['queue'] },
    { key: 'learning', label: 'Performans & Öğrenme', icon: '📊', views: ['performance', 'pioneer', 'accuracy', 'weekly', 'lab'] },
    { key: 'health', label: 'Kaynaklar & Sistem', icon: '🩺', views: ['leadership', 'watchlists', 'sources', 'system'] }
  ];
  const descriptions = {
    today: 'Şu anda dikkat isteyen fırsatları, yükselen konuları ve kaynak sorunlarını birlikte gösterir.',
    early: 'Tek kaynakta beliren, rakiplerde henüz görünmeyen ve ilk yayın avantajı taşıyan gelişmeler.',
    clusters: 'En az iki bağımsız kaynağın doğruladığı, yayılma ivmesine göre sıralanan konu kümeleri.',
    lifecycle: 'Her konunun ilk sinyalden doğrulama, görev ve yayın sonucuna uzanan zaman çizelgesi.',
    coverage: 'Yeni haber mi yazılmalı, mevcut Teknoblog içeriği mi güncellenmeli?',
    queue: 'Yazılacak haberlerin görev durumu ve tamamlanma ilerlemesi.',
    performance: 'Search Console’dan gelen gerçek Discover ve Google News sonuçları.',
    pioneer: 'Radar önerilerinin ilk yayın avantajına, Discover ve Google News başarısına gerçek katkısı.',
    accuracy: 'Radar tahminlerinin yayımlanan haberlerin gerçek performansıyla karşılaştırması.',
    weekly: 'Kazanan konular, güçlü kaynaklar ve kaçırılan yüksek potansiyelli adaylar.',
    lab: 'Puanların 100’e yığılmasını ve kaynak bazlı dağılımı denetler.',
    leadership: 'Hangi kaynağın hangi konu alanında haberi önce verdiğini ve doğrulama değerini gösterir.',
    watchlists: 'Öncelikli marka ve konular için takip profilleri ve eşleşen güncel sinyaller.',
    sources: 'Haber kaynaklarının güncellik, kalite ve veri üretim durumu.',
    system: 'Yerel PostgreSQL, görseller, uyarılar ve bakım işlemleri.'
  };
  const savedView = localStorage.getItem(VIEW_KEY);
  const state = { tab: sections[savedView] ? savedView : 'today', loading: false, data: {}, error: '' };
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
  const stageName = (stage) => ({ detected: 'İlk sinyal', corroborated: 'Doğrulandı', accelerating: 'Hızlanıyor', queued: 'Yazılacak', published: 'Yayımlandı', expired: 'Fırsat geçti' })[stage] || stage || 'İzleniyor';
  const beatName = (beat) => ({ ai: 'Yapay zekâ', apple: 'Apple', android: 'Android', security: 'Güvenlik', hardware: 'Donanım', software: 'Yazılım', deals: 'Fırsat', mobility: 'Mobilite', 'science-space': 'Bilim/Uzay', 'general-tech': 'Teknoloji' })[beat] || beat || 'Teknoloji';
  function packageDetails(item) {
    const pack = item.editorial_package || {};
    const timeline = item.source_timeline || [];
    if (!pack.references?.length && !timeline.length) return '';
    const copyText = `Konu: ${item.cluster_name || ''}\nKarar: ${pack.decision || ''}\nAçı: ${pack.angle || ''}\n\nKaynak iddiaları:\n${(pack.source_claims || []).map((claim) => `- ${claim}`).join('\n')}\n\nKontrol edilecekler:\n${(pack.open_questions || []).map((question) => `- ${question}`).join('\n')}\n\nBaşlık seçenekleri:\n${(pack.headline_options || []).map((headline) => `- ${headline}`).join('\n')}\n\nReferanslar:\n${(pack.references || []).map((ref) => `- ${ref.source}: ${ref.url}`).join('\n')}`;
    return `<div class="tb-i-details"><details><summary>⏱️ Kaynak zaman çizelgesi</summary>${timeline.map((source, index) => `<p><b>${index + 1}. ${esc(source.source_name)}</b> · ${fmt(source.published_at)} · ${esc(source.market || '')}${source.url ? ` · <a href="${esc(source.url)}" target="_blank">haber</a>` : ''}</p>`).join('') || '<p>Henüz tek kaynak var.</p>'}</details><details><summary>📝 Hazır yayın paketi</summary><p><b>Karar:</b> ${esc(pack.decision === 'write_now' ? 'Hemen yaz' : pack.decision === 'verify_first' ? 'Önce doğrula' : 'Takip et')}</p><p><b>Açı:</b> ${esc(pack.angle || '')}</p><b>Kaynakların söylediği</b><ul>${(pack.source_claims || []).map((claim) => `<li>${esc(claim)}</li>`).join('')}</ul><b>Kontrol edilecekler</b><ul>${(pack.open_questions || []).map((question) => `<li>${esc(question)}</li>`).join('')}</ul><b>Başlık seçenekleri</b><ul>${(pack.headline_options || []).map((headline) => `<li>${esc(headline)}</li>`).join('')}</ul><button data-copy-brief="${esc(copyText)}">Paketi kopyala</button></details></div>`;
  }
  function cards(items, mode) {
    if (!items?.length) return empty('Bu bölüm için henüz veri yok.');
    return `<div class="tb-i-grid">${items.map((item) => {
      const news = item.items?.[0] || item;
      let meta = `${news.source_name || ''} · ${fmt(news.published_at || news.created_at)}`;
      let badges = '';
      if (mode === 'clusters') badges = pill(`Momentum ${item.momentum_score}`, item.momentum_score >= 70 ? 'hot' : '') + pill(`${item.source_count} kaynak`) + pill(`Güven ${item.confidence_score}`);
      if (mode === 'early') badges = pill(item.signal_stage === 'act_now' ? 'Şimdi yaz' : item.signal_stage === 'emerging' ? 'Yükseliyor' : 'İzle', item.signal_stage === 'act_now' ? 'bad' : item.signal_stage === 'emerging' ? 'hot' : '') + pill(`Öncülük ${item.first_mover_score}`) + pill(`Patlama %${item.breakout_probability}`) + pill(`${item.competitor_count} rakip`);
      if (item.cluster_key) badges += pill(stageName(item.lifecycle_stage), item.lifecycle_stage === 'accelerating' ? 'hot' : item.lifecycle_stage === 'expired' ? 'bad' : item.lifecycle_stage === 'published' ? 'good' : '') + pill(`Yeni ${item.novelty_score}`) + pill(beatName(item.beat)) + (item.opportunity_minutes > 0 ? pill(`⏱ ${item.opportunity_minutes} dk`, item.opportunity_minutes <= 30 ? 'bad' : 'hot') : pill('Fırsat süresi geçti', 'bad')) + (item.propagation_stage === 'entering_turkey' ? pill('🌍 → 🇹🇷', 'good') : '') + (item.watchlists || []).map((name) => pill(`🎯 ${name}`)).join('');
      if (mode === 'coverage') badges = pill(item.recommendation === 'new_article' ? 'Yeni haber' : item.recommendation === 'update_existing' ? 'Güncelle' : 'Yazıldı') + pill(`Eşleşme ${item.match_score}`);
      const references = (item.editorial_package?.references || item.source_timeline || item.items || []).slice(0, 6).map((entry) => ({ title: entry.title || '', source_name: entry.source_name || entry.source || '', url: entry.url || '' })).filter((entry) => entry.url);
      const queueItem = { candidate_id: news.id, cluster_key: item.cluster_key, title: item.cluster_name || news.title, url: news.url, source_name: news.source_name, image_url: news.image_url, status: 'new', priority: Math.max(news.discover_score || 50, item.first_mover_score || 0, item.momentum_score || 0), references };
      const reasons = mode === 'early' && item.reasons?.length ? `<ul class="tb-i-reasons">${item.reasons.slice(0, 4).map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul>` : '';
      const brief = `Teknoblog için editoryal karar ver.\nKonu: ${queueItem.title || ''}\nKaynak: ${queueItem.source_name || ''}\nURL: ${queueItem.url || ''}\nİstenen: Yaz/Bekle/Geç kararı, ilk yayın açısı, Discover başlığı, Google News başlığı ve 5 maddelik kısa haber planı.`;
      return `<article class="tb-i-card">${img(news)}<div class="tb-i-body"><div>${badges}</div><h3>${esc(item.cluster_name || news.title)}</h3><p>${esc(meta)}</p>${reasons}${item.matched_post ? `<p>Teknoblog eşleşmesi: <a href="${esc(item.matched_post.url)}" target="_blank">${esc(item.matched_post.title)}</a></p>` : ''}${packageDetails(item)}<div class="tb-i-actions"><a href="${esc(news.url || '#')}" target="_blank">Kaynağı aç</a><button data-queue='${esc(JSON.stringify(queueItem))}'>＋ Yazılacaklara</button><button data-slack='${esc(JSON.stringify(queueItem))}'>Slack’e gönder</button><button data-copy-brief="${esc(brief)}">✨ Karar briefi</button></div>${item.cluster_key ? `<details class="tb-i-feedback"><summary>Bu öneriyi değerlendir</summary><button data-feedback="useful" data-item='${esc(JSON.stringify(queueItem))}'>Faydalı</button><button data-feedback="duplicate" data-item='${esc(JSON.stringify(queueItem))}'>Tekrar</button><button data-feedback="unreliable" data-item='${esc(JSON.stringify(queueItem))}'>Kaynak zayıf</button><button data-feedback="skipped" data-item='${esc(JSON.stringify(queueItem))}'>Uygun değil</button></details>` : ''}</div></article>`;
    }).join('')}</div>`;
  }
  function summary(data) {
    const d = data.data || {};
    return `<div class="tb-i-metrics"><div><b>${d.fresh_candidates || 0}</b><span>24 saatlik aday</span></div><div><b>${d.active_sources || 0}</b><span>aktif kaynak</span></div><div><b>${d.queue_open || 0}</b><span>açık görev</span></div><div><b>${d.published_today || 0}</b><span>bugün yayımlandı</span></div><div><b>${d.images_24h || 0}</b><span>görselli içerik</span></div><div><b>%${d.disk?.used_percent ?? 0}</b><span>disk kullanımı</span></div></div><h3>İlk yayın fırsatları</h3>${cards(d.first_mover_opportunities || [], 'early')}<h3>Hızlanan konular</h3>${cards(d.rising_clusters || [], 'clusters')}<h3>İlgi isteyen kaynaklar</h3>${sourceTable(d.unhealthy_sources || [])}`;
  }
  function lifecycle(data) {
    const counts = data.counts || {};
    const timeline = data.events?.length ? `<div class="tb-i-timeline">${data.events.slice(0, 30).map((event) => `<div><i></i><b>${esc(event.payload?.title || event.cluster_key)}</b><span>${stageName(event.from_stage)} → ${stageName(event.to_stage)} · ${fmt(event.occurred_at)}</span></div>`).join('')}</div>` : empty('Henüz aşama değişikliği kaydedilmedi.');
    return `<div class="tb-i-metrics"><div><b>${counts.detected || 0}</b><span>ilk sinyal</span></div><div><b>${counts.corroborated || 0}</b><span>doğrulandı</span></div><div><b>${counts.accelerating || 0}</b><span>hızlanıyor</span></div><div><b>${counts.queued || 0}</b><span>yazılacak</span></div><div><b>${counts.published || 0}</b><span>yayımlandı</span></div><div><b>${counts.expired || 0}</b><span>fırsat geçti</span></div></div><h3>Fırsat süresi dolmak üzere</h3>${cards(data.urgent || [], 'early')}<h3>Son aşama değişiklikleri</h3>${timeline}`;
  }
  function leadership(data) {
    if (!data.items?.length) return empty('Kaynak öncülük istatistikleri ilk küme taramasından sonra oluşacak.');
    return `<div class="tb-i-table">${data.items.map((item) => `<div><b>${esc(item.source_name)}</b>${pill(beatName(item.beat))}${pill(`Öncülük ${item.leadership_score}`, item.leadership_score >= 70 ? 'good' : '')}${pill(`${item.sample_count} konu`)}<span>İlk veren ${item.first_break_count} · Ortalama avantaj ${item.avg_lead_minutes} dk · Yayına katkı %${item.success_score}</span></div>`).join('')}</div>`;
  }
  function watchlists(data) {
    if (!data.items?.length) return empty('İzleme listesi bulunmuyor.');
    return `<div class="tb-i-watch-grid">${data.items.map((watch) => `<section><header><div><b>${esc(watch.name)}</b><p>${(watch.keywords || []).map((word) => esc(word)).join(' · ')}</p></div>${pill(watch.is_active ? 'Aktif' : 'Kapalı', watch.is_active ? 'good' : 'bad')}</header><p>Uyarı eşiği: ${watch.alert_threshold}</p>${watch.matches?.length ? cards(watch.matches.slice(0, 3), 'early') : empty('Son 48 saatte eşleşme yok.')}</section>`).join('')}</div><details class="tb-i-callout"><summary>＋ Yeni izleme listesi</summary><div class="tb-i-form"><label>Liste adı<input id="tb-watch-name" placeholder="Örn. Samsung etkinlikleri"></label><label>Anahtar kelimeler<input id="tb-watch-keywords" placeholder="samsung, galaxy, one ui"></label><label>Uyarı eşiği<input id="tb-watch-threshold" type="number" min="1" max="100" value="65"></label><button data-watch-save>İzleme listesini kaydet</button></div></details>`;
  }
  function pioneer(data) {
    const s = data.summary || {};
    const decisions = data.decisions?.length ? `<div class="tb-i-table">${data.decisions.map((item) => `<div><b>${esc(item.reason_code)}</b>${pill(item.decision)}${pill(`${item.count} karar`)}<span>Son 30 günlük editoryal geri bildirim</span></div>`).join('')}</div>` : empty('Henüz yeterli editoryal geri bildirim yok.');
    return `<div class="tb-i-metrics"><div><b>${s.tracked || 0}</b><span>izlenen konu</span></div><div><b>${s.published || 0}</b><span>yayına dönüşen</span></div><div><b>${s.open_windows || 0}</b><span>açık fırsat penceresi</span></div><div><b>${s.avg_lead_minutes || 0} dk</b><span>ortalama öncülük</span></div><div><b>%${s.discover_success_rate || 0}</b><span>Discover başarısı</span></div><div><b>%${s.news_success_rate || 0}</b><span>Google News başarısı</span></div><div><b>${s.avg_novelty || 0}</b><span>ortalama yenilik</span></div><div><b>${s.avg_spread || 0}</b><span>ortalama yayılım</span></div></div><h3>En güçlü öncü kaynaklar</h3>${leadership({ items: data.leaders || [] })}<h3>Editoryal kararların öğrettikleri</h3>${decisions}`;
  }
  function sourceTable(items) {
    if (!items?.length) return empty('Sorunlu kaynak bulunmuyor.');
    return `<div class="tb-i-table">${items.map((s) => `<div><b>${esc(s.name)}</b>${pill(`Kalite ${s.quality_score}`)}${pill(s.last_status || 'bilinmiyor', s.last_status === 'updated' ? 'good' : s.last_status === 'blocked' || s.last_status === 'database_error' ? 'bad' : '')}${pill(`${s.stored_items || 0} içerik`)}<span>${s.last_error ? esc(s.last_error) : `Yeni ${s.inserted_count || 0} · Güncel ${s.updated_count || 0} · Tekrar ${s.duplicate_count || 0} · Son içerik ${fmt(s.last_item_at)}`}</span></div>`).join('')}</div>`;
  }
  function queue(items) {
    if (!items?.length) return empty('Yazılacaklar havuzu boş.');
    const done = items.filter((i) => i.status === 'published').length;
    const statuses = [['approved', 'Onayla'], ['writing', 'Yazılıyor'], ['published', 'Yayımlandı'], ['waiting', 'Beklet'], ['skipped', 'Geç']];
    return `<div class="tb-i-progress"><i style="width:${Math.round(done / Math.max(1, items.length) * 100)}%"></i></div><p><b>${done}/${items.length}</b> görev tamamlandı</p><div class="tb-i-table">${items.map((i) => `<div>${i.image_url ? `<img src="${esc(i.image_url)}" loading="lazy" onerror="this.hidden=true">` : ''}<b>${esc(i.title)}</b>${pill(({ new: 'Yeni', approved: 'Onaylandı', writing: 'Yazılıyor', published: 'Yayımlandı', waiting: 'Bekliyor', skipped: 'Geçildi' })[i.status] || i.status)}${pill(`Öncelik ${i.priority}`)}<span>${esc(i.source_name || '')} · ${fmt(i.created_at)}</span><nav><a href="${esc(i.url)}" target="_blank">Kaynak</a>${statuses.map(([status, label]) => `<button data-status="${status}" data-item='${esc(JSON.stringify(i))}'>${label}</button>`).join('')}</nav></div>`).join('')}</div>`;
  }
  function performance(data) {
    const oauth = data.oauth || {};
    if (!oauth.configured) return `<div class="tb-i-callout"><b>Google Search Console'u bağla</b><p>OAuth bilgileri yerel PostgreSQL'de şifreli saklanır. Radar yalnızca Search Console verilerini okur.</p><div class="tb-i-form"><label>OAuth Client ID<input id="tb-google-client-id" autocomplete="off" placeholder="…apps.googleusercontent.com"></label><label>OAuth Client Secret<input id="tb-google-client-secret" type="password" autocomplete="new-password"></label><label>Search Console mülkü<input id="tb-google-site" value="${esc(oauth.site_url || 'sc-domain:teknoblog.com')}"></label><label>Yetkili yönlendirme adresi<input value="${esc(oauth.redirect_uri || '')}" readonly></label><button data-google-save>Kaydet ve Google ile bağlan</button></div></div>`;
    if (!oauth.connected) return `<div class="tb-i-callout"><b>OAuth uygulaması hazır.</b><p>Search Console okuma iznini vermek için Google hesabınızla bağlantıyı tamamlayın.</p><button data-google-connect>Google ile bağlan</button><p>Search Console mülkü: ${esc(oauth.site_url || '')}</p></div>`;
    const list = (items, mode) => items?.length ? `<div class="tb-i-table">${items.map((i) => `<div><b><a href="${esc(i.url)}" target="_blank">${esc(i.title || i.url)}</a></b>${pill(`Öncelik ${i.performance_priority}`, i.performance_priority >= 70 ? 'hot' : '')}${pill(`Discover ${i.discover_clicks}/${i.discover_impressions}`)}${pill(`News ${i.google_news_clicks}/${i.google_news_impressions}`)}<span>${fmt(i.published_at)} · ${i.age_days} gün önce</span></div>`).join('')}</div>` : empty(mode === 'discover' ? 'Son 14 günde Discover sinyali yok.' : 'Son 14 günde Google News sinyali yok.');
    const totals = data.totals || {}; const model = data.model || {};
    const evaluation=model.metrics?.evaluation||{};
    return `<div class="tb-i-actions"><button data-action="sync_gsc">Search Console'u eşzamanla</button><button data-action="train_model">Modeli yeniden eğit</button></div><p>Yalnızca son ${data.window_days || 14} günde yayımlanan yazılar gösterilir. Sıralamada Discover %58, Google News %32, Web %10 ağırlığa sahiptir.</p><div class="tb-i-metrics"><div><b>${totals.discover_clicks || 0}</b><span>Discover tıklaması</span></div><div><b>${totals.discover_impressions || 0}</b><span>Discover gösterimi</span></div><div><b>${totals.news_clicks || 0}</b><span>Google News tıklaması</span></div><div><b>${totals.news_impressions || 0}</b><span>Google News gösterimi</span></div><div><b>${model.sample_count || 0}</b><span>öğrenme örneği</span></div><div><b>%${evaluation.discover?.balanced_accuracy || 0}</b><span>Discover dengeli başarı · F1 %${evaluation.discover?.f1 || 0}</span></div><div><b>%${evaluation.news?.balanced_accuracy || 0}</b><span>News dengeli başarı · F1 %${evaluation.news?.f1 || 0}</span></div><div><b>${model.model_version ? 'Aktif' : 'Bekliyor'}</b><span>${model.model_version ? esc(model.model_version) : 'ilk eğitim gerekli'}</span></div></div><h3>✨ Discover önceliği</h3>${list(data.discover_items, 'discover')}<h3>📰 Google News önceliği</h3>${list(data.news_items, 'news')}`;
  }
  function lab(data) {
    const d = data.distribution || {};
    return `<div class="tb-i-metrics"><div><b>${d.discover_avg ?? 0}</b><span>Discover ort.</span></div><div><b>${d.discover_min ?? 0}–${d.discover_max ?? 0}</b><span>Discover aralığı</span></div><div><b>${d.discover_distinct ?? 0}</b><span>farklı Discover</span></div><div><b>${d.traffic_avg ?? 0}</b><span>Trafik ort.</span></div><div><b>${d.traffic_min ?? 0}–${d.traffic_max ?? 0}</b><span>Trafik aralığı</span></div><div><b>${(d.discover_100 || 0) + (d.traffic_100 || 0)}</b><span>100'e yığılma</span></div></div>${sourceTable((data.sources || []).map((s) => ({ name: s.source_name, quality_score: s.discover_avg, stored_items: s.items, last_item_at: null, last_error: `Trafik ort. ${s.traffic_avg}` })))}`;
  }
  function accuracy(data) {
    const s = data.summary || {}; const model = data.model || {}; const evaluation = model.metrics?.evaluation || {};
    const bucketList = (items, label) => items?.length ? `<div class="tb-i-table">${items.map((i) => { const rate = Math.round((i.successes || 0) / Math.max(1, i.samples || 0) * 100); return `<div><b>%${i.bucket}–${Number(i.bucket) + 9} tahmin</b>${pill(`${i.samples} örnek`)}${pill(`Gerçek başarı %${rate}`, rate >= Number(i.bucket) - 10 ? 'good' : 'bad')}<span>Ortalama ${i.avg_clicks || 0} tıklama · ${esc(label)}</span></div>`; }).join('')}</div>` : empty('Henüz yeterli yayımlanmış tahmin sonucu yok.');
    const recent = data.recent?.length ? `<div class="tb-i-table">${data.recent.map((i) => `<div><b><a href="${esc(i.published_url)}" target="_blank">${esc(i.title || i.published_url)}</a></b>${pill(`Discover tahmin %${Math.round(i.discover_probability || 0)}`)}${pill(`Gerçek ${Math.round(i.discover_clicks || 0)} tıklama`)}<span>Eşleşme %${Math.round(Number(i.match_score || 0) * 100)} · News tahmin %${Math.round(i.news_probability || 0)} / gerçek ${Math.round(i.news_clicks || 0)}</span></div>`).join('')}</div>` : empty('Tahmin–yayın eşleşmesi henüz oluşmadı.');
    return `<div class="tb-i-actions"><button data-action="sync_gsc">Sonuçları eşzamanla</button><button data-action="train_model">Modeli yeniden eğit</button></div><div class="tb-i-metrics"><div><b>${s.matched || 0}</b><span>yayınla eşleşen tahmin</span></div><div><b>${s.observed || 0}</b><span>sonucu gözlenen</span></div><div><b>${s.discover_success || 0}</b><span>Discover başarısı</span></div><div><b>${s.news_success || 0}</b><span>News başarısı</span></div><div><b>${s.avg_expected_clicks || 0}</b><span>ortalama beklenen tıklama</span></div><div><b>${s.avg_actual_clicks || 0}</b><span>ortalama gerçekleşen</span></div><div><b>%${Math.round((evaluation.discover?.recommended_weight || 0) * 100)}</b><span>öğrenmenin Discover etkisi</span></div><div><b>%${Math.round((evaluation.news?.recommended_weight || 0) * 100)}</b><span>öğrenmenin News etkisi</span></div><div><b>${model.metrics?.click_calibration || 1}</b><span>tıklama kalibrasyonu</span></div><div><b>${data.challenger ? 'Korunuyor' : 'Yok'}</b><span>${data.challenger ? `Challenger: ${esc(data.challenger.model_version)}` : 'aktif model en iyi sürüm'}</span></div></div><h3>Discover kalibrasyonu</h3>${bucketList(data.discover_buckets, 'Discover')}<h3>Google News kalibrasyonu</h3>${bucketList(data.news_buckets, 'Google News')}<h3>Son tahminlerin gerçek sonuçları</h3>${recent}`;
  }
  function weekly(data) {
    const channel = (key) => data.channels?.find((item) => item.search_type === key) || {};
    const postList = data.top_posts?.length ? `<div class="tb-i-table">${data.top_posts.map((i) => `<div><b><a href="${esc(i.url)}" target="_blank">${esc(i.title)}</a></b>${pill(`Discover ${i.discover_clicks || 0}`)}${pill(`News ${i.google_news_clicks || 0}`)}<span>${fmt(i.published_at)}</span></div>`).join('')}</div>` : empty('Bu hafta için performans verisi yok.');
    const missed = data.missed_opportunities?.length ? `<div class="tb-i-table">${data.missed_opportunities.map((i) => `<div><b><a href="${esc(i.url)}" target="_blank">${esc(i.title)}</a></b>${pill(`Discover %${i.discover_probability}`)}${pill(`News %${i.news_probability}`)}<span>${esc(i.source_name || '')}</span></div>`).join('')}</div>` : empty('Yüksek puanlı kaçırılmış aday bulunmuyor.');
    return `<div class="tb-i-metrics"><div><b>${channel('discover').clicks || 0}</b><span>haftalık Discover tıklaması</span></div><div><b>${channel('googleNews').clicks || 0}</b><span>haftalık News tıklaması</span></div><div><b>${channel('web').clicks || 0}</b><span>haftalık Web tıklaması</span></div><div><b>${data.outcomes?.matched || 0}</b><span>eşleşen tahmin</span></div><div><b>${data.best_sources?.length || 0}</b><span>güçlü kaynak</span></div><div><b>${data.weak_sources?.length || 0}</b><span>ilgi isteyen kaynak</span></div></div><h3>Kazanan konular</h3><div>${(data.winning_topics || []).map((i) => pill(`${i.topic} · ${Math.round(i.score)}`, 'good')).join('') || '—'}</div><h3>Haftanın en iyi yazıları</h3>${postList}<h3>Kaçırılmış yüksek potansiyelli adaylar</h3>${missed}`;
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
    if (state.tab === 'early') return data.items?.length ? cards(data.items, 'early') : empty('Şu anda rakiplerden önce yakalanmış tek kaynaklı bir sinyal yok.');
    if (state.tab === 'clusters') return data.items?.length ? cards(data.items, 'clusters') : empty('Şu anda en az iki bağımsız kaynakla doğrulanmış yükselen konu yok.');
    if (state.tab === 'lifecycle') return lifecycle(data);
    if (state.tab === 'coverage') return cards(data.items, 'coverage');
    if (state.tab === 'queue') return queue(data.items);
    if (state.tab === 'sources') return sourceTable(data.items);
    if (state.tab === 'performance') return performance(data);
    if (state.tab === 'pioneer') return pioneer(data);
    if (state.tab === 'accuracy') return accuracy(data);
    if (state.tab === 'weekly') return weekly(data);
    if (state.tab === 'lab') return lab(data);
    if (state.tab === 'leadership') return leadership(data);
    if (state.tab === 'watchlists') return watchlists(data);
    return system(data);
  }
  function render() {
    const root = document.getElementById('tb-intelligence-root'); if (!root) return;
    const activeGroup = groups.find((group) => group.views.includes(state.tab)) || groups[0];
    root.innerHTML = `<style>
      #tb-intelligence-root{padding:0;overflow:hidden}.tb-i-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;padding:20px;background:linear-gradient(135deg,#111827,#1e293b 58%,#312e81);color:#fff}.tb-i-hero h2{font:800 30px/1 'Fira Sans Condensed',sans-serif;margin:0 0 8px}.tb-i-hero p{max-width:720px;margin:0;color:#cbd5e1;font-size:13px;line-height:1.55}.tb-i-reload{border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.1);color:#fff;border-radius:11px;padding:9px 12px;font-weight:900;cursor:pointer}
      .tb-i-groups{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0}.tb-i-group{display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid #dbe3ef;background:#fff;color:#334155;border-radius:13px;padding:10px;font-size:12px;font-weight:900;cursor:pointer}.tb-i-group.on{border-color:#f04a0a;background:#fff1eb;color:#c2410c;box-shadow:0 5px 14px rgba(240,74,10,.1)}
      .tb-i-subnav,.tb-i-actions,.tb-i-card .tb-i-actions{display:flex;gap:7px;flex-wrap:wrap}.tb-i-subnav{padding:13px 16px 0;overflow:auto}.tb-i-subnav button,.tb-i-actions button,.tb-i-actions a,.tb-i-card button,.tb-i-card a,.tb-i-table button,.tb-i-table a,.tb-i-callout button{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:10px;padding:8px 10px;font-size:11px;font-weight:900;text-decoration:none;cursor:pointer}.tb-i-subnav button.on{border-color:#4338ca;background:#4338ca;color:#fff}.tb-i-view-note{margin:12px 16px 0;padding:10px 12px;border-left:4px solid #6366f1;border-radius:9px;background:#eef2ff;color:#475569;font-size:12px;line-height:1.5}.tb-i-content{padding:16px}
      .tb-i-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0}.tb-i-metrics>div{border:1px solid #e2e8f0;border-radius:15px;padding:13px;background:#f8fafc}.tb-i-metrics b{font-size:25px;display:block;color:#111827}.tb-i-metrics span,.tb-i-card p,.tb-i-table span{font-size:12px;color:#64748b}.tb-i-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}.tb-i-card{border:1px solid #e2e8f0;border-radius:17px;overflow:hidden;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.05)}.tb-i-img{width:100%;aspect-ratio:16/9;object-fit:cover;background:#f1f5f9}.tb-i-body{padding:13px}.tb-i-card h3{font-size:18px;line-height:1.25;margin:8px 0}.tb-i-reasons{padding-left:18px;margin:8px 0;color:#475569;font-size:12px;line-height:1.45}.tb-i-pill{display:inline-block;border-radius:999px;padding:4px 7px;margin:2px;background:#eef2ff;color:#3730a3;font-size:10px;font-weight:900}.tb-i-pill.hot{background:#ffedd5;color:#c2410c}.tb-i-pill.good{background:#dcfce7;color:#166534}.tb-i-pill.bad{background:#fee2e2;color:#991b1b}.tb-i-table{display:grid;gap:8px}.tb-i-table>div{display:grid;grid-template-columns:auto auto auto 1fr;gap:8px;align-items:center;border:1px solid #e2e8f0;border-radius:13px;padding:10px;background:#fff}.tb-i-table img{width:70px;height:46px;object-fit:cover;border-radius:8px}.tb-i-table nav{grid-column:1/-1;display:flex;gap:5px;flex-wrap:wrap}.tb-i-empty,.tb-i-callout{padding:16px;border:1px dashed #c7d2fe;border-radius:14px;color:#64748b;background:#f8fafc}.tb-i-form{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:10px;margin-top:14px}.tb-i-form label{display:grid;gap:5px;font-size:12px;font-weight:800;color:#334155}.tb-i-form input{border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:#fff;min-width:0}.tb-i-form button{align-self:end}.tb-i-progress{height:11px;background:#e2e8f0;border-radius:999px;overflow:hidden}.tb-i-progress i{display:block;height:100%;background:linear-gradient(90deg,#f04a0a,#22c55e)}.tb-i-details{display:grid;gap:6px;margin:10px 0}.tb-i-details details,.tb-i-feedback{border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#f8fafc;font-size:12px}.tb-i-details summary,.tb-i-feedback summary{font-weight:900;cursor:pointer;color:#334155}.tb-i-details ul{padding-left:18px;line-height:1.5}.tb-i-feedback{margin-top:9px}.tb-i-feedback button{margin:7px 4px 0 0}.tb-i-timeline{border-left:3px solid #c7d2fe;margin-left:8px;padding-left:18px;display:grid;gap:12px}.tb-i-timeline>div{position:relative;display:grid;gap:3px}.tb-i-timeline i{position:absolute;width:11px;height:11px;border-radius:50%;background:#4f46e5;left:-25px;top:4px}.tb-i-timeline span{font-size:12px;color:#64748b}.tb-i-watch-grid{display:grid;gap:14px}.tb-i-watch-grid>section{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:14px}.tb-i-watch-grid header{display:flex;justify-content:space-between;gap:10px}.tb-i-watch-grid header p{font-size:11px;color:#64748b;margin:4px 0}
      @media(max-width:800px){.tb-i-groups{grid-template-columns:repeat(2,minmax(0,1fr))}.tb-i-hero{padding:16px}.tb-i-content{padding:12px}.tb-i-table>div,.tb-i-form{grid-template-columns:1fr}.tb-i-table nav{grid-column:1}.tb-i-grid{grid-template-columns:1fr}}@media(max-width:460px){.tb-i-groups{grid-template-columns:1fr}.tb-i-group{justify-content:flex-start}}
    </style><div class="tb-i-hero"><div><h2>🎯 Editoryal Karar Merkezi</h2><p>Trend/Karar, Editoryal, Intelligence ve Operasyon araçlarının güncel, tek çalışma alanı. Sinyali yakala, kararı ver, göreve dönüştür ve gerçek performanstan öğren.</p></div><button class="tb-i-reload" data-reload>↻ Bu görünümü yenile</button></div><div class="tb-i-groups">${groups.map((group) => `<button class="tb-i-group ${group.key === activeGroup.key ? 'on' : ''}" data-i-group="${group.key}"><span>${group.icon}</span>${group.label}</button>`).join('')}</div><div class="tb-i-subnav">${activeGroup.views.map((key) => `<button class="${key === state.tab ? 'on' : ''}" data-i-tab="${key}">${sections[key][0]}</button>`).join('')}</div><div class="tb-i-view-note">${esc(descriptions[state.tab] || '')}</div><div class="tb-i-content" id="tb-i-content">${content()}</div>`;
  }
  async function load(tab = state.tab, force = false) {
    state.tab = sections[tab] ? tab : 'today'; state.error = '';
    localStorage.setItem(VIEW_KEY, state.tab);
    if (state.data[tab] && !force) { render(); return; }
    state.loading = true; render();
    try {
      state.data[tab] = await get(sections[tab][1]);
      if (tab === 'performance') state.data[tab].oauth = await google();
    } catch (e) { state.error = e.message || String(e); }
    finally { state.loading = false; render(); }
  }
  document.addEventListener('click', async (event) => {
    const group = event.target.closest('[data-i-group]');
    if (group) { const target = groups.find((item) => item.key === group.dataset.iGroup); if (target) return load(target.views[0]); }
    const tab = event.target.closest('[data-i-tab]'); if (tab) return load(tab.dataset.iTab);
    if (event.target.closest('[data-reload]')) return load(state.tab, true);
    const queued = event.target.closest('[data-queue],[data-add-queue]');
    if (queued) { try { await post({ action: 'queue_upsert', ...JSON.parse(queued.dataset.queue || queued.dataset.addQueue) }); queued.textContent = 'Eklendi'; state.data.queue = null; } catch (e) { alert(e.message); } return; }
    const slack = event.target.closest('[data-slack]');
    if (slack) {
      slack.disabled = true;
      try {
        const item = JSON.parse(slack.dataset.slack || '{}');
        const response = await fetch('/api/push-to-slack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [item] }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.error || data.errors?.[0] || `HTTP ${response.status}`);
        await post({ action: 'queue_upsert', ...item });
        slack.textContent = '✓ Slack’e gönderildi'; state.data.queue = null;
      } catch (e) { slack.disabled = false; alert(`Slack hatası: ${e.message || e}`); }
      return;
    }
    const copy = event.target.closest('[data-copy-brief]');
    if (copy) { try { const label = copy.textContent; await navigator.clipboard.writeText(copy.dataset.copyBrief || ''); copy.textContent = '✓ Kopyalandı'; setTimeout(() => { copy.textContent = label; }, 1400); } catch (e) { alert(`Kopyalama hatası: ${e.message || e}`); } return; }
    const feedback = event.target.closest('[data-feedback]');
    if (feedback) {
      feedback.disabled = true;
      try {
        const item = JSON.parse(feedback.dataset.item || '{}');
        const reasons = { useful: 'useful_signal', duplicate: 'duplicate_story', unreliable: 'source_unreliable', skipped: 'not_relevant' };
        await post({ action: 'feedback_record', ...item, decision: feedback.dataset.feedback, reason_code: reasons[feedback.dataset.feedback] || feedback.dataset.feedback });
        feedback.textContent = '✓ Kaydedildi';
      } catch (e) { feedback.disabled = false; alert(e.message); }
      return;
    }
    const watchSave = event.target.closest('[data-watch-save]');
    if (watchSave) {
      watchSave.disabled = true;
      try {
        await post({ action: 'watchlist_upsert', name: document.getElementById('tb-watch-name')?.value || '', keywords: document.getElementById('tb-watch-keywords')?.value || '', alert_threshold: Number(document.getElementById('tb-watch-threshold')?.value || 65) }, true);
        state.data.watchlists = null; await load('watchlists', true);
      } catch (e) { alert(e.message); } finally { watchSave.disabled = false; }
      return;
    }
    const status = event.target.closest('[data-status]');
    if (status) { try { const item = JSON.parse(status.dataset.item); const publishedUrl = status.dataset.status === 'published' ? window.prompt('Teknoblog yayın URL’si', item.published_url || '') : item.published_url; if (status.dataset.status === 'published' && !publishedUrl) return; await post({ action: 'queue_upsert', ...item, status: status.dataset.status, published_url: publishedUrl || null }); await load('queue', true); } catch (e) { alert(e.message); } return; }
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
  window.addEventListener('tb-spa-tab-change', (event) => { if (event.detail?.tab === 'decision-center' && !state.data[state.tab]) load(state.tab); });
  function start() { render(); if (location.hash === '#decision-center' || ['#decision', '#editorial', '#intelligence', '#ops'].includes(location.hash)) load(state.tab); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
