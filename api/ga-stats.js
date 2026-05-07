// api/ga-stats.js
// GET /api/ga-stats?token=ADMIN_TOKEN&propertyId=GA4_PROPERTY_ID&days=7
// Fetches GA4 metrics using Google Analytics Data API
// Requires GOOGLE_SERVICE_ACCOUNT_KEY env var (JSON string of service account)

const rateLimit = require('./rate-limit');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit
  const rl = rateLimit(req, { maxRequests: 20, windowMs: 60000 });
  if (rl.limited) return res.status(429).json({ error: 'Too many requests' });

  // Auth
  const { token, propertyId, days } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    await new Promise(r => setTimeout(r, 1000));
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!propertyId) return res.status(400).json({ error: 'Missing propertyId' });
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return res.status(200).json({
      sessions: 0, users: 0, pageviews: 0, bounceRate: 0,
      avgSessionDuration: 0, conversions: 0,
      sources: [], pages: [],
      notice: 'Add GOOGLE_SERVICE_ACCOUNT_KEY env var to enable GA4 data'
    });
  }

  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const dayRange = parseInt(days) || 7;

    // Get access token via JWT
    const token = await getGoogleToken(serviceAccount);

    // Run GA4 report
    const reportRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: `${dayRange}daysAgo`, endDate: 'today' }],
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'screenPageViews' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            { name: 'conversions' },
          ],
          dimensions: [],
          limit: 1,
        }),
      }
    );

    const reportData = await reportRes.json();
    const row = reportData.rows?.[0]?.metricValues || [];

    // Get top sources
    const sourcesRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: `${dayRange}daysAgo`, endDate: 'today' }],
          metrics: [{ name: 'sessions' }],
          dimensions: [{ name: 'sessionSource' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 5,
        }),
      }
    );

    const sourcesData = await sourcesRes.json();
    const sources = (sourcesData.rows || []).map(r => ({
      source: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value)
    }));

    // Get top pages
    const pagesRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: `${dayRange}daysAgo`, endDate: 'today' }],
          metrics: [{ name: 'screenPageViews' }],
          dimensions: [{ name: 'pagePath' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 5,
        }),
      }
    );

    const pagesData = await pagesRes.json();
    const pages = (pagesData.rows || []).map(r => ({
      page: r.dimensionValues[0].value,
      views: parseInt(r.metricValues[0].value)
    }));

    return res.status(200).json({
      sessions: parseInt(row[0]?.value || 0),
      users: parseInt(row[1]?.value || 0),
      pageviews: parseInt(row[2]?.value || 0),
      bounceRate: parseFloat(row[3]?.value || 0) * 100,
      avgSessionDuration: parseFloat(row[4]?.value || 0),
      conversions: parseInt(row[5]?.value || 0),
      sources,
      pages,
    });

  } catch (err) {
    console.error('GA stats error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch GA4 data: ' + err.message });
  }
};

async function getGoogleToken(serviceAccount) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const { createSign } = require('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${claim}`);
  const sig = sign.sign(serviceAccount.private_key).toString('base64url');
  const jwt = `${header}.${claim}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const { access_token } = await tokenRes.json();
  return access_token;
}
