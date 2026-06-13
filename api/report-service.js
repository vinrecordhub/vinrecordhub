// api/report-service.js
// Shared CheapVHR + Resend logic used by fulfill-order, paddle-webhook,
// redeem, and resend-order.
//
// CheapVHR billing (see their docs):
//   GET /{type}/vin/{VIN}/html  -> generates a report. COSTS 1 CREDIT and
//                                  counts against the daily limit (20/type/day).
//   GET /{type}/{REPORT_ID}     -> retrieves an existing report. FREE.
//   GET /user/reports           -> lists already-generated reports (id + VIN). FREE.
//   GET /user/limits            -> credits + remaining daily allowance. FREE.
//
// All CheapVHR calls go through the Fixie proxy so they egress from the
// whitelisted static IP. CheapVHR only whitelists IPv4 addresses.

const { ProxyAgent, fetch: undiciFetch } = require('undici');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

const CHEAPVHR_BASE = 'https://api.cheapvhr.com/v1';
const proxyAgent = process.env.FIXIE_URL ? new ProxyAgent(process.env.FIXIE_URL) : null;

// Plan name -> required report types. Supports approval names (standard/plus)
// and the original names (carfax/autocheck), matching api/sanitize.js.
const PLAN_REPORT_TYPES = {
  carfax:    ['carfax'],
  standard:  ['carfax'],
  autocheck: ['autocheck'],
  plus:      ['autocheck'],
  combo:     ['carfax', 'autocheck'],
};

// DB column that stores each type's CheapVHR report id.
const REPORT_ID_COLUMN = {
  carfax:    'carfax_report_id',
  autocheck: 'autocheck_report_id',
};

function reportTypesForPlan(plan) {
  return PLAN_REPORT_TYPES[String(plan || '').toLowerCase()] || ['carfax'];
}

// Retry transient failures (429 + 5xx + network) with exponential backoff.
// Validation/auth errors set retryable=false and fail fast.
async function withRetry(fn, { retries = 2, baseDelay = 600 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err.retryable === false || attempt === retries) break;
      await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function cheapvhrGet(path) {
  let res;
  try {
    res = await undiciFetch(`${CHEAPVHR_BASE}${path}`, {
      method: 'GET',
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      dispatcher: proxyAgent,
    });
  } catch (netErr) {
    netErr.retryable = true; // network/proxy blip
    throw netErr;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`CheapVHR ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  return res.json();
}

// Generate a NEW report by VIN. COSTS 1 CREDIT + daily limit. Returns
// { yearMakeModel, vin, id, html }.
function generateReportByVin(vin, type) {
  return withRetry(() => cheapvhrGet(`/${type}/vin/${encodeURIComponent(vin)}/html`));
}

// Retrieve an EXISTING report by its CheapVHR id. FREE. Returns
// { id, yearMakeModel, VIN, html }.
function getReportById(type, id) {
  return withRetry(() => cheapvhrGet(`/${type}/${encodeURIComponent(id)}`));
}

// Find the id of an already-generated report for this VIN, or null. FREE.
async function findExistingReportId(vin, type) {
  const data = await withRetry(() => cheapvhrGet('/user/reports'));
  const list = type === 'carfax' ? data.carfaxReports : data.autoCheckReports;
  if (!Array.isArray(list)) return null;
  const match = list
    .filter(r => String(r.VIN || '').toUpperCase() === String(vin).toUpperCase())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  return match ? match.id : null;
}

// Credits + remaining daily allowance. FREE.
function getLimits() {
  return cheapvhrGet('/user/limits');
}

// Email one or more reports to the customer via Resend, with retry.
// reports: [{ type, html, yearMakeModel }]
async function sendReportEmail(email, vin, reports) {
  const yearMakeModel = reports[0]?.yearMakeModel || '';
  const isCombo = reports.length > 1;
  const reportLabel = isCombo ? 'Vehicle History Reports' : 'Vehicle History Report';

  const attachments = reports.map(r => ({
    filename: `VINRecordHub_${vin}_${r.type === 'carfax' ? 'Standard' : 'Plus'}.html`,
    content: Buffer.from(r.html, 'utf-8').toString('base64'),
  }));

  const html = `
    <body style="background:#080808;color:#f4f4ef;font-family:sans-serif;padding:40px 20px">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-weight:800;font-size:22px;margin-bottom:24px">
          VIN<span style="color:#e8ff3f">Record</span>Hub
        </div>
        <h1 style="font-size:24px;margin-bottom:10px">
          Your ${reportLabel} ${isCombo ? 'are' : 'is'} Ready ✓
        </h1>
        ${yearMakeModel ? `<p style="color:#999;font-size:16px;margin-bottom:6px"><strong style="color:#e8ff3f">${yearMakeModel}</strong></p>` : ''}
        <p style="color:#666;margin-bottom:8px">VIN: <strong style="color:#fff;font-family:monospace">${vin}</strong></p>
        <p style="color:#666;margin-bottom:24px">
          Your vehicle history report${isCombo ? 's are' : ' is'} attached.
          Open ${isCombo ? 'them' : 'it'} in any browser to view.
        </p>
        <div style="background:#0f1a00;border:1px solid #2a3a00;border-radius:10px;padding:16px;margin-bottom:24px">
          <p style="color:#e8ff3f;font-size:13px;font-weight:700;margin-bottom:6px">
            📎 ${isCombo ? '2 reports attached' : 'Report attached'}
          </p>
          ${isCombo
            ? `<p style="color:#999;font-size:12px;line-height:1.8">
                • <strong style="color:#fff">${attachments[0].filename}</strong><br/>
                • <strong style="color:#fff">${attachments[1].filename}</strong>
               </p>`
            : `<p style="color:#666;font-size:12px">Open <strong style="color:#999">${attachments[0].filename}</strong> in any browser.</p>`
          }
        </div>
        <div style="background:#111;border:1px solid #1a1a1a;border-radius:10px;padding:20px;margin-bottom:24px">
          <p style="color:#666;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">Report Includes</p>
          <p style="color:#999;font-size:14px;line-height:2">
            ✓ Accident & damage history<br/>
            ✓ Title & ownership records<br/>
            ✓ Odometer verification<br/>
            ✓ Service & maintenance history<br/>
            ✓ Recall information
          </p>
        </div>
        <p style="color:#444;font-size:12px;margin-top:24px">
          Questions? <a href="mailto:support@vinrecordhub.com" style="color:#e8ff3f">support@vinrecordhub.com</a><br/>
          Keep this email — your report never expires.
        </p>
      </div>
    </body>`;

  await withRetry(async () => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'VINRecordHub <noreply@vinrecordhub.com>',
        to: email,
        subject: `Your VINRecordHub ${reportLabel} — ${yearMakeModel || 'VIN ' + vin}`,
        html,
        attachments,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
      err.retryable = res.status === 429 || res.status >= 500;
      throw err;
    }
  });
}

module.exports = {
  REPORT_ID_COLUMN,
  reportTypesForPlan,
  generateReportByVin,
  getReportById,
  findExistingReportId,
  getLimits,
  sendReportEmail,
};
