(() => {
  const root = document.getElementById('tb-editorial-dashboard-root');
  if (!root) return;
  const labels = { write_now: 'Şimdi Yaz', rising: 'Yükseliyor', update: 'Güncelle', produce: 'Üret' };
  const signalLabels = { freshness: 'Güncellik', discover: 'Discover', turkey_interest: 'Türkiye', source_quality: 'Kaynak', spread_velocity: 'Yayılma', teknoblog_fit: 'Uyum' };
  const eventLabels = { detected: 'İlk kez görüldü', corroborated: 'İkinci akış kaynağı görüldü', lane_changed: 'Karar kuyruğu değişti', official_source_seen: 'Resmî kaynak akışa eklendi', second_wave: 'Yeni yayılma dalgası' };
  const researchLabels = { official_source_seen: 'Akışta resmî kaynak var', multiple_sources: 'Birden fazla akış kaynağı var', single_source: 'Tek akış kaynağı var' };
  const reviewLabels = { unreviewed: 'İncelenmedi', researching: 'Araştırılıyor', ready: 'Yayına hazır', hold: 'Beklet' };
  const saturationLabels = { low: 'düşük', medium: 'orta', high: 'yüksek' };
  const beatLabels = { apple: 'Apple', android_mobile: 'Android / mobil', ai: 'Yapay zekâ', gaming: 'Oyun', apps: 'Uygulamalar', hardware: 'Donanım', other: 'Diğer' };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const safeUrl = (value) => /^https?:\/\//i.test(String(value || '')) ? escape(value) : '#';
  const date = (value) => value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(value)) : '—';
  let loaded = false;
  let cardsById = new Map();
  let reviewsById = new Map();
  let aiDraftsById = new Map();
  let aiConfigured = false;

  function opportunityDetails(item) {
    const formats = item.content_opportunities || [];
    if (!formats.length) return '';
    return `<details class="tb-ed-formats"><summary>İçerik fırsatları · ${formats.length}</summary><ol>${formats.map((format) => `<li><b>${escape(format.label)}</b> <small>${escape(format.confidence)}</small><p>${escape(format.reason)}</p>${format.checks?.length ? `<p><strong>Kontrol:</strong> ${escape(format.checks.join(' '))}</p>` : ''}</li>`).join('')}</ol><button type="button" class="tb-small-btn" data-brief-id="${escape(item.id)}">Araştırma briefini kopyala</button></details>`;
  }

  function briefFor(item) {
    return [`Konu: ${item.title}`, `Kaynak: ${item.url}`, `Karar puanı: ${item.score}`,
      `Kaynak durumu: ${researchLabels[item.research?.status] || 'Kaynaklar incelenmeli'}`,
      `İzlenen rakip yayılımı: ${saturationLabels[item.market_context?.monitored_saturation] || 'bilinmiyor'} (${item.market_context?.monitored_competitor_count || 0} kaynak)`,
      `Önerilen içerik zinciri: ${(item.content_opportunities || []).map((format) => format.label).join(' → ')}`,
      '', 'Format gerekçeleri:', ...(item.content_opportunities || []).map((format) => `- ${format.label}: ${format.reason}`),
      '', 'Doğrulanacaklar:', ...(item.research?.checks || []).map((check) => `- ${check}`),
      '', 'Kaynakların bildirdiği başlıklar (henüz doğrulanmış olgu değil):',
      ...(item.research?.sources || []).map((source) => `- ${source.name}: ${source.title} (${source.published_at || 'tarih bilinmiyor'}) ${source.url}`)].join('\n');
  }

  function researchDetails(item) {
    const research = item.research;
    if (!research) return '';
    return `<details class="tb-ed-research"><summary>Araştırma dosyası · ${escape(researchLabels[research.status] || 'Kaynaklar incelenmeli')}</summary>
      <p>Listelenen ${escape(research.source_count)} kaynak; ${escape(research.official_source_count)} resmî kaynak kaydı. Başlıklar kaynakların iddiasını gösterir.</p>
      <ol>${research.sources.map((source) => `<li><span>${date(source.published_at)} · ${escape(source.name)}${source.type === 'official' ? ' · resmî kaynak' : ''}</span><br><a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a></li>`).join('')}</ol>
      ${(research.possible_discrepancies || []).map((difference) => `<p><strong>Rakam kontrolü (${escape(difference.unit)}):</strong> ${difference.mentions.map((mention) => `${escape(mention.source_name)} ${escape(mention.value)}`).join(' · ')}. Farklı model veya sürüm olabilir.</p>`).join('')}
      <strong>Doğrulanacaklar</strong><ul>${research.checks.map((check) => `<li>${escape(check)}</li>`).join('')}</ul>
      <button type="button" class="tb-small-btn" data-origin-id="${escape(item.id)}">İlk kaynak bağlantılarını ara</button><div class="tb-ed-origin-result" aria-live="polite"></div></details>`;
  }

  function packageText(item) {
    const packet = item.production_package;
    if (!packet) return '';
    return [`Konu: ${item.title}`, `Durum: Editör doğrulaması gerekli`, `Dayanak: ${packet.basis}`,
      '', 'Başlık taslakları:', ...packet.headline_drafts.map((draft) => `- ${draft.angle}: ${draft.text}`),
      '', `SEO başlığı taslağı: ${packet.seo_title_draft}`, `Slug taslağı: ${packet.slug_draft}`,
      `Meta açıklama taslağı: ${packet.meta_description_draft}`, `Sosyal metin taslağı: ${packet.social_draft}`,
      `Görsel: ${packet.image?.url || 'Kaynak görseli yok'} (kullanım hakkı doğrulanmadı)`,
      '', 'Yayın öncesi:', ...packet.before_publish.map((check) => `- ${check}`),
      '', 'Kaynaklar:', ...(item.research?.sources || []).map((source) => `- ${source.name}: ${source.url}`)].join('\n');
  }

  function productionDetails(item) {
    const packet = item.production_package;
    if (!packet) return '';
    return `<details class="tb-ed-package"><summary>Yayın hazırlığı · editör kontrolü gerekli</summary><p>${escape(packet.basis)} Taslaklar doğrudan yayımlanmamalı.</p>
      <strong>Başlık taslakları</strong><ol>${packet.headline_drafts.map((draft) => `<li><span>${escape(draft.angle)}</span><br>${escape(draft.text)}</li>`).join('')}</ol>
      <p><strong>SEO:</strong> ${escape(packet.seo_title_draft)}${packet.seo_title_length > 70 ? ' · uzunluk kontrolü gerekli' : ''}</p>
      <p><strong>Slug:</strong> ${escape(packet.slug_draft)}</p><p><strong>Meta:</strong> ${escape(packet.meta_description_draft)}</p>
      <p><strong>Sosyal:</strong> ${escape(packet.social_draft)}</p>
      <p><strong>Görsel:</strong> ${packet.image ? `<a href="${safeUrl(packet.image.url)}" target="_blank" rel="noopener noreferrer">Kaynağı aç</a> · kullanım hakkı doğrulanmadı` : 'Kaynak görseli yok'}</p>
      <button type="button" class="tb-small-btn" data-package-id="${escape(item.id)}">Paketi kopyala</button>${aiConfigured ? ` <button type="button" class="tb-small-btn" data-ai-id="${escape(item.id)}">Türkçe AI taslağı hazırla</button><div class="tb-ed-ai-result" aria-live="polite"></div>` : ''}</details>`;
  }

  function aiText(result) {
    const draft = result.draft;
    return [`Konu: ${cardsById.get(result.story_id)?.title || ''}`, 'Durum: Editör doğrulaması gerekli',
      '', 'Discover başlıkları:', ...draft.discover_titles.map((title, index) => `${index + 1}. ${title}`),
      '', `SEO başlığı: ${draft.seo_title}`, `Giriş taslağı: ${draft.intro_draft}`,
      `Slug: ${draft.slug}`, `Meta açıklama: ${draft.meta_description}`, `Sosyal metin: ${draft.social_text}`,
      `Doğrulama notu: ${draft.verification_note}`, '', 'Kaynaklar:',
      ...(result.sources || []).map((source) => `- ${source.name}: ${source.url}`)].join('\n');
  }

  function aiResultHtml(result) {
    const draft = result.draft;
    return `<p><strong>AI taslağı · editör doğrulaması gerekli</strong></p><ol>${draft.discover_titles.map((title) => `<li>${escape(title)}</li>`).join('')}</ol>
      <p><strong>SEO:</strong> ${escape(draft.seo_title)}</p><p><strong>Giriş:</strong> ${escape(draft.intro_draft)}</p>
      <p><strong>Slug:</strong> ${escape(draft.slug)}</p><p><strong>Meta:</strong> ${escape(draft.meta_description)}</p>
      <p><strong>Sosyal:</strong> ${escape(draft.social_text)}</p><p><strong>Doğrulama:</strong> ${escape(draft.verification_note)}</p>
      <button type="button" class="tb-small-btn" data-ai-copy="${escape(result.story_id)}">AI taslağını kopyala</button>`;
  }

  function card(item) {
    const signals = Object.entries(item.signals || {}).map(([key, value]) => `<span>${escape(signalLabels[key] || key)} <b>${escape(value)}</b></span>`).join('');
    const review = reviewsById.get(item.id)?.status || 'unreviewed';
    const market = item.market_context;
    return `<article class="tb-ed-card"><div class="tb-ed-top"><b>${escape(item.score)}</b><span>${escape(beatLabels[item.beat] || 'Diğer')} · ${escape(item.source_count)} kaynak · ${date(item.last_seen_at)}</span></div>
      <h3><a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title)}</a></h3>
      ${item.published_match ? `<p><strong>✓ Teknoblog’da yayımlandı:</strong> <a href="${safeUrl(item.published_match.url)}" target="_blank" rel="noopener noreferrer">${escape(item.published_match.title)}</a><br><small>Teknoblog yayım tarihi: ${item.published_match.published_at ? date(item.published_match.published_at) : 'Bilinmiyor'}</small></p>` : item.publication_checked ? '<p>Teknoblog arşivinde güçlü eşleşme bulunmadı.</p>' : '<p>Teknoblog arşivi güncel değil; yayın durumu doğrulanamadı.</p>'}
      <div class="tb-ed-signals">${signals}</div>${market ? `<p class="tb-ed-market">İzlenen rakip yayılımı: <b>${escape(saturationLabels[market.monitored_saturation] || 'bilinmiyor')}</b> · ${escape(market.monitored_competitor_count)} rakip kaynak${market.monitored_competitor_gap ? ' · <b>İzlenen rakiplerde henüz görünmedi</b>' : ''}<br><small>${escape(market.scope_note)}</small></p>` : ''}<label class="tb-ed-review">Editör kararı <select data-review-id="${escape(item.id)}">${Object.entries(reviewLabels).map(([key, label]) => `<option value="${key}"${review === key ? ' selected' : ''}>${label}</option>`).join('')}</select></label><span class="tb-ed-review-message" aria-live="polite"></span>${item.calibration?.adjustment ? `<p>Benzer yayın performansı: ${item.calibration.adjustment > 0 ? '+' : ''}${escape(item.calibration.adjustment)} uyum puanı · ${escape(item.calibration.matched_samples)} örnek</p>` : ''}${opportunityDetails(item)}${researchDetails(item)}${productionDetails(item)}${item.history?.length ? `<details><summary>Konu geçmişi</summary><ul>${item.history.map((event) => `<li>${date(event.occurred_at)} · ${escape(eventLabels[event.event_type] || event.event_type)}${event.event_type === 'lane_changed' ? `: ${escape(labels[event.from_lane] || 'İzle')} → ${escape(labels[event.to_lane] || 'İzle')}` : ''}</li>`).join('')}</ul></details>` : ''}</article>`;
  }

  async function load(force = false) {
    root.innerHTML = '<p>Güncel karar kuyrukları yükleniyor…</p>';
    try {
      const [response, reviewResponse, insightsResponse, aiResponse] = await Promise.all([
        fetch(`/api/editorial-dashboard${force ? '?refresh=1' : ''}`, { cache: 'no-store' }),
        fetch('/api/editorial-review', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null),
        fetch('/api/editorial-insights', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null),
        fetch('/api/editorial-ai', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null)
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const reviewData = reviewResponse?.ok ? await reviewResponse.json() : {};
      const insightsData = insightsResponse?.ok ? await insightsResponse.json() : {};
      aiConfigured = aiResponse?.ok ? Boolean((await aiResponse.json()).configured) : false;
      reviewsById = new Map((reviewData.reviews || []).map((review) => [review.story_id, review]));
      cardsById = new Map([...Object.values(data.lanes || {}).flat(), ...(data.recent || [])].map((item) => [item.id, item]));
      root.innerHTML = `<div class="tb-ed-head"><div><h2>Editoryal Akış</h2><p>Son 72 saatin haberleri; altı sinyalle puanlanır. ${data.model?.performance_status === 'active' ? `${escape(data.model.performance_samples)} geçmiş yayın örneği uyum puanına sınırlı katkı verir.` : 'Geçmiş performans için yeterli örnek bulunmadığında temel puan kullanılır.'} Karar önerileri editör kontrolü gerektirir.</p></div><button type="button" id="tb-ed-reload" class="tb-small-btn">Yenile</button></div>
        ${data.portfolio?.total ? `<p class="tb-ed-insights">Konu dağılımı: ${Object.entries(data.portfolio.beats).sort((a, b) => b[1] - a[1]).map(([beat, count]) => `${escape(beatLabels[beat] || 'Diğer')} ${escape(count)}`).join(' · ')}${data.portfolio.concentrated ? `. ${escape(beatLabels[data.portfolio.dominant_beat] || 'Bir konu alanı')} akışın %${escape(data.portfolio.dominant_share)} kadarını oluşturuyor.` : ''}</p>` : ''}
        ${insightsData.evaluation ? `<p class="tb-ed-insights">Karar ölçümü: ${insightsData.evaluation.status === 'active' ? `Yüksek puanlı ${escape(insightsData.evaluation.high_priority.decisions)} konunun %${escape(insightsData.evaluation.high_priority.publication_rate)} kadarı yayımlandı; diğer ${escape(insightsData.evaluation.other.decisions)} konunun %${escape(insightsData.evaluation.other.publication_rate)} kadarı yayımlandı.` : `${escape(insightsData.evaluation.sample_count)} olgunlaşmış karar kaydı var; karşılaştırma için veri birikiyor.`} ${escape(insightsData.evaluation.note)}</p>` : ''}
        ${insightsData.review_timing?.sample_count ? `<p class="tb-ed-insights">Araştırmadan yayına hazır karara medyan süre: ${escape(insightsData.review_timing.median_hours_to_ready)} saat (${escape(insightsData.review_timing.sample_count)} tamamlanan konu).</p>` : ''}
        ${data.warning ? `<p role="status">${escape(data.warning)}</p>` : ''}
        <div class="tb-ed-grid">${Object.entries(labels).map(([key, label]) => `<section class="tb-ed-lane"><h3>${label} <small>${escape(data.counts?.[key] || 0)}</small></h3>${(data.lanes?.[key] || []).slice(0, 20).map(card).join('') || '<p>Şu anda öneri yok.</p>'}</section>`).join('')}</div>
        ${(data.recent || []).length ? `<section class="tb-ed-recent"><h3>Diğer güncel haberler <small>${escape(data.recent.length)} gösteriliyor · toplam ${escape(data.scanned_count)} konu tarandı</small></h3><p>Karar eşiklerini geçmeyen konular da burada görülebilir.</p><div class="tb-ed-grid">${data.recent.map(card).join('')}</div></section>` : ''}`;
      root.querySelector('#tb-ed-reload')?.addEventListener('click', () => load(true));
      loaded = true;
    } catch (error) {
      root.innerHTML = `<p role="alert">Editoryal akış yüklenemedi: ${escape(error.message || error)}</p><button type="button" id="tb-ed-retry" class="tb-small-btn">Tekrar dene</button>`;
      root.querySelector('#tb-ed-retry')?.addEventListener('click', () => load(true));
    }
  }

  root.addEventListener('click', async (event) => {
    const originButton = event.target.closest('[data-origin-id]');
    if (originButton) {
      const storyId = originButton.getAttribute('data-origin-id');
      const target = originButton.closest('.tb-ed-research')?.querySelector('.tb-ed-origin-result');
      originButton.disabled = true;
      if (target) target.textContent = 'Kaynak bağlantıları taranıyor…';
      try {
        const response = await fetch('/api/editorial-origin', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story_id: storyId }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (target) target.innerHTML = `<p>${escape(result.note)}</p>${result.candidates.length
          ? `<ul>${result.candidates.map((candidate) => `<li><a href="${safeUrl(candidate.url)}" target="_blank" rel="noopener noreferrer">${escape(candidate.official_name)}</a> · ${escape(candidate.anchor_text || 'Bağlantı')}${candidate.status === 'monitored_official_source' ? ' · izlenen resmî kaynak' : ' · haber sayfasından bağlantı'}</li>`).join('')}</ul>`
          : '<p>İzlenen resmî alan adlarına bağlantı bulunamadı.</p>'}`;
      } catch (error) { if (target) target.textContent = `Kaynak taranamadı: ${error.message || error}`; }
      finally { originButton.disabled = false; }
      return;
    }
    const aiCopy = event.target.closest('[data-ai-copy]');
    if (aiCopy) {
      const result = aiDraftsById.get(aiCopy.getAttribute('data-ai-copy'));
      if (!result) return;
      try { await navigator.clipboard.writeText(aiText(result)); aiCopy.textContent = 'Kopyalandı'; }
      catch { aiCopy.textContent = 'Kopyalanamadı'; }
      return;
    }
    const aiButton = event.target.closest('[data-ai-id]');
    if (aiButton) {
      const storyId = aiButton.getAttribute('data-ai-id');
      const target = aiButton.closest('.tb-ed-package')?.querySelector('.tb-ed-ai-result');
      aiButton.disabled = true;
      if (target) target.textContent = 'Türkçe taslak hazırlanıyor…';
      try {
        const response = await fetch('/api/editorial-ai', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story_id: storyId }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        aiDraftsById.set(storyId, result);
        if (target) target.innerHTML = aiResultHtml(result);
      } catch (error) { if (target) target.textContent = `Taslak hazırlanamadı: ${error.message || error}`; }
      finally { aiButton.disabled = false; }
      return;
    }
    const packageButton = event.target.closest('[data-package-id]');
    if (packageButton) {
      const item = cardsById.get(packageButton.getAttribute('data-package-id'));
      if (!item) return;
      try {
        await navigator.clipboard.writeText(packageText(item));
        packageButton.textContent = 'Kopyalandı';
        setTimeout(() => { packageButton.textContent = 'Paketi kopyala'; }, 2000);
      } catch { packageButton.textContent = 'Kopyalanamadı'; }
      return;
    }
    const button = event.target.closest('[data-brief-id]');
    if (!button) return;
    const item = cardsById.get(button.getAttribute('data-brief-id'));
    if (!item) return;
    try {
      await navigator.clipboard.writeText(briefFor(item));
      button.textContent = 'Kopyalandı';
      setTimeout(() => { button.textContent = 'Araştırma briefini kopyala'; }, 2000);
    } catch { button.textContent = 'Kopyalanamadı'; }
  });

  root.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-review-id]');
    if (!select) return;
    const storyId = select.getAttribute('data-review-id');
    const previous = reviewsById.get(storyId)?.status || 'unreviewed';
    const message = select.closest('.tb-ed-card')?.querySelector('.tb-ed-review-message');
    select.disabled = true;
    if (message) message.textContent = 'Kaydediliyor…';
    try {
      const response = await fetch('/api/editorial-review', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story_id: storyId, status: select.value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (data.status === 'unreviewed') reviewsById.delete(storyId);
      else reviewsById.set(storyId, data);
      if (message) message.textContent = 'Kaydedildi';
    } catch (error) {
      select.value = previous;
      if (message) message.textContent = `Kaydedilemedi: ${error.message || error}`;
    } finally { select.disabled = false; }
  });

  const style = document.createElement('style');
  style.textContent = `.tb-ed-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}.tb-ed-head h2{margin:0 0 6px}.tb-ed-head p{margin:0;color:#64748b}.tb-ed-grid{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:14px;align-items:start}.tb-ed-recent{margin-top:24px;border-top:1px solid #dbe3ef;padding-top:18px}.tb-ed-recent>h3{margin:0 0 4px}.tb-ed-recent>p{color:#64748b;font-size:12px}.tb-ed-recent .tb-ed-grid{grid-template-columns:repeat(3,minmax(220px,1fr))}.tb-ed-lane{background:#f4f7fb;border:1px solid #dbe3ef;border-radius:16px;padding:12px;min-height:180px}.tb-ed-lane>h3{margin:2px 2px 14px;display:flex;justify-content:space-between}.tb-ed-lane small{background:#dce8f8;padding:2px 8px;border-radius:20px}.tb-ed-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:10px;box-shadow:0 2px 8px #0f172a0a}.tb-ed-card h3{font-size:15px;line-height:1.35;margin:10px 0}.tb-ed-card a{color:#173c72}.tb-ed-card p{font-size:12px}.tb-ed-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#64748b}.tb-ed-top b{font-size:18px;color:#0f766e}.tb-ed-signals{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0}.tb-ed-signals span{font-size:11px;background:#edf2f7;border-radius:6px;padding:3px 5px}.tb-ed-card details{font-size:12px}.tb-ed-card ul{padding-left:18px}.tb-ed-formats ol,.tb-ed-research ol{padding-left:19px}.tb-ed-formats li,.tb-ed-research li{margin:8px 0}.tb-ed-formats li p{margin:3px 0;color:#475569}.tb-ed-formats small{color:#0f766e}.tb-ed-research span{color:#64748b}@media(max-width:1200px){.tb-ed-grid,.tb-ed-recent .tb-ed-grid{grid-template-columns:repeat(2,minmax(220px,1fr))}}@media(max-width:650px){.tb-ed-grid,.tb-ed-recent .tb-ed-grid{grid-template-columns:1fr}}`;
  style.textContent += '.tb-ed-review{display:flex;align-items:center;justify-content:space-between;font-size:12px;gap:6px;margin:8px 0}.tb-ed-review select{max-width:140px;padding:4px;border:1px solid #cbd5e1;border-radius:7px;background:#fff}.tb-ed-review-message{font-size:11px;color:#0f766e}';
  style.textContent += '.tb-ed-market{background:#f0fdfa;border-radius:8px;padding:6px;color:#115e59}.tb-ed-market small{color:#64748b}';
  style.textContent += '.tb-ed-package ol{padding-left:19px}.tb-ed-package li{margin:8px 0}.tb-ed-package li span{color:#64748b}.tb-ed-package p{overflow-wrap:anywhere}';
  style.textContent += '.tb-ed-insights{font-size:12px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px;margin:0 0 14px}';
  style.textContent += '.tb-ed-ai-result{margin-top:10px;padding-top:8px;border-top:1px solid #cbd5e1}.tb-ed-ai-result p{overflow-wrap:anywhere}';
  style.textContent += '.tb-ed-origin-result{margin-top:8px}.tb-ed-origin-result li{overflow-wrap:anywhere}';
  document.head.appendChild(style);
  window.addEventListener('tb-spa-tab-change', (event) => {
    if (event.detail?.tab === 'editorial-dashboard' && !loaded) load();
  });
  if (location.hash === '#editorial-dashboard') load();
})();
