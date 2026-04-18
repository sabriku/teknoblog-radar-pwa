const els = {
  results: document.getElementById('results'),
  resultsMeta: document.getElementById('resultsMeta'),
  sortSelect: document.getElementById('sortSelect'),
  typeSelect: document.getElementById('typeSelect'),
  scoreFilter: document.getElementById('scoreFilter'),
  scoreFilterValue: document.getElementById('scoreFilterValue'),
  searchInput: document.getElementById('searchInput'),
  refreshBtn: document.getElementById('refreshBtn'),
  copySelectedBtn: document.getElementById('copySelectedBtn'),
  cardTemplate: document.getElementById('cardTemplate'),
  sourceForm: document.getElementById('sourceForm'),
  sourcesList: document.getElementById('sourcesList'),
};

let recommendations = [];
let selectedUrls = new Set();

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  return response.json();
}

function scoreMarkup(item) {
  return `
    <span class="score-pill">Toplam ${item.total_score}</span>
    <span class="score-pill">Discover ${item.discover_score}</span>
    <span class="score-pill">Trafik ${item.traffic_score}</span>
  `;
}

function renderCards() {
  const q = els.searchInput.value.trim().toLowerCase();
  const filtered = recommendations.filter(item => !q || item.title.toLowerCase().includes(q));
  els.results.innerHTML = '';
  els.resultsMeta.textContent = `${filtered.length} öneri listeleniyor`;
  if (!filtered.length) {
    els.results.innerHTML = '<div class="empty card">Gösterilecek sonuç yok.</div>';
    return;
  }

  filtered.forEach(item => {
    const node = els.cardTemplate.content.cloneNode(true);
    const card = node.querySelector('.news-card');
    const checkbox = node.querySelector('.pick-item');
    const img = node.querySelector('.thumb');
    const badge = node.querySelector('.type-badge');
    const scoreRow = node.querySelector('.score-row');
    const title = node.querySelector('.card-title');
    const summary = node.querySelector('.card-summary');
    const openLink = node.querySelector('.open-link');
    const copyBtn = node.querySelector('.copy-btn');

    checkbox.checked = selectedUrls.has(item.url);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedUrls.add(item.url);
      else selectedUrls.delete(item.url);
    });

    img.src = item.image_url || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#e7eef5"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#5d7288" font-family="Arial" font-size="24">Teknoblog Radar</text></svg>');
    img.alt = item.title;
    badge.textContent = typeLabel(item.content_type_hint);
    scoreRow.innerHTML = scoreMarkup(item);
    title.textContent = item.title;
    summary.textContent = item.summary || '';
    openLink.href = item.url;
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(item.url);
      copyBtn.textContent = 'Kopyalandı';
      setTimeout(() => { copyBtn.textContent = 'URL kopyala'; }, 1200);
    });
    els.results.appendChild(node);
  });
}

function typeLabel(type) {
  const map = {
    hot_news: 'Sıcak haber',
    launch: 'Lansman',
    update: 'Güncelleme',
    guide: 'Rehber',
    deal: 'Fırsat',
    analysis: 'Analiz'
  };
  return map[type] || type;
}

async function loadRecommendations() {
  const sort = els.sortSelect.value;
  const type = els.typeSelect.value;
  const minScore = els.scoreFilter.value;
  els.scoreFilterValue.textContent = minScore;
  const data = await fetchJson(`/api/recommendations?sort=${encodeURIComponent(sort)}&type=${encodeURIComponent(type)}&minScore=${encodeURIComponent(minScore)}`);
  recommendations = data.items || [];
  renderCards();
}

async function loadSources() {
  const data = await fetchJson('/api/sources');
  const items = data.items || [];
  els.sourcesList.innerHTML = items.map(item => `
    <div class="source-item">
      <strong>${item.name}</strong>
      <small>${item.rss_url}</small>
    </div>
  `).join('');
}

els.sortSelect.addEventListener('change', loadRecommendations);
els.typeSelect.addEventListener('change', loadRecommendations);
els.scoreFilter.addEventListener('input', loadRecommendations);
els.searchInput.addEventListener('input', renderCards);
els.refreshBtn.addEventListener('click', loadRecommendations);
els.copySelectedBtn.addEventListener('click', async () => {
  const urls = [...selectedUrls];
  if (!urls.length) return;
  await navigator.clipboard.writeText(urls.join('\n'));
  els.copySelectedBtn.textContent = 'Kopyalandı';
  setTimeout(() => { els.copySelectedBtn.textContent = "Seçilen URL'leri kopyala"; }, 1200);
});
els.sourceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const payload = Object.fromEntries(fd.entries());
  const result = await fetchJson('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (result.ok) {
    event.currentTarget.reset();
    await loadSources();
  } else {
    alert(result.error || 'Kaynak eklenemedi');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

loadRecommendations();
loadSources();
