import { json, safeText } from './_lib.js';

function getIstanbulDayBounds() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';

  const start = `${year}-${month}-${day}T00:00:00+03:00`;
  const end = `${year}-${month}-${day}T23:59:59+03:00`;
  const dayKey = `${year}-${month}-${day}`;
  return { start, end, dayKey };}

async function fetchPage(page, start, end) {
  const url = new URL('https://www.teknoblog.com/wp-json/wp/v2/posts');
  url.searchParams.set('after', start);
  url.searchParams.set('before', end);
  url.searchParams.set('per_page', '100');
  url.searchParams.set('page', String(page));
  url.searchParams.set('_fields', 'link,date,title');
  url.searchParams.set('orderby', 'date');
  url.searchParams.set('order', 'desc');

  const response = await fetch(url.toString(), {
    headers: {
      'user-agent': 'Mozilla/5.0 TeknoblogRadarBot/1.0',
      'accept': 'application/json, */*;q=0.8'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Teknoblog API alınamadı: HTTP ${response.status}${text ? ` - ${text}` : ''}`);
  }

  const items = await response.json();
  const totalPages = Number(response.headers.get('X-WP-TotalPages') || '1');
  return { items: Array.isArray(items) ? items : [], totalPages };
}

export default async function handler(req, res) {
  try {
    const { start, end, dayKey } = getIstanbulDayBounds();
    const all = [];
    let page = 1;
    let totalPages = 1;

    do {
      const result = await fetchPage(page, start, end);
      totalPages = result.totalPages || 1;
      all.push(...result.items);
      page += 1;
    } while (page <= totalPages && page <= 20);

    const items = all
      .map((item) => ({
        title: safeText(item?.title?.rendered || ''),
        url: item?.link || '',
        published_at: item?.date || ''
      }))
      .filter((item) => item.title && item.url)
      .sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());

    return json(res, 200, { items, day_key: dayKey, total: items.length });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
