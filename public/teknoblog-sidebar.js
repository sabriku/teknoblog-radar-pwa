(() => {
  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul'
    }).format(date);
  }

  function buildPanel() {
    const section = document.createElement('section');
    section.id = 'tb-latest-teknoblog';
    section.style.border = '1px solid #dbe3ef';
    section.style.borderRadius = '18px';
    section.style.background = '#fff';
    section.style.padding = '16px';
    section.style.boxShadow = '0 6px 18px rgba(9,30,66,.06)';

    section.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
        <div style="font:700 22px/1 'Fira Sans Condensed',sans-serif">Bugün Teknoblog.com'da yayımlananlar</div>
        <a href="https://www.teknoblog.com" target="_blank" rel="noopener noreferrer" style="font-size:12px;font-weight:700;color:#f04a0a;text-decoration:none">Siteye git</a>
      </div>
      <div id="tb-latest-teknoblog-list" style="display:flex;flex-direction:column;gap:10px;font-size:14px;color:#334155">
        <div>Yükleniyor...</div>
      </div>
    `;

    return section;
  }

  async function loadLatest() {
    const list = document.getElementById('tb-latest-teknoblog-list');
    if (!list) return;
    try {
      const response = await fetch(`/api/teknoblog-latest?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        list.innerHTML = '<div>Bugün yayımlanmış haber bulunamadı.</div>';
        return;
      }
      list.innerHTML = items.map((item) => {
        const dateText = formatDate(item.published_at);
        return `
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" style="display:block;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;text-decoration:none;color:#111827;background:#fff">
            <div style="font-weight:700;line-height:1.4">${item.title}</div>
            <div style="margin-top:6px;font-size:12px;color:#64748b">${dateText || 'Tarih yok'}</div>
          </a>
        `;
      }).join('');
    } catch (error) {
      list.innerHTML = `<div>Hata: ${String(error.message || error)}</div>`;
    }
  }

  function insertPanel() {
    const aside = document.querySelector('#tb-layout aside');
    if (!aside) return false;
    if (document.getElementById('tb-latest-teknoblog')) return true;
    const panel = buildPanel();
    aside.prepend(panel);
    loadLatest();
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (insertPanel() || tries > 30) clearInterval(timer);
  }, 300);

  document.addEventListener('DOMContentLoaded', insertPanel);
})();
