import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from './_lib.js';

const COOKIE_NAME = 'tb_radar_lock';

function secret() {
  return String(process.env.RADAR_APP_SECRET || '').trim();
}

function passwordValue() {
  return String(process.env.RADAR_APP_PASSWORD || '').trim();
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function parseCookies(req) {
  const raw = String(req.headers?.cookie || '');
  return raw.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export function makeToken() {
  const body = Buffer.from(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readSession(req) {
  try {
    const token = parseCookies(req)[COOKIE_NAME] || '';
    const [body, sig] = String(token).split('.');
    if (!body || !sig || !secret()) return null;
    const expected = sign(body);
    const left = Buffer.from(sig);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.exp || Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSession(res, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=2592000'
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSession(res) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function checkPassword(value = '') {
  return Boolean(passwordValue() && secret()) && String(value) === passwordValue();
}

export function requireLock(req, res) {
  if (readSession(req)) return true;
  json(res, 401, { error: 'Şifre gerekli' });
  return false;
}
