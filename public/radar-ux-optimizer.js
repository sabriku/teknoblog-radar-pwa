(() => {
  const ICONS = {
    news: '📰',
    editorial: '🧭',
    instagram: '📸',
    opportunity: '🏷️',
    trends: '📈',
    googleNews: '🌐',
    decision: '⚡'
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureStyle() {
    let style = document.getElementById('tb-ux-optimizer-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tb-ux-optimizer-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      html{scroll-behavior:smooth}
      body{font-size:14px;line-height:1.5;text-rendering:optimizeLegibility}
      a,button,select,input,textarea{font-family:'Open Sans',sans-serif}
      a:focus-visible,button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid rgba(240,74,10,.28)!important;outline-offset:2px!important}
      button:disabled,select:disabled{opacity:.62!important;cursor:not-allowed!important}
      img{max-width:100%;height:auto}
      .tb-skip-link{position:absolute;left:12px;top:-48px;z-index:9999;background:#111827;color:#fff;padding:10px 12px;border-radius:10px;text-decoration:none;font-weight:900;transition:top .18s ease}.tb-skip-link:focus{top:12px}
      #tb-main-tabs{align-items:center;gap:6px!important;padding:7px 0 9px!important;overscroll-behavior-x:contain!important}
      #tb-main-tabs a,#tb-main-tabs button{display:inline-flex!important;align-items:center!important;gap:6px!important;min-height:34px!important;padding:8px 11px!important;font-size:11.5px!important;letter-spacing:-.01em!important}
      #tb-main-tabs a[aria-current='page']{position:relative!important}
      #tb-layout{align-items:start!important;min-width:0!important}
      #tb-layout main{min-width:0!important;max-width:100%!important}
      #tb-layout aside{position:sticky;top:58px;max-height:calc(100vh - 70px);overflow:auto;min-width:0!important}
      #tb-grid article,.tb-page-card article,.tb-gt-card,.tb-google-news-card,.tb-instagram-card,.tb-opportunity-card,.tb-lite-card{overflow:hidden!important;word-break:break-word!important}
      #tb-grid article h3,.tb-page-card h3,.tb-page-card h4{overflow-wrap:anywhere!important}
      #tb-status:empty{display:none!important}
      #tb-status{border-radius:12px!important;background:#fff!important;border:1px solid #e5e7eb!important;padding:10px 12px!important}
      select{min-height:40px!important;max-width:100%!important}
      .tb-page-main,#tb-editorial-center,#tb-instagram-radar-wrap,#tb-opportunity-radar-wrap,#tb-google-news-wrap,#tb-trend-radar-wrap,#tb-google-trends-wrap,#tb-google-trends-radar-section{max-width:100%!important;box-sizing:border-box!important}
      #tb-editorial-center{padding:12px!important;border-radius:18px!important}
      #tb-editorial-center .lite-head{gap:8px!important}
      #tb-editorial-center .lite-toggle,#tb-editorial-center .lite-refresh{padding:7px 10px!important;font-size:12px!important}
      #tb-editorial-center .lite-tabs{gap:6px!important;padding:9px 0!important;overflow-x:auto!important}
      #tb-editorial-center .lite-tab{padding:7px 9px!important;font-size:11px!important;white-space:nowrap!important}
      #tb-editorial-center .lite-note{font-size:12px!important;padding:8px!important;margin-bottom:8px!important}
      #tb-editorial-center .lite-grid{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))!important;gap:10px!important}
      #tb-editorial-center .tb-lite-card{padding:10px!important;border-radius:14px!important}
      #tb-editorial-center .tb-lite-img{width:calc(100% + 20px)!important;margin:-10px -10px 8px!important;max-height:145px!important}
      #tb-editorial-center .tb-lite-card h4{font-size:15.5px!important;line-height:1.22!important}
      #tb-editorial-center .tb-lite-card p,#tb-editorial-center .tb-lite-card li{font-size:11.3px!important;line-height:1.42!important}
      #tb-editorial-center .top b,#tb-editorial-center .top span,#tb-editorial-center .scores span{font-size:10.5px!important;padding:3px 6px!important}
      #tb-editorial-center .actions a,#tb-editorial-center .actions button{font-size:10.5px!important;padding:6px 7px!important}
      .tb-ai-bridge{display:inline-flex!important;align-items:center!important;gap:5px!important;border:1px solid #bae6fd!important;color:#0369a1!important;background:#f0f9ff!important;border-radius:999px!important;padding:6px 8px!important;font-size:10.5px!important;font-weight:900!important;line-height:1!important;box-shadow:none!important;white-space:nowrap!important;max-width:max-content!important;margin-top:4px!important}
      .tb-ai-bridge:hover{border-color:#0ea5e9!important;background:#e0f2fe!important}
      .tb-ai-bridge .tb-ai-icon{font-size:12px;line-height:1}
      .tb-ai-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;background:#0f172a;color:#fff;border-radius:999px;padding:10px 14px;font-size:12px;font-weight:800;box-shadow:0 10px 30px rgba(15,23,42,.25)}
      .tb-section-kicker{display:inline-flex;gap:6px;align-items:center;border:1px solid #e5e7eb;background:#f8fafc;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900;color:#475569;margin-bottom:8px}
      @media(max-width:1100px){#tb-layout{grid-template-columns:minmax(0,1fr) 300px!important;gap:14px!important}}
      @media(max-width:960px){#tb-layout{display:block!important}#tb-layout aside{position:static!important;max-height:none!important;margin-top:14px!important}}
      @media(max-width:720px){
        body{font-size:13px!important}
        #tb-main-tabs{position:sticky;top:0;margin:0 -10px 10px!important;padding:7px 10px!important}
        #tb-main-tabs a,#tb-main-tabs button{font-size:11px!important;padding:7px 9px!important;min-height:30px!important}
        #tb-editorial-center .lite-grid{grid-template-columns:1fr!important}
        #tb-editorial-center .tb-lite-img{max-height:190px!important}
        #tb-status{font-size:12px!important}
      }
    `;
  }

  function ensureSkipLink() {
    if (document.querySelector('.tb-skip-link')) return;
    const target = document.querySelector('main,#tb-grid,.tb-page-main,#tb-layout');
    if (!target) return;
    if (!target.id) target.id = 'tb-main-content';
    const link = document.createElement('a');
    link.className = 'tb-skip-link';
    link.href = `#${target.id}`;
    link.textContent = 'İçeriğe geç';
    document.body.prepend(link);
  }

  function decorateTabs() {
    document.querySelectorAll('#tb-main-tabs [data-main-tab]').forEach((button) => {
      if (button.dataset.uxDecorated === '1') return;
      const key = button.getAttribute('data-main-tab') || '';
      const icon = ICONS[key] || '•';
      const label = button.textContent.trim();
      button.innerHTML = `<span class="tb-tab-icon" aria-hidden="true">${esc(icon)}</span><span>${esc(label)}</span>`;
      button.dataset.uxDecorated = '1';
    });
  }

  function openVisiblePanels() {
    document.querySelectorAll('#tb-opportunity-radar-wrap,#tb-google-news-wrap,#tb-trend-radar-wrap,#tb-google-trends-radar-section,#tb-instagram-radar-wrap').forEach((section) => {
      if (section.getAttribute('data-tb-main-hidden') === '1') return;
      section.setAttribute('data-open', '1');
      section.querySelectorAll('.tb-opportunity-body,.tb-google-news-body,.tb-trend-body,.tb-instagram-body,#tb-trend-status,#tb-trend-grid,#tb-trend-window-tabs').forEach((body) => { body.style.display = ''; });
      section.querySelectorAll('.tb-section-toggle').forEach((button) => { button.innerHTML = '<span class="tb-section-chevron">▾</span><span>Daralt</span>'; });
    });
  }

  function promptFromCard(card) {
    const title = card.querySelector('h3,h4')?.textContent?.trim() || 'Başlıksız içerik';
    const link = card.querySelector('a[href]')?.href || '';
    const meta = card.querySelector('.meta,.tb-ec-meta,.tb-instagram-meta,.tb-opportunity-meta')?.textContent?.trim() || '';
    return [
      'Teknoblog için bu içeriği değerlendir.',
      `Başlık: ${title}`,
      meta ? `Meta: ${meta}` : '',
      link ? `URL: ${link}` : '',
      'Çıktı formatı:',
      '1) Yaz / Bekle / Geç kararı',
      '2) Google Discover açısı',
      '3) SEO başlığı',
      '4) SEO açıklaması',
      '5) Instagram karusel kapağı',
      '6) 5 kartlık karusel akışı',
      '7) Teknoblog okuyucusuna etkisi',
      'Dil: Türkçe. Ton: tarafsız, etken çatı, Teknoblog editoryal dili.'
    ].filter(Boolean).join('\n');
  }

  function showToast(message) {
    const old = document.querySelector('.tb-ai-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'tb-ai-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  async function copyAndOpenChatGPT(prompt, button) {
    try { await navigator.clipboard.writeText(prompt); } catch {}
    const old = button.innerHTML;
    button.innerHTML = '<span class="tb-ai-icon">✓</span><span>Kopyalandı</span>';
    showToast('Brief panoya kopyalandı. ChatGPT açılıyor.');
    setTimeout(() => { button.innerHTML = old; }, 1400);
    const target = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  function addAiBridge() {
    document.querySelectorAll('#tb-editorial-center article,#tb-grid article,#tb-instagram-radar-wrap article,#tb-opportunity-radar-wrap article').forEach((card) => {
      if (card.dataset.aiBridge === '1') return;
      const actions = card.querySelector('.actions,.tb-ec-actions,.tb-instagram-inner,.tb-opportunity-inner') || card;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tb-ai-bridge';
      button.title = 'Briefi panoya kopyala ve ChatGPT’de aç';
      button.innerHTML = '<span class="tb-ai-icon">✨</span><span>AI brief</span>';
      button.addEventListener('click', () => copyAndOpenChatGPT(promptFromCard(card), button));
      actions.appendChild(button);
      card.dataset.aiBridge = '1';
    });
  }

  function addSectionKickers() {
    const map = [
      ['#tb-editorial-center', '🧭', 'Editoryal karar merkezi'],
      ['#tb-instagram-radar-wrap', '📸', 'Karusel / Keşfet adayları'],
      ['#tb-opportunity-radar-wrap', '🏷️', 'Fırsat ve fiyat sinyalleri'],
      ['#tb-google-news-wrap', '🌐', 'Google News teknoloji gündemi'],
      ['#tb-trend-radar-wrap', '⚡', 'Trend ve karar katmanı'],
      ['#tb-google-trends-radar-section', '📈', 'Google Trends sinyalleri']
    ];
    map.forEach(([selector, icon, text]) => {
      const section = document.querySelector(selector);
      if (!section || section.querySelector(':scope > .tb-section-kicker')) return;
      const kicker = document.createElement('div');
      kicker.className = 'tb-section-kicker';
      kicker.textContent = `${icon} ${text}`;
      section.insertBefore(kicker, section.firstChild);
    });
  }

  function run() {
    ensureStyle();
    ensureSkipLink();
    decorateTabs();
    openVisiblePanels();
    addAiBridge();
    addSectionKickers();
  }

  function start() {
    run();
    const observer = new MutationObserver(() => window.requestAnimationFrame(run));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tb-main-hidden', 'aria-selected'] });
    setTimeout(run, 500);
    setTimeout(run, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();