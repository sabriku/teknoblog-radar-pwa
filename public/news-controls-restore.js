(() => {
  const DEFAULT_SORT = 'discover_score';

  function toolbarHtml() {
    return `
      <div id="tb-news-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:0 0 12px;padding:12px;border:1px solid #dbe3ef;border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(9,30,66,.05)">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <label for="tb-sort" style="font-size:13px;font-weight:900;color:#111827">Sıralama</label>
          <select id="tb-sort" style="min-width:240px;max-width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:12px;background:#fff;color:#111827;font-weight:800">
            <option value="discover_score">Discover görünümü</option>
            <option value="traffic_score">Trafik potansiyeli</option>
            <option value="published_at">En yeni içerikler</option>
            <option value="total_score">Genel potansiyel</option>
            <option value="conversion_score">Dönüşüm potansiyeli</option>
            <option value="social_score">Sosyal ilgi</option>
            <option value="editorial_score">Editoryal öncelik</option>
          </select>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end">
          <button id="tb-refresh" type="button" class="tb-primary-btn">↻ İçerikleri Yenile</button>
          <button id="tb-copy-selected" type="button" class="tb-small-btn">⧉ Seçilen URL'leri kopyala</button>
        </div>
      </div>`;
  }

  function isNewsVisible() {
    const panel = document.querySelector('[data-spa-panel="news"]');
    return !panel || (!panel.hidden && panel.getAttribute('aria-hidden') !== 'true');
  }

  function ensureToolbar() {
    const existing = document.getElementById('tb-news-toolbar');
    const status = document.getElementById('tb-status');
    if (!existing && status?.parentElement) {
      status.insertAdjacentHTML('beforebegin', toolbarHtml());
    }

    const select = document.getElementById('tb-sort');
    if (select && select.value !== DEFAULT_SORT) {
      select.value = DEFAULT_SORT;
      if (isNewsVisible()) select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function start() {
    ensureToolbar();
    setTimeout(ensureToolbar, 200);
    setTimeout(ensureToolbar, 800);
    setTimeout(ensureToolbar, 1600);

    const observer = new MutationObserver(() => window.requestAnimationFrame(ensureToolbar));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
