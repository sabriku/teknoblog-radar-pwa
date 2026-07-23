(() => {
  const OPEN_KEY = 'tb_instagram_radar_open';
  const TAB_KEY = 'tb_instagram_radar_tab';
  const REFRESH_MS = 60 * 60 * 1000;
  const tabs = [
    ['story', '⚡ Mutlaka Story'],
    ['reels', '▶ Video Reels'],
    ['feed', '▦ Akış & Karusel'],
    ['published', '📰 Yayımlanmış Haberler'],
    ['digest', '📣 Kanal Özeti']
  ];
  const state = {
    open: localStorage.getItem(OPEN_KEY) !== '0',
    tab: tabs.some(([key]) => key === localStorage.getItem(TAB_KEY)) ? localStorage.getItem(TAB_KEY) : 'story',
    loading: false, data: {}, error: '', refreshedAt: null
  };
  let started = false;
  let timer = null;

  const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fmt = (value) => value ? new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(value)) : '—';
  const fallbackImage = (item = {}) => `https://placehold.co/800x450/fdf2f8/9d174d?text=${encodeURIComponent((item.source_name || 'Instagram Radar').slice(0, 28))}`;
  const items = () => Array.isArray(state.data[state.tab]) ? state.data[state.tab] : [];
  const scoreFor = (item) => state.tab === 'story' ? item.story_score : state.tab === 'reels' ? item.reels_score : item.feed_score;

  function ensureStyle() {
    if (document.getElementById('tb-instagram-radar-style')) return;
    const style = document.createElement('style');
    style.id = 'tb-instagram-radar-style';
    style.textContent = `
      #tb-instagram-radar-wrap{margin:0;border:1px solid #fbcfe8;border-radius:22px;background:#fff;overflow:hidden;box-shadow:0 10px 30px rgba(157,23,77,.08)}
      #tb-instagram-radar-wrap[data-open="0"] .tb-ig-body{display:none}.tb-ig-hero{padding:22px;background:linear-gradient(135deg,#831843,#be185d 55%,#7c3aed);color:#fff}.tb-ig-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}.tb-ig-title{display:flex;gap:12px;align-items:flex-start}.tb-ig-title>span{font-size:32px}.tb-ig-title h2{font:800 29px/1 'Fira Sans Condensed',sans-serif;margin:0 0 7px}.tb-ig-title p{margin:0;max-width:720px;color:#fce7f3;font-size:12px;line-height:1.55}.tb-ig-actions{display:flex;gap:7px;flex-wrap:wrap}.tb-ig-actions button{border:1px solid rgba(255,255,255,.5);border-radius:10px;background:rgba(255,255,255,.12);color:#fff;padding:8px 10px;font-size:11px;font-weight:900;cursor:pointer}.tb-ig-actions button:disabled{opacity:.55}
      .tb-ig-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:17px}.tb-ig-tab{border:1px solid rgba(255,255,255,.35);border-radius:12px;background:rgba(255,255,255,.1);color:#fce7f3;padding:10px;font-size:11px;font-weight:900;cursor:pointer}.tb-ig-tab.on{background:#fff;color:#9d174d;border-color:#fff;box-shadow:0 6px 18px rgba(76,5,25,.22)}
      .tb-ig-summary{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:11px 16px;border-bottom:1px solid #fce7f3;background:#fff7fb;color:#64748b;font-size:11px}.tb-ig-summary b{color:#9d174d}.tb-ig-summary span{padding:4px 7px;border-radius:999px;background:#fce7f3;color:#9d174d;font-size:10px;font-weight:900}.tb-ig-summary[data-error="1"]{background:#fef2f2;color:#991b1b}
      .tb-ig-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(305px,1fr));gap:14px;padding:16px}.tb-ig-card{display:flex;flex-direction:column;overflow:hidden;border:1px solid #fbcfe8;border-radius:18px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.05)}.tb-ig-image{width:100%;aspect-ratio:16/9;object-fit:cover;background:#f8fafc}.tb-ig-inner{display:flex;flex:1;flex-direction:column;padding:14px}.tb-ig-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.tb-ig-pill{padding:5px 8px;border-radius:999px;background:#fdf2f8;color:#be185d;font-size:10px;font-weight:900}.tb-ig-pill.owned{background:#ecfdf5;color:#047857}.tb-ig-card h3{font:750 19px/1.28 'Fira Sans Condensed',sans-serif;color:#111827;margin:9px 0 6px}.tb-ig-meta{font-size:11px;color:#64748b}.tb-ig-why{margin:10px 0 0;padding:8px 9px;border-left:3px solid #ec4899;border-radius:7px;background:#fdf2f8;color:#831843;font-size:11px;line-height:1.45}.tb-ig-plan{margin:10px 0 0;padding-left:19px;color:#475569;font-size:11px;line-height:1.5}.tb-ig-story-copy{display:grid;gap:5px;margin-top:10px;padding:10px;border:1px solid #fbcfe8;border-radius:11px;background:#fff7fb}.tb-ig-story-copy b{font-size:12px;color:#831843}.tb-ig-story-copy span{font-size:11px;color:#475569;line-height:1.45}
      .tb-ig-caption{margin-top:10px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc;overflow:hidden}.tb-ig-caption summary{padding:9px 10px;cursor:pointer;color:#334155;font-size:11px;font-weight:900}.tb-ig-caption pre{margin:0;padding:0 10px 10px;white-space:pre-wrap;font:11px/1.5 system-ui;color:#475569}.tb-ig-keywords{display:flex;gap:4px;flex-wrap:wrap;margin-top:9px}.tb-ig-keywords span{padding:3px 6px;border-radius:7px;background:#f1f5f9;color:#475569;font-size:9px;font-weight:800}.tb-ig-card-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:12px}.tb-ig-card-actions a,.tb-ig-card-actions button{border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#334155;padding:7px 9px;font-size:10px;font-weight:900;text-decoration:none;cursor:pointer}.tb-ig-card-actions button.primary{border-color:#ec4899;background:#fdf2f8;color:#be185d}.tb-ig-empty{margin:16px;padding:22px;border:1px dashed #f9a8d4;border-radius:15px;background:#fdf2f8;color:#64748b;text-align:center;font-size:12px}
      .tb-ig-digest{padding:16px}.tb-ig-digest-note{margin:0 0 13px;padding:10px 12px;border:1px solid #ddd6fe;border-radius:12px;background:#f5f3ff;color:#5b21b6;font-size:11px;line-height:1.5}.tb-ig-template-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tb-ig-template{overflow:hidden;border:1px solid #e2e8f0;border-radius:16px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.05)}.tb-ig-template-head{display:flex;justify-content:space-between;align-items:center;gap:9px;padding:12px 13px;border-bottom:1px solid #e2e8f0}.tb-ig-template-head h3{margin:0;color:#111827;font:800 17px/1.2 'Fira Sans Condensed',sans-serif}.tb-ig-template-head button,.tb-ig-copy-all{border:0;border-radius:9px;background:#be185d;color:#fff;padding:8px 10px;font-size:10px;font-weight:900;cursor:pointer}.tb-ig-template pre{max-height:420px;overflow:auto;margin:0;padding:14px;white-space:pre-wrap;font:12px/1.55 system-ui;color:#334155;background:#f8fafc}.tb-ig-digest-actions{display:flex;justify-content:flex-end;margin:12px 0}.tb-ig-ranked{display:grid;gap:7px}.tb-ig-rank{display:grid;grid-template-columns:34px 66px minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px;border:1px solid #fce7f3;border-radius:12px;background:#fff}.tb-ig-rank>strong{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#fce7f3;color:#be185d}.tb-ig-rank img{width:66px;height:44px;border-radius:8px;object-fit:cover}.tb-ig-rank a{color:#1f2937;font-size:11px;font-weight:850;text-decoration:none;line-height:1.3}.tb-ig-rank small{display:block;margin-top:3px;color:#64748b;font-size:9px}.tb-ig-rank-score{white-space:nowrap;color:#9d174d;font-size:10px;font-weight:900}
      @media(max-width:760px){.tb-ig-tabs{grid-template-columns:1fr 1fr}.tb-ig-grid{grid-template-columns:1fr;padding:11px}.tb-ig-hero{padding:17px}.tb-ig-title h2{font-size:25px}}
      @media(max-width:760px){.tb-ig-template-grid{grid-template-columns:1fr}.tb-ig-rank{grid-template-columns:30px 54px minmax(0,1fr)}.tb-ig-rank img{width:54px;height:40px}.tb-ig-rank-score{grid-column:3}}
      @media(max-width:430px){.tb-ig-tabs{display:flex;overflow:auto}.tb-ig-tab{min-width:145px}.tb-ig-actions{width:100%}.tb-ig-actions button{flex:1}.tb-ig-title>span{font-size:26px}.tb-ig-digest{padding:10px}}
    `;
    document.head.appendChild(style);
  }

  function findMount() { return document.getElementById('tb-instagram-radar-wrap') || document.querySelector('[data-spa-panel="instagram"] main') || document.querySelector('main') || document.body; }
  function why(item) { return state.tab === 'story' ? item.why_story : state.tab === 'reels' ? item.why_reels : item.why_feed; }
  function plan(item) { return state.tab === 'story' ? [] : state.tab === 'reels' ? item.reel_plan : item.carousel_plan; }
  function caption(item) { return state.tab === 'reels' ? item.reels_caption : item.feed_caption; }

  function digestView() {
    const digest = state.data.daily_digest || {};
    const ranked = Array.isArray(digest.items) ? digest.items : [];
    if (!ranked.length) return '<div class="tb-ig-empty">Bugün yayımlanmış yeterli Teknoblog haberi henüz bulunamadı.</div>';
    const whatsapp = digest.whatsapp_template || '';
    const instagram = digest.instagram_template || '';
    return `<div class="tb-ig-digest"><p class="tb-ig-digest-note"><b>Seçim yöntemi:</b> ${esc(digest.ranking_basis || '')} ${Number(digest.actual_signal_count || 0) ? `<strong>${Number(digest.actual_signal_count)} haberde güncel etkileşim sinyali var.</strong>` : ''}</p><div class="tb-ig-template-grid"><section class="tb-ig-template"><div class="tb-ig-template-head"><h3>💬 WhatsApp Kanalı</h3><button data-ig-copy="${esc(whatsapp)}">Metni kopyala</button></div><pre>${esc(whatsapp)}</pre></section><section class="tb-ig-template"><div class="tb-ig-template-head"><h3>📣 Instagram Yayın Kanalı</h3><button data-ig-copy="${esc(instagram)}">Metni kopyala</button></div><pre>${esc(instagram)}</pre></section></div><div class="tb-ig-digest-actions"><button class="tb-ig-copy-all" data-ig-copy="${esc(`${whatsapp}\n\n──────────\n\n${instagram}`)}">İki şablonu birlikte kopyala</button></div><div class="tb-ig-ranked">${ranked.map((item, index) => `<div class="tb-ig-rank"><strong>${index + 1}</strong><img src="${esc(item.image_url || fallbackImage(item))}" alt="" loading="lazy" referrerpolicy="no-referrer"><div><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a><small>${esc(item.digest_summary || '')}</small></div><span class="tb-ig-rank-score">${item.read_signal_available ? `${Number(item.total_clicks || 0)} tıklama sinyali` : `Önem ${Number(item.digest_score || 0)}`}</span></div>`).join('')}</div></div>`;
  }

  function card(item) {
    const isStory = state.tab === 'story';
    const score = Number(scoreFor(item) || 0);
    const list = Array.isArray(plan(item)) ? plan(item) : [];
    const copyText = isStory
      ? `${item.story_plan?.overlay_text || item.title}\n${item.story_plan?.supporting_text || ''}\n${item.story_plan?.sticker_text || 'Haberi oku'}`
      : caption(item);
    return `<article class="tb-ig-card"><img class="tb-ig-image" src="${esc(item.image_url || fallbackImage(item))}" alt="${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(fallbackImage(item))}'"><div class="tb-ig-inner"><div class="tb-ig-top"><span class="tb-ig-pill">${state.tab === 'story' ? 'Story' : state.tab === 'reels' ? 'Reels' : state.tab === 'published' ? 'Yayımlanmış · Akış' : 'Akış'} ${score}</span>${item.is_teknoblog ? '<span class="tb-ig-pill owned">Teknoblog’da yayımlandı</span>' : '<span class="tb-ig-pill">Radar konusu</span>'}${isStory ? `<span class="tb-ig-pill">${esc(item.story_plan?.urgency || 'Bugün paylaş')}</span>` : ''}</div><h3>${esc(item.title)}</h3><div class="tb-ig-meta">${esc(item.source_name || 'Kaynak')} · ${esc(fmt(item.published_at || item.created_at))} · ${Number(item.age_hours || 0).toFixed(1)} saat</div><p class="tb-ig-why">${esc(why(item) || '')}</p>${isStory ? `<div class="tb-ig-story-copy"><b>${esc(item.story_plan?.overlay_text || item.title)}</b><span>${esc(item.story_plan?.supporting_text || '')}</span><span>Bağlantı etiketi: ${esc(item.story_plan?.sticker_text || 'Haberi oku')}</span></div>` : ''}${list.length ? `<ol class="tb-ig-plan">${list.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>` : ''}${!isStory && copyText ? `<details class="tb-ig-caption"><summary>Hazır Instagram açıklaması</summary><pre>${esc(copyText)}</pre></details>` : ''}<div class="tb-ig-keywords">${(item.search_keywords || []).map((word) => `<span>${esc(word)}</span>`).join('')}</div><div class="tb-ig-card-actions"><a href="${esc(item.url || '#')}" target="_blank" rel="noopener noreferrer">Haberi aç</a><button class="primary" data-ig-copy="${esc(copyText)}">${isStory ? 'Story metnini kopyala' : 'Açıklamayı kopyala'}</button>${!item.is_teknoblog ? `<button data-ig-queue='${esc(JSON.stringify({ title: item.title, url: item.url, source_name: item.source_name, image_url: item.image_url, priority: score }))}'>＋ Yazılacaklara</button>` : ''}</div></div></article>`;
  }

  function statusText() {
    if (state.loading) return 'Son haberler ve Instagram format sinyalleri analiz ediliyor…';
    if (state.error) return state.error;
    const count = state.data.counts?.[state.tab] || items().length;
    if (state.tab === 'digest') return `Bugün Teknoblog’da yayımlanan haberlerden seçilen ${count} öne çıkan içerik · Kopyala-yapıştır için hazır`;
    return `Son kontrol ${fmt(state.refreshedAt)} · Bu görünümde ${count} öneri · Son haberler ve son 24 saatlik Radar adayları`;
  }

  function render() {
    ensureStyle();
    const mount = findMount();
    if (!mount) return false;
    const wrap = mount.id === 'tb-instagram-radar-wrap' ? mount : (() => { const section = document.createElement('section'); section.id = 'tb-instagram-radar-wrap'; mount.appendChild(section); return section; })();
    wrap.dataset.open = state.open ? '1' : '0';
    const cards = state.tab === 'digest' ? '' : items().map(card).join('');
    wrap.innerHTML = `<div class="tb-ig-hero"><div class="tb-ig-head"><div class="tb-ig-title"><span>📸</span><div><h2>Instagram İçerik Merkezi</h2><p>Teknoblog’un son yayınları ve Radar sinyalleri; Story, Reels, Akış, karusel ve kanal özetlerine ayrı ayrı değerlendirilir. Puanlar tazelik, görsel anlatım, arama bağlamı, kaydetme/paylaşma niyeti ve gerçek Discover–News sinyallerini birlikte kullanır.</p></div></div><div class="tb-ig-actions"><button data-ig-toggle>${state.open ? 'Daralt' : 'Göster'}</button><button data-ig-refresh ${state.loading ? 'disabled' : ''}>↻ Şimdi yenile</button></div></div><div class="tb-ig-tabs">${tabs.map(([key, label]) => `<button class="tb-ig-tab ${state.tab === key ? 'on' : ''}" data-ig-tab="${key}">${label}<br><small>${state.data.counts?.[key] || 0} öneri</small></button>`).join('')}</div></div><div class="tb-ig-body"><div class="tb-ig-summary" data-error="${state.error ? '1' : '0'}"><b>${esc(statusText())}</b><span>Keşfet</span><span>Instagram arama</span><span>Kaydetme</span><span>Paylaşım</span></div>${state.tab === 'digest' ? digestView() : cards ? `<div class="tb-ig-grid">${cards}</div>` : '<div class="tb-ig-empty">Bu format için yeterince güçlü ve güncel aday bulunamadı.</div>'}</div>`;
    return true;
  }

  async function fetchItems(force = false) {
    if (state.loading && !force) return;
    state.loading = true; state.error = ''; render();
    try {
      const response = await fetch(`/api/instagram-radar?limit=12&_=${Date.now()}`, { cache: 'no-store', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      state.data = data;
      state.refreshedAt = data.refreshed_at || new Date().toISOString();
    } catch (error) { state.error = `Instagram verisi alınamadı: ${error?.message || String(error)}`; }
    finally { state.loading = false; render(); }
  }

  document.addEventListener('click', async (event) => {
    if (event.target.closest('[data-ig-toggle]')) { state.open = !state.open; localStorage.setItem(OPEN_KEY, state.open ? '1' : '0'); render(); return; }
    if (event.target.closest('[data-ig-refresh]')) { await fetchItems(true); return; }
    const tab = event.target.closest('[data-ig-tab]');
    if (tab) { state.tab = tab.dataset.igTab; state.open = true; localStorage.setItem(TAB_KEY, state.tab); localStorage.setItem(OPEN_KEY, '1'); render(); return; }
    const copy = event.target.closest('[data-ig-copy]');
    if (copy) { const original = copy.textContent; try { await navigator.clipboard.writeText(copy.dataset.igCopy || ''); copy.textContent = '✓ Kopyalandı'; setTimeout(() => { copy.textContent = original; }, 1600); } catch (error) { alert(`Kopyalama hatası: ${error.message || error}`); } return; }
    const queue = event.target.closest('[data-ig-queue]');
    if (queue) {
      queue.disabled = true;
      try {
        const payload = JSON.parse(queue.dataset.igQueue || '{}');
        const response = await fetch('/api/intelligence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_upsert', ...payload }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        queue.textContent = '✓ Yazılacaklarda'; queue.closest('article')?.classList.add('tb-queue-added');
      } catch (error) { queue.disabled = false; alert(error.message || error); }
    }
  });

  function start() {
    if (started) return; started = true;
    let tries = 0;
    const wait = setInterval(async () => {
      tries += 1;
      if (render() || tries > 60) { clearInterval(wait); await fetchItems(); if (!timer) timer = setInterval(fetchItems, REFRESH_MS); }
    }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
