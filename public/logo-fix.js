(() => {
  const LOGO_URL = '/teknoblog-logo.svg?v=20260419-2';

  function applyLogoFix() {
    const logo = document.querySelector('img[alt="Teknoblog logosu"]');
    if (!logo) return false;
    if (logo.dataset.tbFixed === '1') return true;
    logo.src = LOGO_URL;
    logo.dataset.tbFixed = '1';
    logo.onerror = () => {
      logo.style.display = 'none';
      const wrap = logo.parentElement;
      if (!wrap) return;
      if (wrap.querySelector('[data-tb-text-logo="1"]')) return;
      const textLogo = document.createElement('div');
      textLogo.setAttribute('data-tb-text-logo', '1');
      textLogo.textContent = 'T';
      textLogo.style.width = '42px';
      textLogo.style.height = '42px';
      textLogo.style.borderRadius = '14px';
      textLogo.style.display = 'flex';
      textLogo.style.alignItems = 'center';
      textLogo.style.justifyContent = 'center';
      textLogo.style.background = '#f04a0a';
      textLogo.style.color = '#fff';
      textLogo.style.fontFamily = 'Fira Sans Condensed, sans-serif';
      textLogo.style.fontWeight = '700';
      textLogo.style.fontSize = '26px';
      wrap.appendChild(textLogo);
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
