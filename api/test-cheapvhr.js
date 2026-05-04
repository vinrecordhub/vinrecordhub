// api/test-cheapvhr.js — Diagnose what IP CheapVHR sees

const { HttpsProxyAgent } = require('https-proxy-agent');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

const proxyAgent = process.env.FIXIE_URL
  ? new HttpsProxyAgent(process.env.FIXIE_URL, { family: 4 })
  : null;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const results = {
    proxyEnabled: !!proxyAgent,
    fixieUrl: process.env.FIXIE_URL ? process.env.FIXIE_URL.replace(/:[^@]+@/, ':***@') : 'NOT SET',
  };

  try {
    // Test 1: Hit a "what's my IP" service THROUGH the proxy
    // This tells us EXACTLY what IP CheapVHR will see from us
    const ipRes = await fetch('https://api.ipify.org?format=json', {
      agent: proxyAgent,
    });
    const ipData = await ipRes.json();
    results.outboundIP = ipData.ip;
    results.expectedIPs = ['52.5.155.132', '52.87.82.133'];
    results.ipMatchesFixie = ['52.5.155.132', '52.87.82.133'].includes(ipData.ip);

    // Test 2: Hit Fixie's welcome endpoint (their own diagnostic)
    const welcomeRes = await fetch('http://welcome.usefixie.com', {
      agent: proxyAgent,
    });
    results.fixieWelcomeStatus = welcomeRes.status;
    const welcomeText = await welcomeRes.text();
    results.fixieWelcome = welcomeText.substring(0, 200);

    // Test 3: Hit CheapVHR
    const cheapvhrRes = await fetch('https://api.cheapvhr.com/v1/user', {
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      agent: proxyAgent,
    });
    results.cheapvhrStatus = cheapvhrRes.status;
    const cheapvhrBody = await cheapvhrRes.text();
    results.cheapvhrBodySnippet = cheapvhrBody.substring(0, 200);

    // Test 4: Pull CF-Ray header (Cloudflare's request ID — tells us why blocked)
    results.cheapvhrCloudflareRay = cheapvhrRes.headers.get('cf-ray');

    return res.status(200).json(results);

  } catch (err) {
    results.error = err.message;
    return res.status(500).json(results);
  }
};
