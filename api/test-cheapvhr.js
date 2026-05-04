// api/test-cheapvhr.js — Using undici (more reliable for HTTPS-over-HTTP-proxy)

const { ProxyAgent, fetch: undiciFetch } = require('undici');

const fixieUrl = process.env.FIXIE_URL;

let proxyAgent = null;
if (fixieUrl) {
  proxyAgent = new ProxyAgent(fixieUrl);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const results = {
    proxyEnabled: !!proxyAgent,
    fixieUrlSet: !!fixieUrl,
  };

  try {
    // Test 1: Check what IP we're coming from
    const ipRes = await undiciFetch('https://api.ipify.org?format=json', {
      dispatcher: proxyAgent,
    });
    const ipData = await ipRes.json();
    results.outboundIP = ipData.ip;
    results.expectedIPs = ['52.5.155.132', '52.87.82.133'];
    results.ipMatchesFixie = ['52.5.155.132', '52.87.82.133'].includes(ipData.ip);

    // Test 2: Hit CheapVHR
    const cheapvhrRes = await undiciFetch('https://api.cheapvhr.com/v1/user', {
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      dispatcher: proxyAgent,
    });
    results.cheapvhrStatus = cheapvhrRes.status;
    const body = await cheapvhrRes.text();
    
    try {
      results.cheapvhrBody = JSON.parse(body);
    } catch {
      results.cheapvhrBody = body.substring(0, 200);
    }

    // Test 3: Limits endpoint
    const limitsRes = await undiciFetch('https://api.cheapvhr.com/v1/user/limits', {
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      dispatcher: proxyAgent,
    });
    results.limitsStatus = limitsRes.status;
    const limitsBody = await limitsRes.text();
    
    try {
      results.limitsBody = JSON.parse(limitsBody);
    } catch {
      results.limitsBody = limitsBody.substring(0, 200);
    }

    return res.status(200).json(results);
  } catch (err) {
    results.error = err.message;
    results.stack = err.stack?.substring(0, 300);
    return res.status(500).json(results);
  }
};
