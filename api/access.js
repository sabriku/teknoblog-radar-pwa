import { json } from './_lib.js';
import { checkPassword, clearSession, makeToken, readSession, setSession } from '../lib/lock.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return json(res, 200, { unlocked: Boolean(readSession(req)) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const password = String(body.password || '');
      if (!checkPassword(password)) return json(res, 401, { error: 'Şifre yanlış' });
      setSession(res, makeToken());
      return json(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      clearSession(res);
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
