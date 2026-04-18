const state = {
  items: [],
  selected: new Set(),
  sources: [],
};

const cardsEl = document.getElementById('cards');
const statusBarEl = document.getElementById('statusBar');
const scoreFilterEl = document.getElementById('scoreFilter');
const scoreFilterValueEl = document.getElementById('scoreFilterValue');
const sortSelectEl = document.getElementById('sortSelect');
const typeSelectEl = document.getElementById('typeSelect');
const refreshBtn = document.getElementById('refreshBtn');
const copySelectedBtn = document.getElementById('copySelectedBtn');
const sourceForm = document.getElementById('sourceForm');
const sourcesList = document.getElementById('sourcesList');

function setStatus(text) {
  statusBarEl.textContent = text;
}

function formatDate(value) {
  if (!value) return 'Tarih yok';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Tarih yok';
  return d.toLocaleString('tr-TR');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Kopyalandı');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    setStatus('Kopyalandı');
  }
}

function renderCards() {
  cardsEl.innerHTML = '';
  if (!state.items.length) {
    cardsEl.innerHTML = '<div class="status-bar">Henüz gösterilecek veri yok.</div>';
    return;
  }

  for (const item of state.items) {
    const checked = state.selected.has(item.url) ? 'checked' : '';
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <input type="checkbox" class="select-box" data-url="${item.url}" ${checked} aria-label="Haberi seç">
      <img src="${item.image_url || '/icon-512.png'}" alt="">
      <div class="card-content">
        <div class="meta">
          <span class="score-badge">Toplam ${item.total_score ?? 0}</span>
          <span class="chip">Discover ${item.discover_score ?? 0}</span>
          <span class="chip">Trafik ${item.traffic_score ?? 0}</span>
          <span class="chip">${item.content_type_hint || 'analysis'}</span>
        </div>
        <h3>${item.title || ''}</h3>
        <p class="summary">${item.summary || ''}</p>
        <div class="meta">
          <span class="chip">${formatDate(item.published_at || item.updated_at)}</span>
        </div>
        <div class="card-actions">
          <a class="button secondary" href="${item.url}" target="_blank" rel="noopener noreferrer">Haberi aç</a>
          <button class="button ghost copy-one" data-url="${item.url}">URL kopyala</button>
        </div>
      </div>
    `;
    cardsEl.appendChild(card);
  }

  cardsEl.querySelectorAll('.select-box').forEach((el) => {
    el.addEventListener('change', (event) => {
      const url = event.currentTarget.dataset.url;
      if (event.currentTarget.checked) state.selected.add(url);
      else state.selected.delete(url);
    });
  });

  cardsEl.querySelectorAll('.copy-one').forEach((el) => {
    el.addEventListener('click', async (event) => {
      await copyText(event.currentTarget.dataset.url);
    });
  });
}

async function loadRecommendations() {
  setStatus('Öneriler yükleniyor...');
  const params = new URLSearchParams({
    sortBy: sortSelectEl.value,
    minScore: scoreFilterEl.value,
    contentType: typeSelectEl.value,
  });
  const response = await fetch(`/api/recommendations?${params.toString()}`);
  const payload = await response.json();
  state.items = payload.items || [];
  renderCards();
  setStatus(`${state.items.length} öneri listelendi`);
}

async function loadSources() {
  const response = await fetch('/api/sources');
  const payload = await response.json();
  state.sources = payload.items || [];
  sourcesList.innerHTML = state.sources.map((item) => `
    <div class="source-item">
      <strong>${item.name}</strong>
      <span>${item.rss_url || item.feed_url || ''}</span>
    </div>
  `).join('');
}

refreshBtn.addEventListener('click', loadRecommendations);
copySelectedBtn.addEventListener('click', async () => {
  const text = Array.from(state.selected).join('\n');
  if (!text) return setStatus('Önce en az bir haber seçin');
  await copyText(text);
});

scoreFilterEl.addEventListener('input', () => {
  scoreFilterValueEl.textContent = scoreFilterEl.value;
});
scoreFilterEl.addEventListener('change', loadRecommendations);
sortSelectEl.addEventListener('change', loadRecommendations);
typeSelectEl.addEventListener('change', loadRecommendations);

sourceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(sourceForm);
  const body = Object.fromEntries(form.entries());
  setStatus('Kaynak ekleniyor...');
  const response = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    setStatus(payload.error || 'Kaynak eklenemedi');
    return;
  }
  sourceForm.reset();
  setStatus('Kaynak eklendi');
  await loadSources();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

loadRecommendations();
loadSources();
