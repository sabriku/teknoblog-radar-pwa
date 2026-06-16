import { json } from './_lib.js';

function safeText(value, max = 2800) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function buildMessage(body = {}) {
  const title = safeText(body.title || 'Başlıksız haber', 240);
  const url = safeText(body.url || body.link || '', 1000);
  const source = safeText(body.source || body.source_name || 'Kaynak yok', 160);
  const summary = safeText(body.summary || body.excerpt || body.description || '', 500);
  const score = Number.isFinite(Number(body.score)) ? Math.round(Number(body.score)) : null;
  const imageUrl = safeText(body.image_url || body.image || body.thumbnail || '', 1000);
  const text = `Teknoblog Radar: ${title}${url ? `\n${url}` : ''}`;

  const fields = [
    { type: 'mrkdwn', text: `*Kaynak:*\n${source}` },
    score !== null ? { type: 'mrkdwn', text: `*Skor:*\n${score}` } : null
  ].filter(Boolean);

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${title}*${url ? `\n<${url}|Kaynak haberi aç>` : ''}`
      },
      ...(imageUrl ? { accessory: { type: 'image', image_url: imageUrl, alt_text: title } } : {})
    },
    ...(summary ? [{ type: 'section', text: { type: 'mrkdwn', text: summary } }] : []),
    ...(fields.length ? [{ type: 'section', fields }] : []),
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Teknoblog İçerik Radar · Yazılacaklar havuzuna da eklenebilir' }] }
  ];

  return { text, blocks };
}

async function postViaWebhook(webhookUrl, message) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Slack webhook HTTP ${response.status}`);
  return { ok: true, mode: 'webhook' };
}

async function postViaBotToken(token, channel, message) {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ channel, ...message })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `Slack API HTTP ${response.status}`);
  return { ok: true, mode: 'bot', ts: data.ts || null };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const message = buildMessage(body);

    const webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
    const botToken = process.env.SLACK_BOT_TOKEN || '';
    const channel = process.env.SLACK_CHANNEL_ID || process.env.SLACK_CHANNEL || '';

    if (webhookUrl) {
      const result = await postViaWebhook(webhookUrl, message);
      return json(res, 200, result);
    }

    if (botToken && channel) {
      const result = await postViaBotToken(botToken, channel, message);
      return json(res, 200, result);
    }

    return json(res, 501, {
      error: 'Slack yapılandırması yok. SLACK_WEBHOOK_URL veya SLACK_BOT_TOKEN + SLACK_CHANNEL_ID gerekli.',
      missing_config: true
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
