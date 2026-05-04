// api/test-cheapvhr.js
// GET /api/test-cheapvhr?vin=1FMDU34X7PUD75574
// One-off test endpoint to verify CheapVHR API integration through Fixie proxy
// DELETE THIS FILE BEFORE GOING LIVE TO PREVENT FREE REPORTS

const { HttpsProxyAgent } = require('https-proxy-agent');

const proxyAgent = process.env.FIXIE_URL
  ? new HttpsProxyAgent(process.env.FIXIE_URL)
  : null;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const vin = req.query.vin || '1FMDU34X7PUD75574'; // CheapVHR's free test VIN
  const type = req.query.type || 'carfax';

  try {
    // Step 1: Check user info (verifies API key works)
    const userRes = await fetch('https://api.cheapvhr.com/v1/user', {
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      agent: proxyAgent,
    });
    const user = await userRes.json();

    // Step 2: Check limits
    const limitsRes = await fetch('https://api.cheapvhr.com/v1/user/limits', {
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      agent: proxyAgent,
    });
    const limits = await limitsRes.json();

    // Step 3: Try fetching a test report (uses 1 credit if real VIN)
    const reportRes = await fetch(`https://api.cheapvhr.com/v1/${type}/vin/${vin}/html`, {
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      agent: proxyAgent,
    });
    const reportStatus = reportRes.status;
    const reportData = await reportRes.json().catch(() => null);

    return res.status(200).json({
      success: true,
      proxyEnabled: !!proxyAgent,
      user,
      limits,
      reportStatus,
      reportSummary: reportData ? {
        vin: reportData.vin,
        yearMakeModel: reportData.yearMakeModel,
        reportId: reportData.id,
        htmlLength: reportData.html ? reportData.html.length : 0,
      } : null,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      proxyEnabled: !!proxyAgent,
    });
  }
};
