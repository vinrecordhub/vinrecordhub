// lib/admin-auth.js
// Authorization for admin endpoints. Two accepted credentials:
//   1. the shared ADMIN_TOKEN (constant-time compare) — break-glass fallback
//   2. a Supabase session token belonging to a profiles.is_admin account
// The flag can only be set server-side (clients hold no write grants).

const crypto = require('crypto');
const { supabase } = require('./supabase-server');

function isValidAdminToken(token) {
  const expected = process.env.ADMIN_TOKEN || '';
  if (!token || !expected || typeof token !== 'string') return false;
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// Prefer the Authorization header (keeps the token out of URLs, access logs,
// history, and Referer); fall back to ?token= for older callers.
function getAdminToken(req) {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.query.token || null;
}

async function isAuthorizedAdmin(req) {
  const token = getAdminToken(req);
  if (isValidAdminToken(token)) return true;
  if (!token) return false;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return false;
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', data.user.id)
      .single();
    return profile?.is_admin === true;
  } catch {
    return false;
  }
}

module.exports = { isValidAdminToken, getAdminToken, isAuthorizedAdmin };
