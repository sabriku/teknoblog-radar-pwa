import { json, nowIso } from './_lib.js';
import { createOAuthState, getGoogleConfig, googleAccessToken, saveGoogleConfig, verifyOAuthState } from './_google-auth.js';

const REDIRECT_URI = 'https://radar.teknolojisk.com/api/google-auth/callback';
function bodyOf(req) { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
function authorized(req, body = {}) { const expected = process.env.CRON_TOKEN || ''; const supplied = req.query?.token || req.headers['x-cron-token'] || body.token || ''; return Boolean(expected && supplied === expected); }

export default async function handler(req, res) {
  try {
    const callback = String(req.url || '').includes('/callback');
    if (callback) {
      if (!verifyOAuthState(req.query?.state || '')) throw new Error('OAuth state doğrulanamadı.');
      const config = await getGoogleConfig();
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query?.code || '', client_id: config.client_id, client_secret: config.client_secret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }) });
      const token = await response.json(); if (!response.ok) throw new Error(token.error_description || token.error || 'OAuth kodu alınamadı');
      if (!token.refresh_token && !config.refresh_token) throw new Error('Google refresh token döndürmedi.');
      await saveGoogleConfig({ refresh_token: token.refresh_token || config.refresh_token, connected_at: nowIso(), scopes_updated_at: nowIso() });
      res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<!doctype html><meta charset="utf-8"><title>Bağlandı</title><body style="font:16px system-ui;padding:32px"><h1>Google performans verileri bağlandı</h1><p>Search Console ve Google Analytics salt okunur izinleri hazır. Bu pencereyi kapatabilirsiniz.</p><script>if(window.opener){window.opener.postMessage({type:"tb-gsc-connected"},location.origin)}setTimeout(()=>window.close(),1200)</script></body>');
    }
    if (req.method === 'GET') {
      const config = await getGoogleConfig();
      if (String(req.query?.action || '') === 'start') {
        if (!config.client_id || !config.client_secret) return json(res, 400, { error: 'Önce OAuth Client ID ve Client Secret kaydedilmeli.' });
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.searchParams.set('client_id', config.client_id); url.searchParams.set('redirect_uri', REDIRECT_URI); url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly openid email'); url.searchParams.set('access_type', 'offline'); url.searchParams.set('include_granted_scopes', 'true'); url.searchParams.set('prompt', 'consent'); url.searchParams.set('state', createOAuthState());
        return json(res, 200, { auth_url: url.toString(), redirect_uri: REDIRECT_URI });
      }
      if (String(req.query?.action || '') === 'analytics-properties') {
        const accessToken = await googleAccessToken();
        if (!accessToken) return json(res, 400, { error: 'Önce Google bağlantısını tamamlayın.' });
        const response = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || `Google Analytics Admin API HTTP ${response.status}`);
        const properties = (data.accountSummaries || []).flatMap((account) => (account.propertySummaries || []).map((property) => ({
          id: String(property.property || '').replace(/^properties\//, ''),
          name: property.displayName || property.property || '',
          account: account.displayName || account.account || ''
        }))).filter((property) => property.id);
        return json(res, 200, { properties, selected: config.analytics_property_id || '' });
      }
      return json(res, 200, { configured: Boolean(config.client_id && config.client_secret), connected: Boolean(config.refresh_token), site_url: config.site_url, analytics_property_id: config.analytics_property_id, analytics_configured: Boolean(config.refresh_token && config.analytics_property_id), connected_at: config.connected_at, scopes_updated_at: config.scopes_updated_at, redirect_uri: REDIRECT_URI });
    }
    if (req.method === 'POST') {
      const body = bodyOf(req); if (!authorized(req, body)) return json(res, 401, { error: 'Yetkisiz istek' });
      const current = await getGoogleConfig();
      const clientId = String(body.client_id || current.client_id || '').trim();
      const clientSecret = String(body.client_secret || current.client_secret || '').trim();
      if (!clientId || !clientSecret) return json(res, 400, { error: 'Client ID ve Client Secret gerekli.' });
      const propertyId = String(body.analytics_property_id ?? current.analytics_property_id ?? '').replace(/^properties\//, '').trim();
      if (propertyId && !/^\d+$/.test(propertyId)) return json(res, 400, { error: 'GA4 Mülk Kimliği yalnızca rakamlardan oluşmalı.' });
      await saveGoogleConfig({ client_id: clientId, client_secret: clientSecret, site_url: String(body.site_url || current.site_url || 'sc-domain:teknoblog.com').trim(), analytics_property_id: propertyId });
      return json(res, 200, { ok: true, redirect_uri: REDIRECT_URI });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) { return json(res, 500, { error: error?.message || String(error) }); }
}
