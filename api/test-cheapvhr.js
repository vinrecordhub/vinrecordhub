// api/test-cheapvhr.js — DEBUG VERSION
// GET /api/test-cheapvhr
// Tests CheapVHR connection — DOES NOT use credits

const { HttpsProxyAgent } = require('https-proxy-agent');

const proxyAgent = process.env.FIXIE_URL
  ? new HttpsProxyAgent(process.env.FIXIE_URL)
  : null;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const results = {
    proxyEnabled: !!proxyAgent,
    apiKeySet: !!process.env.CHEAPVHR_API_KEY,
    apiKeyLength: process.env.CHEAPVHR_API_KEY?.length || 0,
    fixieUrlSet: !!process.env.FIXIE_URL,
  };

  try {
    // Test 1: Check user info (does NOT charge credits)
    const userRes = await fetch('https://api.cheapvhr.com/v1/user', {
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      agent: proxyAgent,
    });

    results.userStatus = userRes.status;
    results.userHeaders = Object.fromEntries(userRes.headers.entries());
    
    const userBody = await userRes.text();
    results.userBodyRaw = userBody.substring(0, 500); // first 500 chars
    
    try {
      results.userBody = JSON.parse(userBody);
    } catch {
      results.userBody = '(not JSON — see userBodyRaw above)';
    }

    // Test 2: Check limits (does NOT charge credits)
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
    results.stack = err.stack?.substring(0, 500);
    return res.status(500).json(results);
  }
};
