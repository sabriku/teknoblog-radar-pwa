(() => {
  const root = document.getElementById('tb-editorial-dashboard-root');
  if (!root) return;
  const labels = { write_now: 'Şimdi Yaz', rising: 'Yükseliyor', update: 'Güncelle', produce: 'Üret' };
  const signalLabels = { freshness: 'Güncellik', discover: 'Discover', turkey_interest: 'Türkiye', source_quality: 'Kaynak', spread_velocity: 'Yayılma', teknoblog_fit: 'Uyum' };
  const eventLabels = { detected: 'İlk kez görüldü', corroborated: 'İkinci kaynak doğruladı', lane_changed: 'Karar kuyruğu değişti' };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const safeUrl = (value) => /^https?:\/\//i.test(String(value || '')) ? escape(value) : '#';
  const date = (value) => value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(value)) : '—';
  let loaded = false;
  let cardsById = new Map();

  function opportunityDetails(item) {
    const formats = item.content_opportunities || [];
    if (!formats.length) return '';
    return `<details class="tb-ed-formats"><summary>İçerik fırsatları · ${formats.length}</summary><ol>${formats.map((format) => `<li><b>${escape(format.label)}</b> <small>${escape(format.confidence)}</small><p>${escape(format.reason)}</p>${format.checks?.length ? `<p><strong>Kontrol:</strong> ${escape(format.checks.join(' '))}</p>` : ''}</li>`).join('')}</ol><button type="button" class="tb-small-btn" data-brief-id="${escape(item.id)}">Araştırma briefini kopyala</button></details>`;
  }

  function briefFor(item) {
    return [`Konu: ${item.title}`, `Kaynak: ${item.url}`, `Karar puanı: ${item.score}`,
      `Önerilen içerik zinciri: ${(item.content_opportunities || []).map((format) => format.label).join(' → ')}`,
      '', 'Format gerekçeleri:', ...(item.content_opportunities || []).map((format) => `- ${format.label}: ${format.reason}`),
      '', 'Doğrulanacaklar:', ...[...new Set((item.content_opportunities || []).flatMap((format) => format.checks || []))].map((check) => `- ${check}`),
      '', 'Kaynaklar:', ...(item.sources || []).map((source) => `- ${source.name || 'Kaynak'}: ${source.url}`)].join('\n');
  }

  function card(item) {
    const signals = Object.entries(item.signals || {}).map(([key, value]) => `<span>${escape(signalLabels[key] || key)} <b>${escape(value)}</b></span>`).join('');
    return `<article class="tb-ed-card"><div class="tb-ed-top"><b>${escape(item.score)}</b><span>${escape(item.source_count)} kaynak · ${date(item.last_seen_at)}</span></div>
      <h3><a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title)}</a></h3>
      ${item.published_match ? `<p>Teknoblog: <a href="${safeUrl(item.published_match.url)}" target="_blank" rel="noopener noreferrer">${escape(item.published_match.title)}</a></p>` : ''}
      <div class="tb-ed-signals">${signals}</div>${item.calibration?.adjustment ? `<p>Benzer yayın performansı: ${item.calibration.adjustment > 0 ? '+' : ''}${escape(item.calibration.adjustment)} uyum puanı · ${escape(item.calibration.matched_samples)} örnek</p>` : ''}${opportunityDetails(item)}<details><summary>Kaynakları gör</summary><ul>${(item.sources || []).map((source) => `<li><a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.name || 'Kaynak')}</a> · ${date(source.published_at)}</li>`).join('')}</ul></details>${item.history?.length ? `<details><summary>Konu geçmişi</summary><ul>${item.history.map((event) => `<li>${date(event.occurred_at)} · ${escape(eventLabels[event.event_type] || event.event_type)}${event.event_type === 'lane_changed' ? `: ${escape(labels[event.from_lane] || 'İzle')} → ${escape(labels[event.to_lane] || 'İzle')}` : ''}</li>`).join('')}</ul></details>` : ''}</article>`;
  }

  async function load(force = false) {
    root.innerHTML = '<p>Güncel karar kuyrukları yükleniyor…</p>';
    try {
      const response = await fetch(`/api/editorial-dashboard${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      cardsById = new Map(Object.values(data.lanes || {}).flat().map((item) => [item.id, item]));
      root.innerHTML = `<div class="tb-ed-head"><div><h2>Editoryal Akış</h2><p>Son 72 saatin haberleri; altı sinyalle puanlanır. ${data.model?.performance_status === 'active' ? `${escape(data.model.performance_samples)} geçmiş yayın örneği uyum puanına sınırlı katkı verir.` : 'Geçmiş performans için yeterli örnek bulunmadığında temel puan kullanılır.'} Karar önerileri editör kontrolü gerektirir.</p></div><button type="button" id="tb-ed-reload" class="tb-small-btn">Yenile</button></div>
        ${data.warning ? `<p role="status">${escape(data.warning)}</p>` : ''}
        <div class="tb-ed-grid">${Object.entries(labels).map(([key, label]) => `<section class="tb-ed-lane"><h3>${label} <small>${escape(data.counts?.[key] || 0)}</small></h3>${(data.lanes?.[key] || []).slice(0, 20).map(card).join('') || '<p>Şu anda öneri yok.</p>'}</section>`).join('')}</div>`;
      root.querySelector('#tb-ed-reload')?.addEventListener('click', () => load(true));
      loaded = true;
    } catch (error) {
      root.innerHTML = `<p role="alert">Editoryal akış yüklenemedi: ${escape(error.message || error)}</p><button type="button" id="tb-ed-retry" class="tb-small-btn">Tekrar dene</button>`;
      root.querySelector('#tb-ed-retry')?.addEventListener('click', () => load(true));
    }
  }

  root.addEventListener('click', async (event) => {
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

  const style = document.createElement('style');
  style.textContent = `.tb-ed-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}.tb-ed-head h2{margin:0 0 6px}.tb-ed-head p{margin:0;color:#64748b}.tb-ed-grid{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:14px;align-items:start}.tb-ed-lane{background:#f4f7fb;border:1px solid #dbe3ef;border-radius:16px;padding:12px;min-height:180px}.tb-ed-lane>h3{margin:2px 2px 14px;display:flex;justify-content:space-between}.tb-ed-lane small{background:#dce8f8;padding:2px 8px;border-radius:20px}.tb-ed-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:10px;box-shadow:0 2px 8px #0f172a0a}.tb-ed-card h3{font-size:15px;line-height:1.35;margin:10px 0}.tb-ed-card a{color:#173c72}.tb-ed-card p{font-size:12px}.tb-ed-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#64748b}.tb-ed-top b{font-size:18px;color:#0f766e}.tb-ed-signals{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0}.tb-ed-signals span{font-size:11px;background:#edf2f7;border-radius:6px;padding:3px 5px}.tb-ed-card details{font-size:12px}.tb-ed-card ul{padding-left:18px}.tb-ed-formats ol{padding-left:19px}.tb-ed-formats li{margin:8px 0}.tb-ed-formats li p{margin:3px 0;color:#475569}.tb-ed-formats small{color:#0f766e}@media(max-width:1200px){.tb-ed-grid{grid-template-columns:repeat(2,minmax(220px,1fr))}}@media(max-width:650px){.tb-ed-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  window.addEventListener('tb-spa-tab-change', (event) => {
    if (event.detail?.tab === 'editorial-dashboard' && !loaded) load();
  });
  if (location.hash === '#editorial-dashboard') load();
})();
