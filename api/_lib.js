function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function getEnv() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(k => !process.env[k]);
  return { ok: missing.length === 0, missing };
}

async function supabaseFetch(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  }
  return data;
}

function scoreItem(item) {
  const title = (item.title || '').toLowerCase();
  const summary = (item.summary || '').toLowerCase();
  const text = `${title} ${summary}`;

  let traffic = 40;
  let conversion = 20;
  let discover = 30;
  let social = 25;
  let editorial = 40;

  if (/iphone|galaxy|samsung|apple|android|windows|one ui|ios/.test(text)) traffic += 22;
  if (/indirim|fiyat|kampanya|satın alma|karşılaştırma|aksesuar|en iyi/.test(text)) conversion += 35;
  if (/nasıl|nedir|rehber|karşılaştırma|liste|ipuçları/.test(text)) discover += 25;
  if (/sızıntı|renk|tasarım|duyuruldu|güncelleme|geldi/.test(text)) social += 25;
  if (/türkiye|resmi|inceleme|teknoblog/.test(text)) editorial += 15;

  const total = Math.min(100, Math.round((traffic * 0.30) + (conversion * 0.25) + (discover * 0.20) + (social * 0.15) + (editorial * 0.10)));
  return {
    traffic_score: Math.min(100, traffic),
    conversion_score: Math.min(100, conversion),
    discover_score: Math.min(100, discover),
    social_score: Math.min(100, social),
    editorial_score: Math.min(100, editorial),
    total_score: total
  };
}

module.exports = { json, getEnv, supabaseFetch, scoreItem };
