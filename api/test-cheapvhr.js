// api/test-cheapvhr.js — DEBUG VERSION (IPv4 forced)
// GET /api/test-cheapvhr
// Tests CheapVHR connection — DOES NOT use credits

const { HttpsProxyAgent } = require('https-proxy-agent');
const dns = require('dns');

// FORCE IPv4 — CheapVHR only whitelists IPv4 addresses
dns.setDefaultResultOrder('ipv4first');

// Build proxy with IPv4 family forced
const proxyAgent = process.env.FIXIE_URL
  ? new HttpsProxyAgent(process.env.FIXIE_URL, { family: 4 })
  : null;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const results = {
    proxyEnabled: !!proxyAgent,
    apiKeySet: !!process.env.CHEAPVHR_API_KEY,
    apiKeyLength: process.env.CHEAPVHR_API_KEY?.length || 0,
    fixieUrlSet: !!process.env.FIXIE_URL,
    ipv4Forced: true,
  };

  try {
    // Test 1: User info (no credit charge)
    const userRes = await fetch('https://api.cheapvhr.com/v1/user', {
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      agent: proxyAgent,
    });

    results.userStatus = userRes.status;
    const userBody = await userRes.text();
    results.userBodyRaw = userBody.substring(0, 300);
    
    try {
      results.userBody = JSON.parse(userBody);
    } catch {
      results.userBody = '(not JSON)';
    }

    // Test 2: Limits (no credit charge)
    const limitsRes = await fetch('https://api.cheapvhr.com/v1/user/limits', {
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      agent: proxyAgent,
    });

    results.limitsStatus = limitsRes.status;
    const limitsBody = await limitsRes.text();
    results.limitsBodyRaw = limitsBody.substring(0, 300);
    
    try {
      results.limitsBody = JSON.parse(limitsBody);
    } catch {
      results.limitsBody = '(not JSON)';
    }

    return res.status(200).json(results);

  } catch (err) {
    results.error = err.message;
    return res.status(500).json(results);
  }
};
