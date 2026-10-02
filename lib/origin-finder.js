import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function hostFor(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/\.$/, ''); } catch { return ''; }
}

function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)));
  }
  if (isIP(address) === 6) return !/^(::|fc|fd|fe8|fe9|fea|feb|::ffff:)/i.test(address);
  return false;
}

export function isAllowedArticleUrl(articleUrl, siteUrl) {
  try {
    const article = new URL(articleUrl);
    const site = new URL(siteUrl);
    if (article.protocol !== 'https:' || site.protocol !== 'https:' || article.username || article.password) return false;
    const host = article.hostname.toLowerCase();
    const siteHost = site.hostname.toLowerCase();
    return !isIP(host) && !/^(localhost|.*\.local|.*\.internal)$/i.test(host)
      && (host === siteHost || host.endsWith(`.${siteHost}`));
  } catch { return false; }
}

export function officialLinksInHtml(html, articleUrl, officialSources = []) {
  const candidates = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    const href = match[2].replace(/&amp;/g, '&');
    let url;
    try { url = new URL(href, articleUrl); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    const official = officialSources.find((source) => {
      const host = hostFor(source.site_url).replace(/^www\./, '');
      return host && (url.hostname === host || url.hostname.endsWith(`.${host}`));
    });
    if (!official || seen.has(url.href)) continue;
    const anchor = match[3].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!/[\p{L}\p{N}]/u.test(anchor)) continue;
    seen.add(url.href);
    candidates.push({ url: url.href, official_name: official.name, anchor_text: anchor,
      found_on: articleUrl, status: 'candidate_only' });
    if (candidates.length >= 12) break;
  }
  return candidates;
}

export async function fetchArticleLinks(source, officialSources, { fetchImpl = fetch, lookupImpl = lookup } = {}) {
  if (!isAllowedArticleUrl(source.url, source.site_url)) return [];
  const host = hostFor(source.url);
  const addresses = await lookupImpl(host, { all: true });
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) return [];
  const response = await fetchImpl(source.url, { redirect: 'manual',
    headers: { Accept: 'text/html', 'User-Agent': 'TeknoblogRadar/1.0 (+https://radar.teknolojisk.com)' },
    signal: AbortSignal.timeout(7000) });
  if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html') || !response.body) return [];
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < 256 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = 256 * 1024 - size;
      chunks.push(Buffer.from(value.subarray(0, remaining)));
      size += Math.min(value.length, remaining);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return officialLinksInHtml(Buffer.concat(chunks).toString('utf8'), source.url, officialSources);
}
