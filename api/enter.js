import { json } from './_lib.js';
import { checkPassword, makeToken, setSession } from './lock.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const password = String(body.password || '');
    if (!checkPassword(password)) return json(res, 401, { error: 'Şifre yanlış' });
    setSession(res, makeToken());
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
