import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { queryLocal } from './_lib.js';

function keyMaterial() {
  const secret = process.env.GOOGLE_CREDENTIAL_ENCRYPTION_KEY || process.env.CRON_TOKEN || '';
  if (!secret) throw new Error('Uygulama sırlarını şifrelemek için CRON_TOKEN gerekli.');
  return createHash('sha256').update(secret).digest();
}

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decrypt(value) {
  const [iv, tag, data] = String(value || '').split('.');
  if (!iv || !tag || !data) return {};
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'));
}

export async function getAppSecret(key) {
  const result = await queryLocal('SELECT encrypted_value FROM app_secrets WHERE key=$1 LIMIT 1', [key]);
  return result.rows[0]?.encrypted_value ? decrypt(result.rows[0].encrypted_value) : {};
}

export async function saveAppSecret(key, value) {
  await queryLocal(`INSERT INTO app_secrets(key,encrypted_value,updated_at) VALUES($1,$2,NOW())
    ON CONFLICT(key) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,updated_at=NOW()`, [key, encrypt(value)]);
  return true;
}
