import { json } from './_lib.js';
import { requireAuthorizedRequest } from './auth.js';

function escapeText(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' });
    }

    const access = await requireAuthorizedRequest(req, res);
    if (!access) return;

    const webhookUrl = process.env.SLACK_KAYNAK_WEBHOOK_URL || '';
    if (!webhookUrl) {
      return json(res, 500, { error: 'Missing environment variable: SLACK_KAYNAK_WEBHOOK_URL' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const items = Array.isArray(body.items) ? body.items : [];

    const normalized = items
      .map((item) => ({
        title: String(item?.title || '').trim(),
        url: String(item?.url || '').trim(),
        source_name: String(item?.source_name || '').trim(),
        published_at: String(item?.published_at || '').trim()
      }))
      .filter((item) => item.title && item.url)
      .slice(0, 30);

    if (!normalized.length) {
      return json(res, 400, { error: 'Gönderilecek haber bulunamadı.' });
    }

    let sent = 0;
    const errors = [];

    for (const item of normalized) {
      const lines = [
        `*${escapeText(item.title)}*`,
        item.source_name ? `Kaynak: ${escapeText(item.source_name)}` : '',
        item.published_at ? `Tarih: ${escapeText(item.published_at)}` : '',
        item.url
      ].filter(Boolean);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          text: lines.join('\n')
        })
      });

      if (response.ok) {
        sent += 1;
      } else {
        const text = await response.text();
        errors.push(text || `HTTP ${response.status}`);
      }

      await sleep(1100);
    }

    return json(res, 200, {
      ok: errors.length === 0,
      sent,
      requested: normalized.length,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
