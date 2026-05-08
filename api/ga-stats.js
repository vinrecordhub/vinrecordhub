// api/ga-stats.js
// GET /api/ga-stats?token=ADMIN_TOKEN&days=7
// Uses GA4 Data API with service account JSON stored in env var

const rateLimit = require('./rate-limit');
const { createSign } = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rl = rateLimit(req, { maxRequests: 20, windowMs: 60000 });
  if (rl.limited) return res.status(429).json({ error: 'Too many requests' });

  const { token, days } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    await new Promise(r => setTimeout(r, 1000));
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const propertyId = process.env.GA4_PROPERTY_ID;
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!propertyId || !serviceAccountKey) {
    return res.status(200).json({ notConfigured: true });
  }

  try {
    const sa = JSON.parse(serviceAccountKey);
    const accessToken = await getAccessToken(sa);
    const dayRange = parseInt(days) || 7;

    // Main metrics
    const [mainData, sourcesData, pagesData] = await Promise.all([
      gaReport(accessToken, propertyId, dayRange, {
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        dimensions: [],
      }),
      gaReport(accessToken, propertyId, dayRange, {
        metrics: [{ name: 'sessions' }],
        dimensions: [{ name: 'sessionSource' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 6,
      }),
      gaReport(accessToken, propertyId, dayRange, {
        metrics: [{ name: 'screenPageViews' }],
        dimensions: [{ name: 'pagePath' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 6,
      }),
    ]);

    const row = mainData.rows?.[0]?.metricValues || [];

    const sources = (sourcesData.rows || []).map(r => ({
      source: r.dimensionValues[0].value === '(direct)' ? 'Direct' : r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value),
    }));

    const pages = (pagesData.rows || []).map(r => ({
      page: r.dimensionValues[0].value,
      views: parseInt(r.metricValues[0].value),
    }));

    return res.status(200).json({
      sessions: parseInt(row[0]?.value || 0),
      users: parseInt(row[1]?.value || 0),
      pageviews: parseInt(row[2]?.value || 0),
      bounceRate: (parseFloat(row[3]?.value || 0) * 100).toFixed(1),
      avgSession: parseFloat(row[4]?.value || 0),
      sources,
      pages,
    });

  } catch (err) {
    console.error('GA stats error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

async function gaReport(accessToken, propertyId, days, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
        ...body,
      }),
    }
  );
  return res.json();
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key).toString('base64url');
  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await tokenRes.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}
