import { getSupabaseAdmin, json, nowIso } from './_lib.js';

const SHARED_STATUS = 'slack_sent_state';

function escapeText(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
}

function normalizeReferences(item = {}) {
  const candidates = [
    ...(Array.isArray(item.references) ? item.references : []),
    ...(Array.isArray(item.source_timeline) ? item.source_timeline : []),
    ...(Array.isArray(item.editorial_package?.references) ? item.editorial_package.references : [])
  ];
  const seen = new Set([normalizeUrl(item.url)].filter(Boolean));
  const references = [];
  for (const reference of candidates) {
    const url = normalizeUrl(reference?.url || reference?.link || reference?.canonical_url);
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) continue;
    seen.add(url);
    references.push({
      url,
      source_name: String(reference?.source_name || reference?.source || reference?.publisher || 'Kaynak').trim(),
      title: String(reference?.title || '').trim()
    });
    if (references.length >= 6) break;
  }
  return references;
}

async function readSharedSentUrls(supabase) {
  try {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('id,notes')
      .eq('status', SHARED_STATUS)
      .order('id', { ascending: false })
      .limit(1);

    if (error) return { rowId: null, urls: [] };
    const row = Array.isArray(data) ? (data[0] || null) : null;
    if (!row) return { rowId: null, urls: [] };

    try {
      const parsed = JSON.parse(String(row.notes || '[]'));
      const urls = Array.isArray(parsed) ? parsed.map(normalizeUrl).filter(Boolean) : [];
      return { rowId: row.id, urls };
    } catch {
      return { rowId: row.id, urls: [] };
    }
  } catch {
    return { rowId: null, urls: [] };
  }
}

async function writeSharedSentUrls(supabase, rowId, urls) {
  const normalized = [...new Set((urls || []).map(normalizeUrl).filter(Boolean))].slice(-5000);
  const payload = {
    status: SHARED_STATUS,
    ingested_count: 0,
    processed_count: 0,
    finished_at: nowIso(),
    notes: JSON.stringify(normalized)
  };

  try {
    if (rowId) {
      const { error } = await supabase.from('pipeline_runs').update(payload).eq('id', rowId);
      if (!error) return normalized;
    }

    const { error } = await supabase.from('pipeline_runs').insert(payload);
    if (error) return normalized;
    return normalized;
  } catch {
    return normalized;
  }
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();

    if (req.method === 'GET') {
      const shared = await readSharedSentUrls(supabase);
      return json(res, 200, { ok: true, items: shared.urls });
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' });
    }

    const webhookUrl = process.env.SLACK_KAYNAK_WEBHOOK_URL || '';
    if (!webhookUrl) {
      return json(res, 500, { error: 'Missing environment variable: SLACK_KAYNAK_WEBHOOK_URL' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const items = Array.isArray(body.items) ? body.items : [];

    const normalized = items
      .map((item) => ({
        title: String(item?.title || '').trim(),
        url: normalizeUrl(String(item?.url || '').trim()),
        source_name: String(item?.source_name || '').trim(),
        published_at: String(item?.published_at || '').trim(),
        references: normalizeReferences(item)
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
        item.url,
        ...(item.references.length ? [
          '',
          '*Referans haberler:*',
          ...item.references.map((reference, index) => {
            const label = [reference.source_name, reference.title].filter(Boolean).join(' — ').slice(0, 150) || `Referans ${index + 1}`;
            return `${index + 1}. <${reference.url}|${escapeText(label)}>`;
          })
        ] : [])
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

    const shared = await readSharedSentUrls(supabase);
    const mergedUrls = [...shared.urls, ...normalized.map((item) => item.url)];
    const storedUrls = await writeSharedSentUrls(supabase, shared.rowId, mergedUrls);

    return json(res, 200, {
      ok: errors.length === 0,
      sent,
      requested: normalized.length,
      errors: errors.slice(0, 10),
      shared_urls: storedUrls
    });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
