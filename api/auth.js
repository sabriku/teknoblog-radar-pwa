import { getSupabaseAdmin, json } from './_lib.js';

export function getAuthorizedEmails() {
  return String(process.env.AUTHORIZED_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email = '') {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  return getAuthorizedEmails().includes(normalized);
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function getAuthorizedUserFromRequest(req) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, reason: 'missing_token' };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, reason: 'invalid_session', error: error?.message || 'Invalid session' };
  }

  const email = String(data.user.email || '').trim().toLowerCase();
  if (!isAllowedEmail(email)) {
    return { ok: false, reason: 'email_not_allowed', email };
  }

  return { ok: true, user: data.user, email };
}

export async function requireAuthorizedRequest(req, res, options = {}) {
  const expectedCron = process.env.CRON_TOKEN || '';
  const providedCron = req.query?.token || req.headers?.['x-cron-token'] || '';

  if (options.allowCronToken && expectedCron && providedCron === expectedCron) {
    return { ok: true, via: 'cron_token' };
  }

  const result = await getAuthorizedUserFromRequest(req);
  if (!result.ok) {
    json(res, 401, { error: 'Yetkisiz istek' });
    return null;
  }

  return { ok: true, via: 'session', user: result.user, email: result.email };
}
