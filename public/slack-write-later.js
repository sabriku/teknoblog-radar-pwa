(() => {
  const POOL_KEY = 'tb_write_later_pool_v2';
  const DONE_KEY = 'tb_write_later_done_v2';
  const ACTIVE_TAB_KEY = 'tb_main_nav_tab';
  const PANEL_ID = 'tb-write-later-panel';

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || ''); } catch { return fallback; }
  }

  function setJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function pool() { return getJson(POOL_KEY, {}); }
  function doneMap() { return getJson(DONE_KEY, {}); }

  function toast(message, isError = false) {
    let el = document.getElementById('tb-write-later-toast');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'tb-write-later-toast';
    el.textContent = message;
    el.style.cssText = `position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;background:${isError ? '#991b1b' : '#0f172a'};color:#fff;border-radius:999px;padding:10px 14px;font-size:12px;font-weight:900;box-shadow:0 10px 30px rgba(15,23,42,.25)`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function titleFrom(card) {
    return (card.querySelector('h1,h2,h3,h4')?.textContent || card.querySelector('a[href]')?.textContent || 'Başlıksız haber').replace(/\s+/g, ' ').trim();
  }

  function urlFrom(card) {
    const links = [...card.querySelectorAll('a[href]')].map((a) => a.href).filter(Boolean);
    return links.find((href) => !/chatgpt\.com|google\.com\/search|javascript:/i.test(href)) || links[0] || '';
  }

  function imageFrom(card) {
    return card.querySelector('img[src]')?.src || '';
  }

  function sourceFrom(card) {
    const text = card.textContent || '';
    const pills = [...card.querySelectorAll('.tb-ops-pill,.meta,span,b')].map((el) => el.textContent.trim()).filter(Boolean);
    const sourceLike = pills.find((v) => /verge|engadget|teknoblog|shiftdelete|donanım|webtekno|log|macrumors|9to5|google|apple|android|xda|gsmarena|techcrunch|kaynak/i.test(v));
    if (sourceLike) return sourceLike.replace(/^Kaynak:\s*/i, '').slice(0, 120);
    const parts = text.split('·').map((x) => x.trim()).filter(Boolean);
    return (parts[parts.length - 1] || 'Kaynak yok').slice(0, 120);
  }

  function summaryFrom(card) {
    return [...card.querySelectorAll('p')].map((p) => p.textContent.trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 500);
  }

  function scoreFrom(card) {
    const text = card.textContent || '';
    const matches = [...text.matchAll(/(?:skor|Genel|Discover|Trafik|IG|Karar)\s*(\d+)/gi)].map((m) => Number(m[1]));
    return Math.max(0, ...matches.filter(Number.isFinite));
  }

  function itemFromCard(card) {
    const title = titleFrom(card);
    const url = urlFrom(card);
    const key = url || title;
    return {
      key,
      title,
      url,
      source: sourceFrom(card),
      summary: summaryFrom(card),
      image_url: imageFrom(card),
      score: scoreFrom(card),
      added_at: new Date().toISOString()
    };
  }

  function isNewsCard(card) {
    if (!card || card.dataset.slackWriteLaterIgnore === '1') return false;
    if (card.closest('#tb-write-later-panel')) return false;
    if (card.closest('#tb-today-published-panel')) return false;
    const title = titleFrom(card);
    const url = urlFrom(card);
    if (!title || title.length < 12) return false;
    if (!url && !card.querySelector('button[data-status],button[data-copy],button.tb-ai-bridge')) return false;
    return /haber|kaynak|discover|trend|radar|skor|yazılacak|brief|teknoloji|google|apple|samsung|android|openai|chatgpt|iphone|galaxy/i.test(card.textContent || title);
  }

  function addToPool(item) {
    if (!item.key) return;
    const p = pool();
    p[item.key] = { ...(p[item.key] || {}), ...item, added_at: p[item.key]?.added_at || item.added_at || new Date().toISOString() };
    setJson(POOL_KEY, p);
    const legacy = getJson('tb_ops_status_map', {});
    legacy[item.key] = 'Yazılacak';
    setJson('tb_ops_status_map', legacy);
  }

  async function sendSlack(item) {
    const response = await fetch('/api/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function handleSlack(card, button) {
    const item = itemFromCard(card);
    addToPool(item);
    renderPanel();
    switchToWriteLater();
    const old = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '⏳ Gönderiliyor';
    try {
      await sendSlack(item);
      button.innerHTML = '✅ Slack’e gitti';
      toast('Slack’e gönderildi ve Yazılacaklar’a eklendi.');
    } catch (error) {
      button.innerHTML = '⚠️ Slack ayarı yok';
      toast(`Yazılacaklar’a eklendi. Slack gönderimi başarısız: ${error.message || error}`, true);
    } finally {
      setTimeout(() => { button.disabled = false; button.innerHTML = old; }, 1800);
    }
  }

  function handleAdd(card) {
    const item = itemFromCard(card);
    addToPool(item);
    renderPanel();
    switchToWriteLater();
    toast('Yazılacaklar sekmesine eklendi.');
  }

  function ensureStyle() {
    let style = document.getElementById('tb-slack-write-later-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tb-slack-write-later-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      .tb-card-action-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}
      .tb-slack-btn,.tb-write-later-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:6px 8px;font-size:10.5px;font-weight:900;color:#334155;cursor:pointer;line-height:1;white-space:nowrap}
      .tb-slack-btn{border-color:#c4b5fd;color:#5b21b6;background:#f5f3ff}
      .tb-write-later-btn{border-color:#fed7aa;color:#c2410c;background:#fff7ed}
      .tb-slack-btn:hover,.tb-write-later-btn:hover{filter:brightness(.98)}
      #${PANEL_ID}{border:1px solid #dbe3ef;border-radius:20px;background:#fff;padding:14px;box-shadow:0 6px 18px rgba(9,30,66,.06)}
      #${PANEL_ID} .wl-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      #${PANEL_ID} .wl-title{font:700 22px/1 'Fira Sans Condensed',sans-serif;color:#111827}
      #${PANEL_ID} .wl-sub{font-size:12px;color:#64748b;margin-top:5px;line-height:1.4}
      #${PANEL_ID} .wl-progress-wrap{height:10px;border-radius:999px;background:#f1f5f9;overflow:hidden;border:1px solid #e2e8f0;margin:10px 0 12px}
      #${PANEL_ID} .wl-progress{height:100%;background:#f04a0a;width:0%;transition:width .25s ease}
      #${PANEL_ID} .wl-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
      #${PANEL_ID} .wl-toolbar button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 9px;font-size:11px;font-weight:900;color:#334155;cursor:pointer}
      #${PANEL_ID} .wl-list{display:flex;flex-direction:column;gap:9px}
      #${PANEL_ID} .wl-item{display:grid;grid-template-columns:auto 86px minmax(0,1fr);gap:10px;align-items:start;border:1px solid #e5e7eb;border-radius:14px;padding:9px;background:#fff}
      #${PANEL_ID} .wl-item.done{opacity:.62;background:#f8fafc}
      #${PANEL_ID} .wl-check{margin-top:4px;width:17px;height:17px}
      #${PANEL_ID} .wl-img{width:86px;aspect-ratio:16/10;object-fit:cover;border-radius:9px;background:#f8fafc}
      #${PANEL_ID} .wl-placeholder{width:86px;aspect-ratio:16/10;border-radius:9px;background:#f8fafc;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:20px}
      #${PANEL_ID} .wl-item-title{font:700 18px/1.18 'Fira Sans Condensed',sans-serif;color:#111827;margin-bottom:5px}
      #${PANEL_ID} .wl-meta{font-size:11px;color:#64748b;font-weight:800;margin-bottom:7px}
      #${PANEL_ID} .wl-actions{display:flex;gap:6px;flex-wrap:wrap}
      #${PANEL_ID} .wl-actions a,#${PANEL_ID} .wl-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:6px 8px;font-size:10.5px;font-weight:900;color:#334155;text-decoration:none;cursor:pointer}
      #${PANEL_ID} .wl-actions .slack{border-color:#c4b5fd;color:#5b21b6;background:#f5f3ff}
      #${PANEL_ID} .wl-empty{border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc;color:#64748b;padding:14px;font-size:13px;line-height:1.45}
      @media(max-width:720px){#${PANEL_ID} .wl-item{grid-template-columns:auto minmax(0,1fr)}#${PANEL_ID} .wl-img,#${PANEL_ID} .wl-placeholder{display:none}}
    `;
  }

  function ensurePanel() {
    ensureStyle();
    let panel = document.getElementById(PANEL_ID);
    const main = document.querySelector('#tb-layout main') || document.querySelector('main') || document.getElementById('tb-radar-root') || document.body;
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      main.appendChild(panel);
    } else if (panel.parentElement !== main) {
      main.appendChild(panel);
    }
    return panel;
  }

  function allItems() {
    return Object.values(pool()).sort((a, b) => new Date(b.added_at || 0) - new Date(a.added_at || 0));
  }

  function renderPanel() {
    const panel = ensurePanel();
    const items = allItems();
    const done = doneMap();
    const completed = items.filter((item) => done[item.key]).length;
    const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
    panel.innerHTML = `
      <div class="wl-head">
        <div>
          <div class="wl-title">Yazılacaklar</div>
          <div class="wl-sub">Slack’e gönderilen veya manuel eklenen haberler. Onay kutuları ilerleme durumunu gösterir.</div>
        </div>
        <div style="font-size:12px;font-weight:900;color:#f04a0a">${completed}/${items.length} tamamlandı</div>
      </div>
      <div class="wl-progress-wrap"><div class="wl-progress" style="width:${percent}%"></div></div>
      <div class="wl-toolbar">
        <button type="button" data-wl-copy-all>Listeyi kopyala</button>
        <button type="button" data-wl-clear-done>Tamamlananları temizle</button>
        <button type="button" data-wl-clear-all>Tümünü temizle</button>
      </div>
      ${items.length ? `<div class="wl-list">${items.map((item) => renderItem(item, Boolean(done[item.key]))).join('')}</div>` : '<div class="wl-empty">Henüz Yazılacaklar listesine haber eklenmedi. Herhangi bir haber kartındaki “Slack’e gönder” veya “Yazılacaklar” düğmesini kullan.</div>'}
    `;
  }

  function renderItem(item, done) {
    return `
      <article class="wl-item ${done ? 'done' : ''}" data-wl-key="${esc(item.key)}">
        <input class="wl-check" type="checkbox" data-wl-toggle="${esc(item.key)}" ${done ? 'checked' : ''} aria-label="Tamamlandı">
        ${item.image_url ? `<img class="wl-img" src="${esc(item.image_url)}" alt="${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'wl-placeholder',textContent:'📰'}))">` : '<div class="wl-placeholder">📰</div>'}
        <div>
          <div class="wl-item-title">${esc(item.title)}</div>
          <div class="wl-meta">${esc(item.source || 'Kaynak yok')} · Skor ${Number(item.score || 0)} · ${esc(new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(item.added_at || Date.now())))}</div>
          <div class="wl-actions">
            ${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Kaynak haber</a>` : ''}
            <button type="button" class="slack" data-wl-slack="${esc(item.key)}">Slack’e gönder</button>
            <button type="button" data-wl-copy="${esc(item.key)}">Brief kopyala</button>
            <button type="button" data-wl-remove="${esc(item.key)}">Sil</button>
          </div>
        </div>
      </article>
    `;
  }

  function brief(item) {
    return [
      'Teknoblog için bu haberi yazılacaklar listesine aldım.',
      `Başlık: ${item.title}`,
      `Kaynak: ${item.source || 'Kaynak yok'}`,
      item.url ? `URL: ${item.url}` : '',
      'İstenen çıktı: Haber açısı, SEO başlığı, SEO açıklaması, Instagram karusel akışı ve yayın notu.'
    ].filter(Boolean).join('\n');
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Kopyalandı.'); } catch { toast('Kopyalanamadı.', true); }
  }

  function switchToWriteLater() {
    localStorage.setItem(ACTIVE_TAB_KEY, 'writeLater');
    const button = document.querySelector('#tb-main-tabs [data-main-tab="writeLater"]');
    if (button) button.click();
    else document.getElementById(PANEL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function decorateCards() {
    ensureStyle();
    const candidates = [...document.querySelectorAll('article,.tb-lite-card,.tb-ops-card')].filter(isNewsCard);
    candidates.forEach((card) => {
      if (card.dataset.slackWriteLaterReady === '1') return;
      const actions = card.querySelector('.actions,.tb-ops-actions,.tb-ec-actions,.tb-instagram-inner,.tb-opportunity-inner,.wl-actions') || card;
      const row = document.createElement('div');
      row.className = 'tb-card-action-row';
      const slack = document.createElement('button');
      slack.type = 'button';
      slack.className = 'tb-slack-btn';
      slack.innerHTML = '💬 Slack’e gönder';
      slack.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); handleSlack(card, slack); });
      const later = document.createElement('button');
      later.type = 'button';
      later.className = 'tb-write-later-btn';
      later.innerHTML = '✍️ Yazılacaklar';
      later.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); handleAdd(card); });
      row.append(slack, later);
      actions.appendChild(row);
      card.dataset.slackWriteLaterReady = '1';
    });
  }

  function bindPanelEvents() {
    document.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-wl-toggle]');
      if (!checkbox) return;
      const done = doneMap();
      done[checkbox.dataset.wlToggle] = checkbox.checked;
      setJson(DONE_KEY, done);
      renderPanel();
    }, true);

    document.addEventListener('click', async (event) => {
      const key = event.target.closest('[data-wl-slack]')?.dataset.wlSlack;
      if (key) {
        const item = pool()[key];
        if (!item) return;
        try { await sendSlack(item); toast('Slack’e gönderildi.'); } catch (error) { toast(`Slack gönderimi başarısız: ${error.message || error}`, true); }
        return;
      }
      const copyKey = event.target.closest('[data-wl-copy]')?.dataset.wlCopy;
      if (copyKey) return copyText(brief(pool()[copyKey] || {}));
      const removeKey = event.target.closest('[data-wl-remove]')?.dataset.wlRemove;
      if (removeKey) {
        const p = pool(); delete p[removeKey]; setJson(POOL_KEY, p);
        const d = doneMap(); delete d[removeKey]; setJson(DONE_KEY, d);
        renderPanel(); toast('Listeden çıkarıldı.'); return;
      }
      if (event.target.closest('[data-wl-copy-all]')) {
        const text = allItems().map((item, index) => `${index + 1}. ${item.title}\nKaynak: ${item.source || 'Kaynak yok'}\nURL: ${item.url || ''}`).join('\n\n');
        return copyText(text || 'Yazılacaklar listesi boş.');
      }
      if (event.target.closest('[data-wl-clear-done]')) {
        const p = pool(); const d = doneMap(); Object.keys(d).forEach((key) => { if (d[key]) delete p[key]; }); setJson(POOL_KEY, p); setJson(DONE_KEY, {}); renderPanel(); toast('Tamamlananlar temizlendi.'); return;
      }
      if (event.target.closest('[data-wl-clear-all]')) {
        if (!window.confirm('Yazılacaklar listesinin tamamı temizlensin mi?')) return;
        setJson(POOL_KEY, {}); setJson(DONE_KEY, {}); renderPanel(); toast('Yazılacaklar temizlendi.');
      }
    }, true);
  }

  function start() {
    ensurePanel();
    renderPanel();
    decorateCards();
    bindPanelEvents();
    const observer = new MutationObserver(() => window.requestAnimationFrame(() => { decorateCards(); renderPanel(); }));
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(decorateCards, 700);
    setTimeout(decorateCards, 1800);
  }

  window.tbWriteLater = { addToPool, renderPanel, switchToWriteLater };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
