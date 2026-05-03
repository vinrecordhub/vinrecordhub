// api/redeem.js
// POST /api/redeem
// Validates code, fetches CarSimulcast report, emails it to customer

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// TODO: Replace this with real CarSimulcast API call
// when you receive the API documentation
// ============================================================
async function fetchVehicleReport(vin) {
  const apiKey = process.env.CARSIMULCAST_API_KEY;
  const apiUrl = process.env.CARSIMULCAST_API_URL;

  // PLACEHOLDER — replace with real CarSimulcast call:
  // const res = await fetch(`${apiUrl}/report?vin=${vin}&key=${apiKey}`);
  // const data = await res.json();
  // return data.reportUrl; // or PDF buffer

  // For now, return a placeholder
  return `https://vinrecordhub.com/sample-report-${vin}.pdf`;
}

// Send report email via Resend
async function sendReportEmail(email, vin, reportUrl) {
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="background:#080808;color:#f4f4ef;font-family:sans-serif;margin:0;padding:40px 20px">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-weight:800;font-size:22px;margin-bottom:30px">
          VIN<span style="color:#e8ff3f">Record</span>Hub
        </div>
        <h1 style="font-size:26px;font-weight:800;margin-bottom:10px">Your Vehicle Report is Ready</h1>
        <p style="color:#666;margin-bottom:8px">VIN: <strong style="color:#fff;font-family:monospace">${vin}</strong></p>
        <p style="color:#666;margin-bottom:30px">Your full vehicle history report has been generated and is ready to view.</p>

        <div style="text-align:center;margin:30px 0">
          <a href="${reportUrl}" 
             style="background:#e8ff3f;color:#000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:800;font-size:16px;display:inline-block">
            View Full Report →
          </a>
        </div>

        <div style="background:#111;border:1px solid #222;border-radius:12px;padding:20px;margin-top:30px">
          <p style="color:#666;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">Report Includes</p>
          <p style="color:#999;font-size:14px;line-height:2">
            ✓ Accident & damage history<br/>
            ✓ Title & ownership records<br/>
            ✓ Odometer verification<br/>
            ✓ Service history records<br/>
            ✓ Recall information
          </p>
        </div>

        <p style="color:#444;font-size:13px;margin-top:30px">
          Questions? <a href="mailto:support@vinrecordhub.com" style="color:#e8ff3f">support@vinrecordhub.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'VINRecordHub <noreply@vinrecordhub.com>',
      to: email,
      subject: `Your Vehicle History Report — VIN ${vin}`,
      html,
    }),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { code, vin, email } = req.body;

    // Validate inputs
    if (!code || !vin || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (vin.length !== 17) {
      return res.status(400).json({ error: 'Invalid VIN — must be 17 characters' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Look up code
    const { data: codeData, error: codeError } = await supabase
      .from('redemption_codes')
      .select('id, is_used, vin_used')
      .eq('code', code.toUpperCase())
      .single();

    if (codeError || !codeData) {
      return res.status(404).json({ error: 'Invalid redemption code' });
    }
    if (codeData.is_used) {
      return res.status(400).json({ error: 'This code has already been used', vin_used: codeData.vin_used });
    }

    // Mark code as used FIRST (prevent double-use)
    const { error: updateError } = await supabase
      .from('redemption_codes')
      .update({ is_used: true, vin_used: vin.toUpperCase(), used_at: new Date().toISOString() })
      .eq('id', codeData.id);

    if (updateError) throw updateError;

    // Fetch report from CarSimulcast
    const reportUrl = await fetchVehicleReport(vin.toUpperCase());

    // Email report to customer
    await sendReportEmail(email, vin.toUpperCase(), reportUrl);

    return res.status(200).json({ success: true, message: 'Report sent to your email' });

  } catch (err) {
    console.error('redeem error:', err);
    return res.status(500).json({ error: 'Internal server error. Please contact support@vinrecordhub.com' });
  }
};
