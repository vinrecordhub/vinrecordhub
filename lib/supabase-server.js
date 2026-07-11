// lib/supabase-server.js
// Service-role Supabase client + request-auth helper shared by the credit
// endpoints. The service key never leaves the server.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Resolve the authenticated user from "Authorization: Bearer <access_token>".
// Returns null when missing/invalid — callers must 401.
async function getUserFromRequest(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function isEmailVerified(user) {
  return Boolean(user && user.email_confirmed_at);
}

module.exports = { supabase, getUserFromRequest, isEmailVerified };
