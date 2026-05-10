// api/tiktok/callback.js
// GET /api/tiktok/callback
// TikTok OAuth redirect handler — exchanges code for token and stores in Supabase.

const { createClient } = require('@supabase/supabase-js');

const REDIRECT_URI = 'https://vinrecordhub.com/api/tiktok/callback';
const TOKEN_URL    = 'https://open.tiktokapis.com/v2/oauth/token/';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function html(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    background:#010101;color:#fff;display:flex;flex-direction:column;
    align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .card{background:#111;border:1px solid #1e1e1e;border-radius:16px;padding:40px;max-width:480px;width:100%;}
  h2{margin:0 0 8px;}
  p{color:#888;margin:0 0 24px;font-size:.9rem;}
  .kv{display:flex;justify-content:space-between;margin-bottom:10px;font-size:.875rem;}
  .kv span{color:#666;}
  .kv code{color:#25f4ee;font-family:monospace;font-size:.78rem;word-break:break-all;max-width:300px;}
  .ok{color:#4ade80;} .err{color:#f87171;}
</style></head><body><div class="card">${body}</div></body></html>`;
}

module.exports = async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).send(html('TikTok Auth Error', `
      <h2 class="err">Authorization failed</h2>
      <p>${error_description || error}</p>`));
  }

  if (!code) {
    return res.status(400).json({ error: { code: 'missing_code', message: 'Missing authorization code' } });
  }

  let tokenData;
  try {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key:    process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type:    'authorization_code',
        redirect_uri:  REDIRECT_URI,
      }).toString(),
    });
    tokenData = await resp.json();
  } catch (err) {
    return res.status(502).json({ error: { code: 'upstream_error', message: 'TikTok token request failed' } });
  }

  if (!tokenData.access_token) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).send(html('TikTok Auth Error', `
      <h2 class="err">Token exchange failed</h2>
      <p>${tokenData.error?.message || JSON.stringify(tokenData)}</p>`));
  }

  const { error: dbErr } = await supabase.from('tiktok_tokens').upsert({
    open_id:             tokenData.open_id,
    access_token:        tokenData.access_token,
    refresh_token:       tokenData.refresh_token,
    scope:               tokenData.scope,
    expires_at:          new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    refresh_expires_at:  new Date(Date.now() + tokenData.refresh_expires_in * 1000).toISOString(),
    updated_at:          new Date().toISOString(),
  }, { onConflict: 'open_id' });

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html('TikTok Connected', `
    <h2 class="ok">Connected ✓</h2>
    <p>TikTok account authorized and token stored.</p>
    <div class="kv"><span>Open ID</span><code>${tokenData.open_id}</code></div>
    <div class="kv"><span>Scope</span><code>${tokenData.scope}</code></div>
    <div class="kv"><span>Expires in</span><code>${Math.round(tokenData.expires_in / 3600)}h</code></div>
    <div class="kv"><span>DB</span><code>${dbErr ? 'Save failed: ' + dbErr.message : 'Token saved'}</code></div>`));
};
