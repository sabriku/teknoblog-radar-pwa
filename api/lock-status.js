import { json } from './_lib.js';
import { readSession } from './lock.js';

export default async function handler(req, res) {
  try {
    return json(res, 200, { unlocked: Boolean(readSession(req)) });
  } catch (error) {
    return json(res, 500, { error: error?.message || String(error) });
  }
}
