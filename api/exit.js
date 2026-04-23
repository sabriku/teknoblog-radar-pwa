import { json } from './_lib.js';
import { clearSession } from './lock.js';

export default async function handler(req, res) {
  try {
    clearSession(res);
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
