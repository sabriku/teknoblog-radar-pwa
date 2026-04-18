async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

function renderRecommendations(items) {
  const container = document.getElementById('recommendations');
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<p>Henüz öneri yok.</p>';
    return;
  }
  for (const item of items) {
    const el = document.createElement('article');
    el.className = 'item';
    el.innerHTML = `
      <h3>${item.title}</h3>
      <p>${item.summary || ''}</p>
      <div class="meta">
        <span class="badge">Toplam skor: ${item.total_score}</span>
        <span class="badge">Trafik: ${item.traffic_score}</span>
        <span class="badge">Dönüşüm: ${item.conversion_score}</span>
        <span class="badge">Discover: ${item.discover_score}</span>
        <span class="badge">Sosyal: ${item.social_score}</span>
      </div>
    `;
    container.appendChild(el);
  }
}

async function load() {
  const status = document.getElementById('status');
  status.textContent = 'Bağlantı kontrol ediliyor...';
  const [health, recs] = await Promise.all([
    fetchJSON('/api/health'),
    fetchJSON('/api/recommendations')
  ]);
  status.innerHTML = `Sunucu: ${health.status}<br>Veritabanı: ${health.database || 'bilinmiyor'}<br>Zaman: ${health.now}`;
  const min = Number(document.getElementById('scoreFilter').value);
  renderRecommendations((recs.items || []).filter(x => Number(x.total_score) >= min));
}

async function runPipeline() {
  const token = document.getElementById('cronToken').value.trim();
  if (!token) {
    alert('CRON_TOKEN girin.');
    return;
  }
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

load().catch(err => {
  document.getElementById('status').textContent = `Hata: ${err.message}`;
});
