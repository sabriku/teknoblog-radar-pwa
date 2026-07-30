(() => {
  const root = document.getElementById('tb-competitor-radar-root');
  if (!root) return;

  const GPT_KEY = 'tb_competitor_custom_gpt_url';
  const state = { items: [], selected: new Set(), hours: 36, source: 'all', priority: 'active', channel: 'all', sort: 'opportunity', loading: false, loaded: false };
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const token = () => localStorage.getItem('tb_radar_cron_token') || localStorage.getItem('tb_cron_token') || '';
  const age = (hours) => Number(hours) < 1 ? `${Math.max(1, Math.round(Number(hours) * 60))} dk` : `${Math.round(Number(hours))} sa`;
  const canonicalUrl = (value = '') => { try { const url = new URL(value); url.hash = ''; return url.toString(); } catch { return String(value); } };

  function normalizeGptUrl(value = '') {
    const input = String(value).trim();
    if (!input) return 'https://chatgpt.com/';
    const url = new URL(input);
    if (!/^https?:$/.test(url.protocol)) throw new Error('Bağlantı http veya https olmalı.');
    if (!/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i.test(url.hostname)) throw new Error('ChatGPT veya özel GPT bağlantısı girin.');
    url.protocol = 'https:'; url.search = ''; url.hash = '';
    return url.toString().replace(/\/$/, url.pathname === '/' ? '/' : '');
  }
  function gptUrl() { try { return normalizeGptUrl(localStorage.getItem(GPT_KEY) || 'https://chatgpt.com/'); } catch { return 'https://chatgpt.com/'; } }

  function visibleItems() {
    const filtered = state.items.filter((item) => {
      const sourceMatch = state.source === 'all' || item.source_name === state.source || (item.references || []).some((ref) => ref.source_name === state.source);
      const priorityMatch = state.priority === 'all' || state.priority === 'active' && item.opportunity_key !== 'written' || state.priority === item.opportunity_key;
      const channelMatch = state.channel === 'all'
        || state.channel === 'discover' && Number(item.discover_score) >= 70
        || state.channel === 'news' && Number(item.news_score) >= 70
        || state.channel === 'proven' && item.performance_match
        || state.channel === 'velocity' && Number(item.velocity_score) >= 65
        || state.channel === 'multi' && Number(item.source_count) > 1;
      return sourceMatch && priorityMatch && channelMatch;
    });
    return filtered.sort((a, b) => {
      if (state.sort === 'discover') return b.discover_score - a.discover_score || b.opportunity_score - a.opportunity_score;
      if (state.sort === 'news') return b.news_score - a.news_score || b.opportunity_score - a.opportunity_score;
      if (state.sort === 'velocity') return b.velocity_score - a.velocity_score || b.opportunity_score - a.opportunity_score;
      if (state.sort === 'freshness') return a.age_hours - b.age_hours || b.opportunity_score - a.opportunity_score;
      return b.opportunity_score - a.opportunity_score || b.velocity_score - a.velocity_score;
    });
  }

  function styles() {
    if (document.getElementById('tb-competitor-style')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="tb-competitor-style">
      .tb-cr{color:#172033}.tb-cr-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:4px 2px 18px;border-bottom:1px solid #e6eaf1}.tb-cr-head h2{font:800 28px/1.05 'Fira Sans Condensed',sans-serif;margin:0 0 7px}.tb-cr-head p{margin:0;color:#64748b;font-size:12px;line-height:1.55;max-width:760px}.tb-cr-live{display:flex;align-items:center;gap:7px;border:1px solid #fed7aa;border-radius:999px;background:#fff7ed;color:#c2410c;padding:8px 11px;font-size:11px;font-weight:900;white-space:nowrap}.tb-cr-live:before{content:'';width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px #dcfce7}.tb-cr-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:14px 0}.tb-cr-stat{border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;padding:11px}.tb-cr-stat b{display:block;font-size:20px;line-height:1}.tb-cr-stat span{font-size:10px;color:#64748b;font-weight:800}.tb-cr-stat.hot{background:#fff1f2;border-color:#fecdd3}.tb-cr-stat.high{background:#fff7ed;border-color:#fed7aa}.tb-cr-stat.info{background:#eff6ff;border-color:#bfdbfe}.tb-cr-tools{display:grid;grid-template-columns:130px repeat(4,minmax(135px,1fr)) auto;gap:8px;align-items:end;padding:12px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc}.tb-cr-tools label{display:grid;gap:5px;font-size:9px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.04em}.tb-cr-tools select,.tb-cr-tools input{width:100%;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:9px 10px;color:#172033;font:700 11px 'Open Sans',sans-serif}.tb-cr-btn{border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;padding:9px 11px;font-size:10px;font-weight:900;cursor:pointer}.tb-cr-btn:hover{border-color:#f97316;color:#c2410c}.tb-cr-btn.primary{border-color:#f04a0a;background:#f04a0a;color:#fff}.tb-cr-btn:disabled{opacity:.5;cursor:not-allowed}.tb-cr-bulk{position:sticky;top:58px;z-index:15;display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:12px 0;padding:9px 10px;border:1px solid #fed7aa;border-radius:14px;background:rgba(255,247,237,.96);backdrop-filter:blur(10px)}.tb-cr-bulk strong{margin-right:auto;font-size:11px}.tb-cr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.tb-cr-card{position:relative;display:flex;flex-direction:column;min-width:0;border:1px solid #e4e7ee;border-radius:15px;background:#fff;overflow:hidden;box-shadow:0 5px 16px rgba(15,23,42,.05);transition:.15s ease}.tb-cr-card:hover{transform:translateY(-2px);box-shadow:0 10px 25px rgba(15,23,42,.09)}.tb-cr-card.selected{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.13)}.tb-cr-card.written{opacity:.72}.tb-cr-photo{width:100%;height:132px;object-fit:cover;background:#e2e8f0}.tb-cr-body{display:flex;flex-direction:column;gap:9px;padding:12px;height:100%}.tb-cr-top{display:flex;gap:7px;align-items:center}.tb-cr-check{width:18px;height:18px;accent-color:#f04a0a}.tb-cr-source{color:#0284c7;font-size:10px;font-weight:900}.tb-cr-time{margin-left:auto;color:#94a3b8;font-size:9px;font-weight:800}.tb-cr-card h3{margin:0;font-size:13px;line-height:1.4;min-height:54px}.tb-cr-card h3 a{color:#172033;text-decoration:none}.tb-cr-scores{display:flex;gap:5px;flex-wrap:wrap}.tb-cr-score{display:inline-flex;gap:4px;align-items:center;border-radius:999px;padding:5px 7px;background:#fdf2f8;color:#be185d;font-size:9px;font-weight:900}.tb-cr-score.news{background:#fff7ed;color:#c2410c}.tb-cr-score.velocity{background:#eff6ff;color:#1d4ed8}.tb-cr-match{border:1px solid #ddd6fe;border-radius:10px;background:#f5f3ff;padding:8px;color:#5b21b6;font-size:9px;line-height:1.45}.tb-cr-match strong{display:block;margin-bottom:3px}.tb-cr-match span{display:block;color:#6d28d9}.tb-cr-reasons{margin:0;padding:8px 8px 8px 20px;border:1px solid #d1fae5;border-radius:9px;background:#f0fdf4;color:#15803d;font-size:9px;line-height:1.45}.tb-cr-opportunity{align-self:flex-start;border:1px solid #fdba74;border-radius:6px;background:#fff7ed;color:#ea580c;padding:4px 7px;font-size:9px;font-weight:900;text-transform:uppercase}.tb-cr-opportunity.critical{border-color:#fca5a5;background:#fff1f2;color:#dc2626}.tb-cr-opportunity.written{border-color:#bbf7d0;background:#f0fdf4;color:#16a34a}.tb-cr-refs{font-size:9px;color:#64748b}.tb-cr-refs summary{cursor:pointer;font-weight:900}.tb-cr-refs a{display:block;margin-top:5px;color:#2563eb;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tb-cr-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}.tb-cr-actions .tb-cr-btn{flex:1 1 auto;padding:7px 8px}.tb-cr-empty{padding:32px;border:1px dashed #cbd5e1;border-radius:14px;text-align:center;color:#64748b}.tb-cr-notice{min-height:18px;margin:8px 2px;color:#64748b;font-size:11px}.tb-cr-modal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.62)}.tb-cr-modal[hidden]{display:none}.tb-cr-dialog{width:min(840px,100%);max-height:88vh;display:flex;flex-direction:column;border-radius:18px;background:#fff;box-shadow:0 24px 80px rgba(0,0,0,.25);overflow:hidden}.tb-cr-dialog-head,.tb-cr-dialog-actions{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e2e8f0}.tb-cr-dialog-head h3{margin:0 auto 0 0;font-size:15px}.tb-cr-dialog textarea{width:100%;min-height:52vh;border:0;padding:16px;resize:vertical;color:#1e293b;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;outline:0}.tb-cr-dialog-actions{border:0;border-top:1px solid #e2e8f0;justify-content:flex-end}.tb-cr-settings{margin:10px 0 0;border:1px solid #e2e8f0;border-radius:12px;padding:9px 10px;background:#fff}.tb-cr-settings summary{cursor:pointer;color:#475569;font-size:10px;font-weight:900}.tb-cr-settings-row{display:flex;gap:7px;margin-top:8px}.tb-cr-settings-row input{flex:1;border:1px solid #cbd5e1;border-radius:9px;padding:8px;font-size:10px}.tb-cr-settings-help{margin:7px 0 0;color:#64748b;font-size:9px;line-height:1.45}
      .tb-cr-card.slack-sent{border-color:#86efac;background:#f0fdf4}
      @media(max-width:1120px){.tb-cr-tools{grid-template-columns:repeat(3,1fr)}.tb-cr-summary{grid-template-columns:repeat(3,1fr)}}@media(max-width:980px){.tb-cr-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.tb-cr-head{display:block}.tb-cr-live{display:inline-flex;margin-top:10px}.tb-cr-grid,.tb-cr-tools,.tb-cr-summary{grid-template-columns:1fr}.tb-cr-bulk{top:54px}.tb-cr-photo{height:180px}.tb-cr-card h3{min-height:0}.tb-cr-settings-row{flex-wrap:wrap}.tb-cr-settings-row input{flex-basis:100%}}
    </style>`);
  }

  function header() {
    const sources = [...new Set(state.items.flatMap((item) => (item.references || []).map((ref) => ref.source_name)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    const s = state.summary || {};
    return `<div class="tb-cr-head"><div><h2>🕵️ Rakip Fırsatları</h2><p>DonanımHaber, ShiftDelete, LOG, Webtekno, Webrazzi ve diğer rakipleri tek konu kümelerinde izler. Çoklu kaynak hızını, Teknoblog’un gerçek Discover, Google News ve GA4 geçmişini birlikte değerlendirir.</p></div><span class="tb-cr-live">Canlı takip</span></div>
      <div class="tb-cr-summary"><div class="tb-cr-stat hot"><b>${Number(s.critical || 0)}</b><span>Kritik fırsat</span></div><div class="tb-cr-stat high"><b>${Number(s.discover_hot || 0)}</b><span>Güçlü Discover</span></div><div class="tb-cr-stat info"><b>${Number(s.news_hot || 0)}</b><span>Güçlü News</span></div><div class="tb-cr-stat"><b>${Number(s.multi_source || 0)}</b><span>Çok kaynaklı konu</span></div><div class="tb-cr-stat"><b>${Number(s.written || 0)}</b><span>Teknoblog’da yazıldı</span></div></div>
      <div class="tb-cr-tools"><label>Zaman<select data-cr-hours><option value="24" ${state.hours === 24 ? 'selected' : ''}>Son 24 saat</option><option value="36" ${state.hours === 36 ? 'selected' : ''}>Son 36 saat</option><option value="48" ${state.hours === 48 ? 'selected' : ''}>Son 48 saat</option><option value="72" ${state.hours === 72 ? 'selected' : ''}>Son 72 saat</option></select></label><label>Rakip<select data-cr-source><option value="all">Tüm rakipler</option>${sources.map((name) => `<option ${state.source === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label><label>Fırsat düzeyi<select data-cr-priority><option value="active" ${state.priority === 'active' ? 'selected' : ''}>Aktif fırsatlar</option><option value="critical" ${state.priority === 'critical' ? 'selected' : ''}>Kritik</option><option value="high" ${state.priority === 'high' ? 'selected' : ''}>Yüksek</option><option value="opportunity" ${state.priority === 'opportunity' ? 'selected' : ''}>Fırsatlar</option><option value="written" ${state.priority === 'written' ? 'selected' : ''}>Yazılmışlar</option><option value="all" ${state.priority === 'all' ? 'selected' : ''}>Tümü</option></select></label><label>Odak<select data-cr-channel><option value="all" ${state.channel === 'all' ? 'selected' : ''}>Tüm sinyaller</option><option value="discover" ${state.channel === 'discover' ? 'selected' : ''}>Discover olasılığı</option><option value="news" ${state.channel === 'news' ? 'selected' : ''}>News olasılığı</option><option value="proven" ${state.channel === 'proven' ? 'selected' : ''}>Geçmişte hit çekmiş benzer</option><option value="velocity" ${state.channel === 'velocity' ? 'selected' : ''}>Hızla yayılan</option><option value="multi" ${state.channel === 'multi' ? 'selected' : ''}>Çok kaynaklı</option></select></label><label>Sırala<select data-cr-sort><option value="opportunity" ${state.sort === 'opportunity' ? 'selected' : ''}>Fırsat puanı</option><option value="discover" ${state.sort === 'discover' ? 'selected' : ''}>Discover yüksekten</option><option value="news" ${state.sort === 'news' ? 'selected' : ''}>News yüksekten</option><option value="velocity" ${state.sort === 'velocity' ? 'selected' : ''}>Yayılma hızı</option><option value="freshness" ${state.sort === 'freshness' ? 'selected' : ''}>En yeni</option></select></label><button class="tb-cr-btn primary" data-cr-refresh>↻ Şimdi tara</button></div>
      <details class="tb-cr-settings"><summary>⚙️ Özel GPT bağlantısı</summary><div class="tb-cr-settings-row"><input data-cr-gpt-url type="url" value="${esc(gptUrl())}" placeholder="https://chatgpt.com/g/g-..."><button class="tb-cr-btn" data-cr-save-gpt>Kaydet</button><button class="tb-cr-btn" data-cr-test-gpt>Bağlantıyı test et</button></div><p class="tb-cr-settings-help">Prompt panoya kopyalanır ve özel GPT aynı tıklamayla yeni sekmede açılır. GPT açıldığında promptu yapıştırmanız yeterlidir.</p></details>`;
  }

  function performanceMatch(item) {
    const match = item.performance_match;
    if (!match) return '';
    return `<div class="tb-cr-match"><strong>📈 Teknoblog’da kanıtlanmış benzer konu</strong>${esc(match.title)}<span>Discover ${Number(match.discover_score || 0)} · News ${Number(match.news_score || 0)} · GA4 ilgi ${Number(match.audience_score || 0)} · Benzerlik %${Number(match.similarity || 0)}</span></div>`;
  }

  function card(item) {
    const selected = state.selected.has(String(item.id));
    return `<article class="tb-cr-card ${selected ? 'selected' : ''} ${item.opportunity_key === 'written' ? 'written' : ''} ${item.slack_sent ? 'slack-sent' : ''}" data-cr-card="${esc(item.id)}">${item.image_url ? `<img class="tb-cr-photo" src="${esc(item.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">` : ''}<div class="tb-cr-body"><div class="tb-cr-top"><input class="tb-cr-check" type="checkbox" data-cr-select="${esc(item.id)}" ${selected ? 'checked' : ''} aria-label="Haberi seç"><span class="tb-cr-source">${esc(item.source_name)}</span><span class="tb-cr-time">◷ ${esc(age(item.age_hours))} önce</span></div><h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)} ↗</a></h3><div class="tb-cr-scores"><span class="tb-cr-score">◉ Discover ${Number(item.discover_score || 0)}</span><span class="tb-cr-score news">⚡ News ${Number(item.news_score || 0)}</span><span class="tb-cr-score velocity">↗ Hız ${Number(item.velocity_score || 0)}</span></div>${performanceMatch(item)}<ul class="tb-cr-reasons">${(item.reasons || []).slice(0, 5).map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul><span class="tb-cr-opportunity ${esc(item.opportunity_key)}">${esc(item.opportunity_label)}</span>${item.written_match ? `<div class="tb-cr-refs">✓ Teknoblog eşleşmesi: <a href="${esc(item.written_match.url)}" target="_blank">${esc(item.written_match.title)}</a></div>` : ''}<details class="tb-cr-refs"><summary>${Number(item.references?.length || 0)} kaynak bağlantısı</summary>${(item.references || []).map((ref) => `<a href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">${esc(ref.source_name)} · ${esc(ref.title)}</a>`).join('')}</details><div class="tb-cr-actions"><button class="tb-cr-btn" data-cr-prompt="${esc(item.id)}">✨ Promptu gör</button><button class="tb-cr-btn" data-cr-queue="${esc(item.id)}">＋ Yazılacaklara</button><button class="tb-cr-btn" data-cr-slack="${esc(item.id)}" ${item.slack_sent ? 'disabled' : ''}>${item.slack_sent ? '✓ Slack’e gönderildi' : 'Slack’e gönder'}</button><button class="tb-cr-btn primary" data-cr-send="${esc(item.id)}">GPT’ye gönder</button></div></div></article>`;
  }

  function render() {
    styles(); const items = visibleItems();
    root.innerHTML = `<div class="tb-cr">${header()}<div class="tb-cr-notice" data-cr-notice>${state.loading ? 'Rakip kaynaklar taranıyor…' : `${items.length} benzersiz konu fırsatı gösteriliyor.`}</div><div class="tb-cr-bulk"><strong><span data-cr-selected-count>${state.selected.size}</span> konu seçildi</strong><button class="tb-cr-btn" data-cr-select-visible>Görünenleri seç</button><button class="tb-cr-btn" data-cr-clear>Temizle</button><button class="tb-cr-btn" data-cr-bulk-queue ${state.selected.size ? '' : 'disabled'}>＋ Toplu Yazılacaklara</button><button class="tb-cr-btn" data-cr-bulk-slack ${state.selected.size ? '' : 'disabled'}>Slack’e toplu gönder</button><button class="tb-cr-btn" data-cr-bulk-prompt ${state.selected.size ? '' : 'disabled'}>✨ Toplu prompt</button><button class="tb-cr-btn primary" data-cr-bulk-send ${state.selected.size ? '' : 'disabled'}>GPT’de aç</button></div>${items.length ? `<div class="tb-cr-grid">${items.map(card).join('')}</div>` : '<div class="tb-cr-empty">Bu filtrede rakip fırsatı bulunamadı.</div>'}</div><div class="tb-cr-modal" data-cr-modal hidden><div class="tb-cr-dialog" role="dialog" aria-modal="true" aria-label="GPT promptu"><div class="tb-cr-dialog-head"><h3>✨ Teknoblog özel GPT promptu</h3><button class="tb-cr-btn" data-cr-close>✕ Kapat</button></div><textarea data-cr-prompt-text></textarea><div class="tb-cr-dialog-actions"><button class="tb-cr-btn" data-cr-copy>⧉ Promptu kopyala</button><button class="tb-cr-btn primary" data-cr-open>GPT’ye gönder</button></div></div></div>`;
  }

  function setNotice(message, error = false) { const el = root.querySelector('[data-cr-notice]'); if (el) { el.textContent = message; el.style.color = error ? '#dc2626' : '#64748b'; } }
  async function load(force = false) {
    if (state.loading) return; state.loading = true; if (state.loaded) render();
    try {
      if (force && token()) {
        let offset = 0;
        for (let batch = 0; batch < 4; batch += 1) {
          setNotice(`Rakip RSS kaynakları yenileniyor (${batch + 1})…`);
          const ingest = await fetch(`/api/ingest?token=${encodeURIComponent(token())}&source_type=competitor&source_limit=8&source_offset=${offset}&item_limit=20&_=${Date.now()}`, { cache: 'no-store' });
          const result = await ingest.json().catch(() => ({})); if (!ingest.ok) throw new Error(result.error || `Yenileme HTTP ${ingest.status}`); if (!result.has_more) break; offset += 8;
        }
      }
      const [response, slackStateResponse] = await Promise.all([
        fetch(`/api/competitor-radar?hours=${state.hours}&limit=64${force ? `&_=${Date.now()}` : ''}`, { cache: force ? 'no-store' : 'default' }),
        fetch('/api/push-to-slack', { cache: 'no-store' }).catch(() => null)
      ]);
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const slackState = slackStateResponse?.ok ? await slackStateResponse.json().catch(() => ({})) : {};
      const sentUrls = new Set((slackState.items || []).map(canonicalUrl));
      state.items = (data.items || []).map((item) => ({ ...item, slack_sent: sentUrls.has(canonicalUrl(item.url)) })); state.summary = data.summary || {}; state.loaded = true; state.loading = false;
      for (const id of [...state.selected]) if (!state.items.some((item) => String(item.id) === String(id))) state.selected.delete(id);
      render();
    } catch (error) { state.loading = false; render(); setNotice(`Rakip fırsatları alınamadı: ${error.message}`, true); }
  }
  function selectedItems(ids = state.selected) { return state.items.filter((item) => ids.has(String(item.id))); }
  function promptBundle(items) { return items.map((item, index) => `===== HABER GÖREVİ ${index + 1} / ${items.length} =====\n\n${item.prompt}`).join('\n\n'); }
  function showPrompt(items) { if (!items.length) return setNotice('Önce en az bir haber seçin.', true); const modal = root.querySelector('[data-cr-modal]'); const textarea = root.querySelector('[data-cr-prompt-text]'); textarea.value = promptBundle(items); modal.hidden = false; textarea.focus(); textarea.select(); }
  async function copy(text) { try { await navigator.clipboard.writeText(text); } catch { const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); } }
  async function openGpt(items) {
    if (!items.length) return setNotice('Önce en az bir haber seçin.', true);
    let target = null;
    try { target = window.open('about:blank', '_blank'); } catch { target = null; }
    const text = items.length === 1 && items[0].prompt_only ? items[0].prompt_only : promptBundle(items);
    try { await copy(text); } catch (error) { if (target) target.close(); return setNotice(`Prompt kopyalanamadı: ${error.message}`, true); }
    if (target) { target.opener = null; target.location.replace(gptUrl()); setNotice(`${items.length} prompt panoya kopyalandı; özel GPT açıldı. Promptu yapıştırın.`); }
    else { setNotice('Tarayıcı yeni sekmeyi engelledi. Prompt kopyalandı; “Bağlantıyı test et” ile GPT’yi açın.', true); }
  }
  async function queue(items) {
    if (!items.length) return; setNotice(`${items.length} haber Yazılacaklar’a ekleniyor…`); const auth = token(); let done = 0;
    for (let i = 0; i < items.length; i += 5) {
      const results = await Promise.allSettled(items.slice(i, i + 5).map(async (item) => { const response = await fetch(`/api/intelligence${auth ? `?token=${encodeURIComponent(auth)}` : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_upsert', title: item.title, url: item.url, source_name: item.source_name, image_url: item.image_url, priority: item.opportunity_score, notes: `Rakip fırsatı · Discover ${item.discover_score} · News ${item.news_score} · Hız ${item.velocity_score}` }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data; }));
      done += results.filter((result) => result.status === 'fulfilled').length;
    }
    setNotice(`${done}/${items.length} haber Yazılacaklar’a eklendi.`);
  }

  async function sendSlack(items, digest = false) {
    const pending = items.filter((item) => !item.slack_sent);
    if (!pending.length) return setNotice('Seçilen konular daha önce Slack’e gönderildi.');
    setNotice(`${pending.length} rakip fırsatı Slack’e gönderiliyor…`);
    let sent = 0;
    try {
      const batches = digest
        ? Array.from({ length: Math.ceil(pending.length / 15) }, (_, index) => pending.slice(index * 15, index * 15 + 15))
        : pending.map((item) => [item]);
      for (const batch of batches) {
        const response = await fetch('/api/push-to-slack', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items: batch, delivery_mode: digest ? 'digest' : 'individual', title: 'Teknoblog Radar · Rakip Fırsatları' })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.error || data.errors?.[0] || `HTTP ${response.status}`);
        sent += Number(data.sent || batch.length);
        batch.forEach((item) => { item.slack_sent = true; });
      }
      render();
      setNotice(`${sent} rakip fırsatı, kaynak bağlantılarıyla Slack’e gönderildi.`);
    } catch (error) {
      render();
      setNotice(`Slack hatası: ${error.message}`, true);
    }
  }

  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-cr-hours]')) { state.hours = Number(event.target.value); state.selected.clear(); load(true); }
    if (event.target.matches('[data-cr-source]')) { state.source = event.target.value; render(); }
    if (event.target.matches('[data-cr-priority]')) { state.priority = event.target.value; render(); }
    if (event.target.matches('[data-cr-channel]')) { state.channel = event.target.value; render(); }
    if (event.target.matches('[data-cr-sort]')) { state.sort = event.target.value; render(); }
    if (event.target.matches('[data-cr-select]')) { const id = event.target.dataset.crSelect; event.target.checked ? state.selected.add(id) : state.selected.delete(id); render(); }
  });
  root.addEventListener('click', async (event) => {
    const find = (name) => event.target.closest(`[${name}]`);
    if (find('data-cr-refresh')) return load(true);
    if (find('data-cr-select-visible')) { visibleItems().forEach((item) => state.selected.add(String(item.id))); return render(); }
    if (find('data-cr-clear')) { state.selected.clear(); return render(); }
    if (find('data-cr-save-gpt')) { try { const value = normalizeGptUrl(root.querySelector('[data-cr-gpt-url]')?.value); localStorage.setItem(GPT_KEY, value); root.querySelector('[data-cr-gpt-url]').value = value; setNotice('Özel GPT bağlantısı doğrulandı ve kaydedildi.'); } catch (error) { setNotice(error.message || 'Geçerli bir GPT bağlantısı girin.', true); } return; }
    if (find('data-cr-test-gpt')) { const opened = window.open('about:blank', '_blank'); if (opened) { opened.opener = null; opened.location.replace(gptUrl()); } setNotice(opened ? 'Kaydedilen özel GPT yeni sekmede açıldı.' : 'Tarayıcı yeni sekmeyi engelledi.', !opened); return; }
    const prompt = find('data-cr-prompt'); if (prompt) return showPrompt(selectedItems(new Set([prompt.dataset.crPrompt])));
    const send = find('data-cr-send'); if (send) return openGpt(selectedItems(new Set([send.dataset.crSend])));
    const add = find('data-cr-queue'); if (add) { await queue(selectedItems(new Set([add.dataset.crQueue]))); add.textContent = '✓ Eklendi'; add.disabled = true; return; }
    const slack = find('data-cr-slack'); if (slack) return sendSlack(selectedItems(new Set([slack.dataset.crSlack])));
    if (find('data-cr-bulk-prompt')) return showPrompt(selectedItems());
    if (find('data-cr-bulk-send')) return openGpt(selectedItems());
    if (find('data-cr-bulk-queue')) return queue(selectedItems());
    if (find('data-cr-bulk-slack')) return sendSlack(selectedItems(), true);
    if (find('data-cr-close')) { root.querySelector('[data-cr-modal]').hidden = true; return; }
    if (find('data-cr-copy')) { await copy(root.querySelector('[data-cr-prompt-text]').value); setNotice('Prompt panoya kopyalandı.'); return; }
    if (find('data-cr-open')) return openGpt([{ prompt_only: root.querySelector('[data-cr-prompt-text]').value }]);
    if (event.target.matches('[data-cr-modal]')) event.target.hidden = true;
  });

  window.addEventListener('tb-spa-tab-change', (event) => { if (event.detail?.tab === 'competitor-radar' && !state.loaded) load(); });
  if (window.location.hash === '#competitor-radar') load();
})();
