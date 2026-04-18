async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function typeLabel(type) {
  return {
    hot_news: 'Bugün haber olur',
    launch: 'Lansman',
    update: 'Güncelleme',
    guide: 'Rehbere dönüşür',
    comparison: 'Karşılaştırma',
    deal: 'Dönüşüm potansiyeli yüksek',
    analysis: 'Analiz'
  }[type] || 'Diğer';
}

function renderRecommendations(items) {
  const container = document.getElementById('recommendations');
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<p>Filtreye uygun öneri yok.</p>';
    return;
  }
  for (const item of items) {
    const el = document.createElement('article');
    el.className = 'item';
    el.innerHTML = `
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary || '')}</p>
      <div class="meta">
        <span class="badge">${typeLabel(item.content_type_hint)}</span>
        <span class="badge">Toplam: ${item.total_score}</span>
        <span class="badge">Trafik: ${item.traffic_score}</span>
        <span class="badge">Dönüşüm: ${item.conversion_score}</span>
        <span class="badge">Discover: ${item.discover_score}</span>
        <span class="badge">Sosyal: ${item.social_score}</span>
        <span class="badge">Editoryal: ${item.editorial_score}</span>
        ${item.source_name ? `<span class="badge">Kaynak: ${escapeHtml(item.source_name)}</span>` : ''}
      </div>
    `;
    container.appendChild(el);
  }
}

async function load() {
  const status = document.getElementById('status');
  status.textContent = 'Bağlantı kontrol ediliyor...';
  const type = document.getElementById('typeFilter').value;
  const url = type ? `/api/recommendations?type=${encodeURIComponent(type)}` : '/api/recommendations';
  const [health, recs] = await Promise.all([fetchJSON('/api/health'), fetchJSON(url)]);
  status.innerHTML = `Sunucu: ${health.status}<br>Veritabanı: ${health.database || 'bilinmiyor'}<br>Zaman: ${health.now}`;
  const min = Number(document.getElementById('scoreFilter').value);
  renderRecommendations((recs.items || []).filter(x => Number(x.total_score) >= min));
}

async function runPipeline() {
  const token = document.getElementById('cronToken').value.trim();
  if (!token) return alert('CRON_TOKEN girin.');
  const data = await fetchJSON(`/api/run-pipeline?token=${encodeURIComponent(token)}`);
  alert(`Pipeline tamamlandı. İşlenen kayıt: ${data.processed}`);
  await load();
}

document.getElementById('refreshBtn').addEventListener('click', load);
document.getElementById('runPipelineBtn').addEventListener('click', runPipeline);
document.getElementById('scoreFilter').addEventListener('input', async (e) => {
  document.getElementById('scoreFilterValue').textContent = e.target.value;
  await load();
});
document.getElementById('typeFilter').addEventListener('change', load);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

load().catch(err => {
  document.getElementById('status').textContent = `Hata: ${err.message}`;
});
