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

  function selectedItemsFromDom() {
    const selected = [...document.querySelectorAll('input[data-select-url]:checked')];
    return selected.map((input) => {
      const dataUrl = input.getAttribute('data-select-url') || '';
      const article = input.closest('article');
      const titleEl = article?.querySelector('h3');
      const metaEls = article ? [...article.querySelectorAll('div[style*="font-size:12px;color:#64748b"] > div')] : [];
      const actionLink = article?.querySelector('a[href]');
      const title = titleEl?.textContent?.trim() || '';
      const published_at = metaEls[0]?.textContent?.trim() || '';
      const source_name = metaEls[1]?.textContent?.trim() || '';
      return {
        title,
        url: normalizeUrl(dataUrl || actionLink?.href || ''),
        source_name,
        published_at,
        article
      };
    }).filter((item) => item.title && item.url);
  }

  async function pushSelectedToSlack() {
    const status = document.getElementById('tb-status');
    const items = selectedItemsFromDom();
    if (!items.length) {
      alert('Önce en az bir içerik seçin.');
      return;
    }

    setSlackButtonState(true);
    if (status) status.textContent = 'Seçili haberler Slack kanalına gönderiliyor...';

    try {
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

      const merged = [...readSentUrls(), ...(Array.isArray(data?.shared_urls) ? data.shared_urls : items.map((item) => item.url))];
      writeSentUrls(merged);
      items.forEach((item) => markArticleAsSent(item.article));
      restoreSentCardStyles();

      if (status) {
        status.textContent = `Slack gönderimi tamamlandı. Gönderilen: ${data.sent ?? 0}, seçilen: ${data.requested ?? items.length}`;
      }
    } catch (error) {
      if (status) status.textContent = `Slack hatası: ${String(error.message || error)}`;
    } finally {
      setSlackButtonState(false);
    }
  }

  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('#tb-push-slack');
    if (!btn) return;
    await pushSelectedToSlack();
  });

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    restoreSentCardStyles();
    if (insertSlackButton() || tries > 30) clearInterval(timer);
  }, 300);

  document.addEventListener('DOMContentLoaded', async () => {
    insertSlackButton();
    await syncSharedSentUrls();
    restoreSentCardStyles();
    watchForRerenders();
    setTimeout(restoreSentCardStyles, 1000);
    setTimeout(async () => {
      await syncSharedSentUrls();
      restoreSentCardStyles();
    }, 2500);
  });
})();
