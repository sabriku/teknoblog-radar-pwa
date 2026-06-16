(() => {
  const POOL_KEY = 'tb_ops_write_pool';
  const STATUS_KEY = 'tb_ops_status_map';
  const DONE_KEY = 'tb_write_pool_done';
  const PANEL_ID = 'tb-write-pool-panel';

  const roots = ['#tb-grid', '#tb-editorial-center', '#tb-instagram-radar-wrap', '#tb-google-news-wrap', '#tb-trend-radar-wrap', '#tb-editorial-ops-suite'];

  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const read = (k, f = {}) => { try { return JSON.parse(localStorage.getItem(k) || ''); } catch { return f; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function cardFrom(el) {
    return el?.closest?.('article,.tb-lite-card,.tb-ops-card');
  }

  function titleFrom(card) {
    return (card?.querySelector('h1,h2,h3,h4')?.textContent || card?.querySelector('a[href]')?.textContent || 'Başlıksız haber').replace(/\s+/g, ' ').trim();
  }

  function urlFrom(card) {
    const links = [...(card?.querySelectorAll('a[href]') || [])].map((a) => a.href).filter(Boolean);
    return links.find((href) => !/google\.com\/search|chatgpt\.com|javascript:/i.test(href)) || links[0] || '';
  }

  function imageFrom(card) {
    return card?.querySelector('img[src]')?.src || '';
  }

  function sourceFrom(card) {
    const meta = card?.querySelector('.meta,.tb-ec-meta,.tb-ops-pill')?.textContent || '';
    const text = `${meta} ${card?.textContent || ''}`;
    const parts = text.split('·').map((x) => x.trim()).filter(Boolean);
    return (parts.find((p) => /verge|engadget|teknoblog|shiftdelete|donanım|webtekno|log|macrumors|9to5|google|apple|android|xda|gsmarena|techcrunch/i.test(p)) || parts[parts.length - 1] || 'Kaynak yok').replace(/^Kaynak:\s*/i, '').slice(0, 120);
  }

  function scoreFrom(card) {
    const text = card?.textContent || '';
    const nums = [...text.matchAll(/(?:Genel|Karar|Discover|Disc|Trafik|IG|skor)\s*(\d+)/gi)].map((m) => Number(m[1]));
    return Math.max(0, ...nums.filter(Number.isFinite));
  }

  function itemFromCard(card) {
    const title = titleFrom(card);
    const url = urlFrom(card);
    return {
      title,
      source_name: sourceFrom(card),
      url,
      image_url: imageFrom(card),
      published_at: new Date().toISOString(),
      total_score: scoreFrom(card)
    };
  }

  function keyOf(item) {
    return item.url || item.title;
  }

  function addToPool(card) {
    if (!card) return null;
    const item = itemFromCard(card);
    const key = keyOf(item);
    if (!key || !item.title || item.title.length < 8) return null;
    const pool = read(POOL_KEY, {});
    pool[key] = { ...(pool[key] || {}), ...item };
    write(POOL_KEY, pool);
    const status = read(STATUS_KEY, {});
    status[key] = 'Yazılacak';
    write(STATUS_KEY, status);
    renderPanel();
    return item;
  }

  function isShareButton(el) {
    const s = `${el?.textContent || ''} ${el?.getAttribute?.('aria-label') || ''} ${el?.getAttribute?.('title') || ''} ${[...(el?.attributes || [])].map((a) => `${a.name}=${a.value}`).join(' ')}`.toLowerCase();
    return /slack/.test(s);
  }

  function hasShareButton(card) {
    return [...(card?.querySelectorAll('button,a') || [])].some(isShareButton);
  }

  async function postToShare(item) {
    const res = await fetch('/api/slack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  }

  function toast(text) {
    let t = document.getElementById('tb-write-pool-toast');
    if (t) t.remove();
    t = document.createElement('div');
    t.id = 'tb-write-pool-toast';
    t.textContent = text;
    t.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#0f172a;color:white;border-radius:999px;padding:9px 13px;font-size:12px;font-weight:900;z-index:9999';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function ensureStyle() {
    if (document.getElementById('tb-write-pool-style')) return;
    const s = document.createElement('style');
    s.id = 'tb-write-pool-style';
    s.textContent = `
      #${PANEL_ID}{border:1px solid #dbe3ef;border-radius:20px;background:#fff;padding:14px;box-shadow:0 6px 18px rgba(9,30,66,.06)}
      #${PANEL_ID} .wp-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px}
      #${PANEL_ID} .wp-title{font:700 22px/1 'Fira Sans Condensed',sans-serif;color:#111827}
      #${PANEL_ID} .wp-sub{font-size:12px;color:#64748b;margin-top:5px;line-height:1.45}
      #${PANEL_ID} .wp-progress-wrap{height:10px;border-radius:999px;background:#f1f5f9;border:1px solid #e2e8f0;overflow:hidden;margin:10px 0 12px}
      #${PANEL_ID} .wp-progress{height:100%;background:#f04a0a;width:0%;transition:width .2s ease}
      #${PANEL_ID} .wp-toolbar{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}
      #${PANEL_ID} .wp-toolbar button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 9px;font-size:11px;font-weight:900;color:#334155;cursor:pointer}
      #${PANEL_ID} .wp-list{display:flex;flex-direction:column;gap:9px}
      #${PANEL_ID} .wp-item{display:grid;grid-template-columns:auto 82px minmax(0,1fr);gap:10px;border:1px solid #e5e7eb;border-radius:14px;padding:9px;background:#fff;align-items:start}
      #${PANEL_ID} .wp-item.done{opacity:.6;background:#f8fafc}
      #${PANEL_ID} .wp-check{width:17px;height:17px;margin-top:4px}
      #${PANEL_ID} .wp-img{width:82px;aspect-ratio:16/10;object-fit:cover;border-radius:9px;background:#f8fafc}
      #${PANEL_ID} .wp-placeholder{width:82px;aspect-ratio:16/10;border-radius:9px;background:#f8fafc;display:flex;align-items:center;justify-content:center;color:#94a3b8}
      #${PANEL_ID} .wp-item h4{font:700 18px/1.2 'Fira Sans Condensed',sans-serif;color:#111827;margin:0 0 5px}
      #${PANEL_ID} .wp-meta{font-size:11px;color:#64748b;font-weight:800;margin-bottom:7px}
      #${PANEL_ID} .wp-actions{display:flex;gap:6px;flex-wrap:wrap}
      #${PANEL_ID} .wp-actions a,#${PANEL_ID} .wp-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:6px 8px;font-size:10.5px;font-weight:900;color:#334155;text-decoration:none;cursor:pointer}
      #${PANEL_ID} .wp-empty{border:1px dashed #cbd5e1;background:#f8fafc;border-radius:14px;padding:14px;color:#64748b;font-size:13px;line-height:1.45}
      .tb-add-share{position:absolute;top:10px;right:10px;width:32px;height:32px;border:0;border-radius:10px;background:#4A154B;color:#fff;font-size:11px;font-weight:900;cursor:pointer;z-index:3;box-shadow:0 4px 10px rgba(74,21,75,.22)}
    `;
    document.head.appendChild(s);
  }

  function ensurePanel() {
    ensureStyle();
    const main = document.querySelector('#tb-layout main') || document.querySelector('main') || document.getElementById('tb-radar-root') || document.body;
    let p = document.getElementById(PANEL_ID);
    if (!p) {
      p = document.createElement('section');
      p.id = PANEL_ID;
      main.appendChild(p);
    } else if (p.parentElement !== main) {
      main.appendChild(p);
    }
    return p;
  }

  function poolItems() {
    const pool = read(POOL_KEY, {});
    return Object.entries(pool).map(([key, value]) => ({ key, ...value })).sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
  }

  function renderPanel() {
    const p = ensurePanel();
    const items = poolItems();
    const done = read(DONE_KEY, {});
    const completed = items.filter((i) => done[i.key]).length;
    const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
    p.innerHTML = `<div class="wp-head"><div><div class="wp-title">Yazılacaklar</div><div class="wp-sub">Slack’e gönderilen veya Yazılacak olarak işaretlenen haberler.</div></div><div style="font-size:12px;font-weight:900;color:#f04a0a">${completed}/${items.length}</div></div><div class="wp-progress-wrap"><div class="wp-progress" style="width:${percent}%"></div></div><div class="wp-toolbar"><button data-wp-copy>Listeyi kopyala</button><button data-wp-clear-done>Tamamlananları temizle</button><button data-wp-clear>Tümünü temizle</button></div>${items.length ? `<div class="wp-list">${items.map((i) => renderItem(i, !!done[i.key])).join('')}</div>` : '<div class="wp-empty">Henüz Yazılacaklar listesinde haber yok. Bir karttaki Slack’e gönder düğmesini veya Yazılacak aksiyonunu kullan.</div>'}`;
  }

  function renderItem(i, done) {
    return `<article class="wp-item ${done ? 'done' : ''}" data-wp-key="${esc(i.key)}"><input class="wp-check" type="checkbox" data-wp-done="${esc(i.key)}" ${done ? 'checked' : ''}>${i.image_url ? `<img class="wp-img" src="${esc(i.image_url)}" alt="${esc(i.title)}" loading="lazy">` : '<div class="wp-placeholder">📰</div>'}<div><h4>${esc(i.title)}</h4><div class="wp-meta">${esc(i.source_name || 'Kaynak yok')} · skor ${Number(i.total_score || 0)}</div><div class="wp-actions">${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">Kaynak haber</a>` : ''}<button data-wp-remove="${esc(i.key)}">Sil</button></div></div></article>`;
  }

  function addMissingShareButtons() {
    roots.forEach((selector) => {
      document.querySelectorAll(`${selector} article, ${selector} .tb-lite-card, ${selector} .tb-ops-card`).forEach((card) => {
        if (card.closest(`#${PANEL_ID}`) || card.dataset.writePoolButtonReady === '1' || hasShareButton(card)) return;
        const title = titleFrom(card);
        const url = urlFrom(card);
        if (!title || title.length < 8 || !url) return;
        const imageWrap = card.querySelector('[style*="position:relative"], .tb-ops-card-body, .tb-lite-card') || card;
        if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tb-add-share';
        b.title = 'Slack’e gönder';
        b.setAttribute('aria-label', 'Slack’e gönder');
        b.textContent = 'SL';
        b.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const item = addToPool(card);
          try { if (item) await postToShare(item); toast('Slack’e gönderildi ve Yazılacaklar’a eklendi.'); } catch { toast('Yazılacaklar’a eklendi. Slack ayarı kontrol edilmeli.'); }
        });
        imageWrap.appendChild(b);
        card.dataset.writePoolButtonReady = '1';
      });
    });
  }

  function bind() {
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('button,a');
      if (trigger && isShareButton(trigger)) {
        const card = cardFrom(trigger);
        if (card) { addToPool(card); toast('Yazılacaklar’a eklendi.'); }
      }
      const doneKey = event.target.closest('[data-wp-done]')?.dataset.wpDone;
      if (doneKey) {
        const done = read(DONE_KEY, {});
        done[doneKey] = event.target.checked;
        write(DONE_KEY, done);
        renderPanel();
      }
      const removeKey = event.target.closest('[data-wp-remove]')?.dataset.wpRemove;
      if (removeKey) {
        const pool = read(POOL_KEY, {});
        delete pool[removeKey];
        write(POOL_KEY, pool);
        const done = read(DONE_KEY, {});
        delete done[removeKey];
        write(DONE_KEY, done);
        renderPanel();
      }
      if (event.target.closest('[data-wp-copy]')) {
        navigator.clipboard.writeText(poolItems().map((i, index) => `${index + 1}. ${i.title}\nKaynak: ${i.source_name || ''}\nURL: ${i.url || ''}`).join('\n\n'));
        toast('Liste kopyalandı.');
      }
      if (event.target.closest('[data-wp-clear-done]')) {
        const pool = read(POOL_KEY, {});
        const done = read(DONE_KEY, {});
        Object.keys(done).forEach((key) => { if (done[key]) delete pool[key]; });
        write(POOL_KEY, pool);
        write(DONE_KEY, {});
        renderPanel();
      }
      if (event.target.closest('[data-wp-clear]')) {
        if (!confirm('Yazılacaklar listesi temizlensin mi?')) return;
        write(POOL_KEY, {});
        write(DONE_KEY, {});
        renderPanel();
      }
    }, true);
  }

  function start() {
    ensurePanel();
    renderPanel();
    addMissingShareButtons();
    bind();
    const obs = new MutationObserver(() => setTimeout(addMissingShareButtons, 80));
    roots.forEach((selector) => { const el = document.querySelector(selector); if (el) obs.observe(el, { childList: true, subtree: true }); });
    setTimeout(addMissingShareButtons, 800);
    setTimeout(addMissingShareButtons, 1800);
  }

  window.tbWritePool = { addToPool, renderPanel };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
