(() => {
  const STORAGE_KEY = 'tb_sent_to_slack_urls';

  function normalizeUrl(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.origin);
      url.hash = '';
      return url.toString();
    } catch {
      return raw;
    }
  }

  function readSentUrls() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || '[]';
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeUrl).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function writeSentUrls(urls) {
    try {
      const normalized = [...new Set(urls.map(normalizeUrl).filter(Boolean))];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {}
  }

  async function syncSharedSentUrls() {
    try {
      const res = await fetch('/api/push-to-slack', { cache: 'no-store', credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return readSentUrls();
      const shared = Array.isArray(data?.items) ? data.items.map(normalizeUrl).filter(Boolean) : [];
      const merged = [...readSentUrls(), ...shared];
      writeSentUrls(merged);
      return merged;
    } catch {
      return readSentUrls();
    }
  }

  function markArticleAsSent(article) {
    if (!article || article.getAttribute('data-slack-sent') === 'true') return;
    article.setAttribute('data-slack-sent', 'true');
    article.style.background = '#e5e7eb';
    article.style.borderColor = '#cbd5e1';
    article.style.boxShadow = 'none';
    article.style.opacity = '0.94';

    const title = article.querySelector('h3');
    if (title) title.style.opacity = '0.92';

    const cardButton = article.querySelector('[data-card-slack-button]');
    if (cardButton) {
      cardButton.disabled = true;
      cardButton.textContent = '✓';
      cardButton.title = 'Slack\'e gönderildi';
      cardButton.style.opacity = '0.72';
      cardButton.style.cursor = 'default';
    }

    let badge = article.querySelector('[data-slack-sent-badge]');
    if (!badge) {
      badge = document.createElement('div');
      badge.setAttribute('data-slack-sent-badge', 'true');
      badge.textContent = 'Slack\'e gönderildi';
      badge.style.position = 'absolute';
      badge.style.right = '12px';
      badge.style.bottom = '12px';
      badge.style.padding = '6px 10px';
      badge.style.borderRadius = '999px';
      badge.style.background = '#4a154b';
      badge.style.color = '#fff';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = '700';
      badge.style.zIndex = '2';
      article.style.position = article.style.position || 'relative';
      article.appendChild(badge);
    }
  }

  function restoreSentCardStyles() {
    const sent = new Set(readSentUrls());
    if (!sent.size) return;
    const inputs = [...document.querySelectorAll('input[data-select-url]')];
    inputs.forEach((input) => {
      const url = normalizeUrl(input.getAttribute('data-select-url') || '');
      if (!url || !sent.has(url)) return;
      const article = input.closest('article');
      markArticleAsSent(article);
    });
  }

  function watchForRerenders() {
    const app = document.getElementById('app') || document.body;
    const observer = new MutationObserver(() => {
      restoreSentCardStyles();
      insertSlackButton();
      insertCardSlackButtons();
    });
    observer.observe(app, { childList: true, subtree: true });
  }

  function setSlackButtonState(isLoading) {
    const btn = document.getElementById('tb-push-slack');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.style.opacity = isLoading ? '0.7' : '1';
    btn.style.cursor = isLoading ? 'wait' : 'pointer';
    btn.textContent = isLoading ? 'Slack\'e gönderiliyor...' : 'Slack\'e Gönder';
  }

  function insertSlackButton() {
    if (document.getElementById('tb-push-slack')) return true;
    const copyBtn = document.getElementById('tb-copy-selected');
    if (!copyBtn || !copyBtn.parentElement) return false;

    const btn = document.createElement('button');
    btn.id = 'tb-push-slack';
    btn.type = 'button';
    btn.textContent = 'Slack\'e Gönder';
    btn.style.padding = '10px 14px';
    btn.style.border = '1px solid #4a154b';
    btn.style.borderRadius = '12px';
    btn.style.background = '#fff';
    btn.style.color = '#4a154b';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';

    copyBtn.parentElement.appendChild(btn);
    return true;
  }

  function itemFromArticle(article) {
    if (!article) return null;
    const input = article.querySelector('input[data-select-url]');
    const dataUrl = input?.getAttribute('data-select-url') || '';
    const titleEl = article.querySelector('h3');
    const metaEls = [...article.querySelectorAll('div[style*="font-size:12px;color:#64748b"] > div')];
    const actionLink = article.querySelector('a[href]');
    const title = titleEl?.textContent?.trim() || '';
    const published_at = metaEls[0]?.textContent?.trim() || '';
    const source_name = metaEls[1]?.textContent?.trim() || '';
    const url = normalizeUrl(dataUrl || actionLink?.href || '');
    if (!title || !url) return null;
    return { title, url, source_name, published_at, article };
  }

  function selectedItemsFromDom() {
    const selected = [...document.querySelectorAll('input[data-select-url]:checked')];
    return selected.map((input) => itemFromArticle(input.closest('article'))).filter(Boolean);
  }

  function buildCardSlackButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-card-slack-button', 'true');
    btn.textContent = 'S';
    btn.title = 'Slack\'e gönder';
    btn.style.position = 'absolute';
    btn.style.top = '12px';
    btn.style.right = '12px';
    btn.style.width = '30px';
    btn.style.height = '30px';
    btn.style.borderRadius = '999px';
    btn.style.border = '1px solid #4a154b';
    btn.style.background = '#fff';
    btn.style.color = '#4a154b';
    btn.style.fontWeight = '800';
    btn.style.fontSize = '13px';
    btn.style.lineHeight = '1';
    btn.style.cursor = 'pointer';
    btn.style.zIndex = '3';
    btn.style.boxShadow = '0 4px 12px rgba(74,21,75,.12)';
    return btn;
  }

  function insertCardSlackButtons() {
    const articles = [...document.querySelectorAll('article')].filter((article) => article.querySelector('input[data-select-url]'));
    const sent = new Set(readSentUrls());
    articles.forEach((article) => {
      article.style.position = article.style.position || 'relative';
      if (!article.querySelector('[data-card-slack-button]')) {
        article.appendChild(buildCardSlackButton());
      }
      const item = itemFromArticle(article);
      if (item?.url && sent.has(item.url)) {
        markArticleAsSent(article);
      }
    });
  }

  async function postItemsToSlack(items = []) {
    const response = await fetch('/api/push-to-slack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ items: items.map(({ article, ...rest }) => rest) })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
  }

  async function pushItemsToSlack(items, statusText = 'Seçili haberler Slack kanalına gönderiliyor...') {
    const status = document.getElementById('tb-status');
    if (status) status.textContent = statusText;

    const data = await postItemsToSlack(items);
    const merged = [...readSentUrls(), ...(Array.isArray(data?.shared_urls) ? data.shared_urls : items.map((item) => item.url))];
    writeSentUrls(merged);
    items.forEach((item) => markArticleAsSent(item.article));
    restoreSentCardStyles();

    if (status) {
      status.textContent = `Slack gönderimi tamamlandı. Gönderilen: ${data.sent ?? 0}, seçilen: ${data.requested ?? items.length}`;
    }
    return data;
  }

  async function pushSelectedToSlack() {
    const status = document.getElementById('tb-status');
    const items = selectedItemsFromDom();
    if (!items.length) {
      alert('Önce en az bir içerik seçin.');
      return;
    }

    setSlackButtonState(true);

    try {
      await pushItemsToSlack(items);
    } catch (error) {
      if (status) status.textContent = `Slack hatası: ${String(error.message || error)}`;
    } finally {
      setSlackButtonState(false);
    }
  }

  async function pushSingleArticleToSlack(button) {
    const status = document.getElementById('tb-status');
    const article = button.closest('article');
    const item = itemFromArticle(article);
    if (!item) return;

    const original = button.textContent;
    button.disabled = true;
    button.textContent = '…';
    button.style.cursor = 'wait';
    button.style.opacity = '0.7';

    try {
      await pushItemsToSlack([item], 'Haber Slack kanalına gönderiliyor...');
      button.textContent = '✓';
      button.title = 'Slack\'e gönderildi';
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      button.style.cursor = 'pointer';
      button.style.opacity = '1';
      if (status) status.textContent = `Slack hatası: ${String(error.message || error)}`;
    }
  }

  document.addEventListener('click', async (event) => {
    const cardBtn = event.target.closest('[data-card-slack-button]');
    if (cardBtn) {
      event.preventDefault();
      event.stopPropagation();
      if (!cardBtn.disabled) await pushSingleArticleToSlack(cardBtn);
      return;
    }

    const btn = event.target.closest('#tb-push-slack');
    if (!btn) return;
    await pushSelectedToSlack();
  });

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    restoreSentCardStyles();
    insertCardSlackButtons();
    if (insertSlackButton() || tries > 30) clearInterval(timer);
  }, 300);

  document.addEventListener('DOMContentLoaded', async () => {
    insertSlackButton();
    insertCardSlackButtons();
    await syncSharedSentUrls();
    restoreSentCardStyles();
    insertCardSlackButtons();
    watchForRerenders();
    setTimeout(() => {
      restoreSentCardStyles();
      insertCardSlackButtons();
    }, 1000);
    setTimeout(async () => {
      await syncSharedSentUrls();
      restoreSentCardStyles();
      insertCardSlackButtons();
    }, 2500);
  });
})();
