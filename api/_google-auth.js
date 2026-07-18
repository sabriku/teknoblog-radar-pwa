import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { queryLocal } from './_lib.js';

function keyMaterial() {
  const secret = process.env.GOOGLE_CREDENTIAL_ENCRYPTION_KEY || process.env.CRON_TOKEN || '';
  if (!secret) throw new Error('Google kimlik bilgilerini şifrelemek için CRON_TOKEN gerekli.');
  return createHash('sha256').update(secret).digest();
}
function encrypt(value) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
function decrypt(value) {
  const [iv, tag, data] = String(value || '').split('.'); if (!iv || !tag || !data) return {};
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'));
}
export async function getGoogleConfig() {
  const result = await queryLocal(`SELECT encrypted_value FROM app_secrets WHERE key='google_search_console' LIMIT 1`);
  const stored = result.rows[0]?.encrypted_value ? decrypt(result.rows[0].encrypted_value) : {};
  return { client_id: process.env.GOOGLE_CLIENT_ID || stored.client_id || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || stored.client_secret || '', refresh_token: process.env.GOOGLE_REFRESH_TOKEN || stored.refresh_token || '', site_url: process.env.GSC_SITE_URL || stored.site_url || 'sc-domain:teknoblog.com', connected_at: stored.connected_at || null };
}
export async function saveGoogleConfig(config) {
  const merged = { ...(await getGoogleConfig()), ...config };
  await queryLocal(`INSERT INTO app_secrets(key,encrypted_value,updated_at) VALUES('google_search_console',$1,NOW()) ON CONFLICT(key) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,updated_at=NOW()`, [encrypt(merged)]);
  return merged;
}
export function createOAuthState() {
  const timestamp = String(Date.now()); const signature = createHmac('sha256', keyMaterial()).update(timestamp).digest('base64url');
  return `${timestamp}.${signature}`;
}
export function verifyOAuthState(state = '') {
  const [timestamp, signature] = String(state).split('.');
  if (!timestamp || !signature || Date.now() - Number(timestamp) > 15 * 60 * 1000) return false;
  const expected = createHmac('sha256', keyMaterial()).update(timestamp).digest(); const supplied = Buffer.from(signature, 'base64url');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export async function googleAccessToken() {
  if (process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN) return process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN;
  const config = await getGoogleConfig(); if (!config.client_id || !config.client_secret || !config.refresh_token) return '';
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.client_id, client_secret: config.client_secret, refresh_token: config.refresh_token, grant_type: 'refresh_token' }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error_description || data.error || 'Google OAuth başarısız');
  return data.access_token || '';
}
