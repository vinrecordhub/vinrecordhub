// lib/admin-auth.js
// Constant-time ADMIN_TOKEN check shared by all admin endpoints.

const crypto = require('crypto');

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

function isAuthorizedAdmin(req) {
  return isValidAdminToken(getAdminToken(req));
}

module.exports = { isValidAdminToken, getAdminToken, isAuthorizedAdmin };
