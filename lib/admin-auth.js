// lib/admin-auth.js
// Constant-time ADMIN_TOKEN check shared by all admin endpoints.

const crypto = require('crypto');

function isValidAdminToken(token) {
  const expected = process.env.ADMIN_TOKEN || '';
  if (!token || !expected || typeof token !== 'string') return false;
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

module.exports = { isValidAdminToken };
