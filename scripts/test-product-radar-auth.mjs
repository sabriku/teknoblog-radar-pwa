import assert from 'node:assert/strict';
import { makeToken } from '../lib/lock.js';
import { authorizedProductRefresh } from '../api/product-radar.js';

const previousSecret = process.env.RADAR_APP_SECRET;
const previousCron = process.env.CRON_TOKEN;
process.env.RADAR_APP_SECRET = 'product-radar-test-secret';
process.env.CRON_TOKEN = 'product-radar-test-cron';

try {
  assert.equal(authorizedProductRefresh({ query: {}, headers: {} }), false, 'kimlik bilgisi olmayan istek reddedilmeli');
  assert.equal(authorizedProductRefresh({ query: { token: 'product-radar-test-cron' }, headers: {} }), true, 'cron işleri geriye dönük çalışmalı');
  const session = makeToken();
  assert.equal(authorizedProductRefresh({ query: {}, headers: { cookie: `tb_radar_lock=${encodeURIComponent(session)}` } }), true, 'Radar oturumu manuel eşzamanlamaya izin vermeli');
  assert.equal(authorizedProductRefresh({ query: { token: 'eski-token' }, headers: { cookie: `tb_radar_lock=${encodeURIComponent(session)}` } }), true, 'eski tarayıcı tokenı geçerli Radar oturumunu bozmamalı');
} finally {
  if (previousSecret === undefined) delete process.env.RADAR_APP_SECRET; else process.env.RADAR_APP_SECRET = previousSecret;
  if (previousCron === undefined) delete process.env.CRON_TOKEN; else process.env.CRON_TOKEN = previousCron;
}

console.log('product radar auth tests passed');
