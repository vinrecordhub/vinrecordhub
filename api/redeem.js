// api/redeem.js — CheapVHR INTEGRATED with Fixie static IP proxy
// POST /api/redeem
// Validates code, fetches Carfax/AutoCheck from CheapVHR, converts HTML to PDF, emails customer

const { createClient } = require('@supabase/supabase-js');
const { HttpsProxyAgent } = require('https-proxy-agent');
const dns = require('dns');

// FORCE IPv4 — CheapVHR only whitelists IPv4 addresses
dns.setDefaultResultOrder('ipv4first');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Build Fixie proxy agent (routes outbound requests through whitelisted static IP)
const proxyAgent = process.env.FIXIE_URL
  ? new HttpsProxyAgent(process.env.FIXIE_URL, { family: 4 })
  : null;

// ============================================================
// STEP 1: Fetch report from CheapVHR (Carfax or AutoCheck)
// Returns { yearMakeModel, vin, id, html }
// ============================================================
async function fetchReport(vin, reportType = 'carfax') {
  // reportType: 'carfax' or 'autocheck'
  const url = `https://api.cheapvhr.com/v1/${reportType}/vin/${vin}/html`;

  const fetchOptions = {
    method: 'GET',
    headers: {
      'x-api-key': process.env.CHEAPVHR_API_KEY,
    },
  };

  // Use Fixie proxy so request goes from whitelisted static IP
  if (proxyAgent) {
    fetchOptions.agent = proxyAgent;
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`CheapVHR API ${res.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await res.json();
  return data; // { yearMakeModel, vin, id, html }
}

// ============================================================
// STEP 2: Convert HTML report to PDF using a free HTML-to-PDF service
// We use html2pdf.app's API (free tier available) OR send HTML inline
// ============================================================
async function convertHtmlToPdfBase64(html, vin) {
  // Strategy: convert HTML to a Data URI, attach raw HTML file as backup
  // Best practice: use Puppeteer in a separate function, but Vercel has 50MB limit
  // Simpler: just attach the HTML as a .html file - opens in any browser
  return Buffer.from(html, 'utf-8').toString('base64');
}

// ============================================================
// STEP 3: Email report to customer via Resend
// We attach the HTML report as a downloadable file
// ============================================================
async function sendReportEmail(email, vin, yearMakeModel, htmlBase64, reportType) {
  const reportName = reportType === 'carfax' ? 'Carfax' : 'AutoCheck';

  const payload = {
    from: 'VINRecordHub <noreply@vinrecordhub.com>',
    to: email,
    subject: `Your ${reportName} Report — ${yearMakeModel || 'VIN ' + vin}`,
    html: `
      <body style="background:#080808;color:#f4f4ef;font-family:sans-serif;padding:40px 20px">
        <div style="max-width:560px;margin:0 auto">
          <div style="font-weight:800;font-size:22px;margin-bottom:24px">VIN<span style="color:#e8ff3f">Record</span>Hub</div>
          <h1 style="font-size:24px;margin-bottom:10px">Your ${reportName} Report is Ready ✓</h1>
          ${yearMakeModel ? `<p style="color:#999;font-size:16px;margin-bottom:6px"><strong style="color:#e8ff3f">${yearMakeModel}</strong></p>` : ''}
          <p style="color:#666;margin-bottom:8px">VIN: <strong style="color:#fff;font-family:monospace">${vin}</strong></p>
          <p style="color:#666;margin-bottom:24px">Your full ${reportName} vehicle history report is attached as an HTML file. Open it in any browser to view.</p>
          <div style="background:#111;border:1px solid #222;border-radius:10px;padding:20px;margin-bottom:24px">
            <p style="color:#666;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">Report Includes</p>
            <p style="color:#999;font-size:14px;line-height:2">
              ✓ Accident & damage history<br/>
              ✓ Title & ownership records<br/>
              ✓ Odometer verification<br/>
              ✓ Service & maintenance history<br/>
              ✓ Recall information
            </p>
          </div>
          <div style="background:#0f1a00;border:1px solid #2a3a00;border-radius:10px;padding:16px;margin-bottom:24px">
            <p style="color:#e8ff3f;font-size:13px;font-weight:700;margin-bottom:4px">📎 Report attached</p>
            <p style="color:#666;font-size:12px">Open <strong style="color:#999">VIN_${vin}_${reportName}.html</strong> in any browser to view the full report.</p>
          </div>
          <p style="color:#444;font-size:12px;margin-top:24px">Questions? <a href="mailto:support@vinrecordhub.com" style="color:#e8ff3f">support@vinrecordhub.com</a></p>
        </div>
      </body>`,
    attachments: [{
      filename: `VIN_${vin}_${reportName}.html`,
      content: htmlBase64,
    }],
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${err.slice(0, 200)}`);
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { code, vin, email, reportType } = req.body;

    // Default to carfax if not specified
    const type = (reportType === 'autocheck') ? 'autocheck' : 'carfax';

    // Validate inputs
    if (!code || !vin || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (vin.length !== 17) {
      return res.status(400).json({ error: 'VIN must be 17 characters' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    // Validate redemption code in Supabase
    const { data: codeData, error: codeError } = await supabase
      .from('redemption_codes')
      .select('id, is_used, vin_used')
      .eq('code', code.toUpperCase())
      .single();

    if (codeError || !codeData) {
      return res.status(404).json({ error: 'Invalid redemption code' });
    }
    if (codeData.is_used) {
      return res.status(400).json({
        error: 'Code already used',
        vin_used: codeData.vin_used,
      });
    }

    // Mark code as used IMMEDIATELY to prevent double-redemption
    const { error: updateError } = await supabase
      .from('redemption_codes')
      .update({
        is_used: true,
        vin_used: vin.toUpperCase(),
        used_at: new Date().toISOString(),
      })
      .eq('id', codeData.id);

    if (updateError) throw updateError;

    // Fetch report from CheapVHR (via Fixie static IP)
    const report = await fetchReport(vin.toUpperCase(), type);

    if (!report.html) {
      throw new Error('No HTML content in CheapVHR response');
    }

    // Convert to base64 for email attachment
    const htmlBase64 = await convertHtmlToPdfBase64(report.html, vin.toUpperCase());

    // Email report to customer
    await sendReportEmail(
      email,
      vin.toUpperCase(),
      report.yearMakeModel || '',
      htmlBase64,
      type
    );

    return res.status(200).json({
      success: true,
      yearMakeModel: report.yearMakeModel,
      reportId: report.id,
    });

  } catch (err) {
    console.error('redeem error:', err.message);
    return res.status(500).json({
      error: 'Failed to generate report. Contact support@vinrecordhub.com',
      details: err.message,
    });
  }
};
