(() => {
  const LOGO_URL = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Teknoblog logosu">
      <rect width="120" height="120" rx="24" fill="white"/>
      <g fill="#f04a0a">
        <text x="18" y="74" font-size="58" font-weight="700" font-family="Arial, Helvetica, sans-serif">tb</text>
      </g>
      <g fill="#1f0b05">
        <circle cx="60" cy="88" r="2.2"/>
        <circle cx="56" cy="92" r="2.2"/>
        <circle cx="64" cy="92" r="2.2"/>
        <circle cx="52" cy="96" r="2.2"/>
        <circle cx="60" cy="96" r="2.2"/>
        <circle cx="68" cy="96" r="2.2"/>
        <circle cx="48" cy="100" r="2.2"/>
        <circle cx="56" cy="100" r="2.2"/>
        <circle cx="64" cy="100" r="2.2"/>
        <circle cx="72" cy="100" r="2.2"/>
      </g>
    </svg>
  `)}`;

  function buildFallbackMark() {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-tb-text-logo', '1');
    wrap.style.width = '46px';
    wrap.style.height = '46px';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.position = 'relative';

    const badge = document.createElement('div');
    badge.textContent = 'tb';
    badge.style.color = '#f04a0a';
    badge.style.fontFamily = 'Arial, Helvetica, sans-serif';
    badge.style.fontWeight = '700';
    badge.style.fontSize = '28px';
    badge.style.lineHeight = '1';
    wrap.appendChild(badge);

    return wrap;
  }

  function applyLogoFix() {
    const logo = document.querySelector('img[alt="Teknoblog logosu"]');
    if (!logo) return false;
    if (logo.dataset.tbFixed === '1') return true;
    logo.src = LOGO_URL;
    logo.dataset.tbFixed = '1';
    logo.onerror = () => {
      logo.style.display = 'none';
      const parent = logo.parentElement;
      if (!parent || parent.querySelector('[data-tb-text-logo="1"]')) return;
      parent.appendChild(buildFallbackMark());
    };
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (applyLogoFix() || tries > 20) clearInterval(timer);
  }, 300);

  document.addEventListener('DOMContentLoaded', applyLogoFix);
})();
