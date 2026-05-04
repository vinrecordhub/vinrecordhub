// api/fulfill-order.js
// POST /api/fulfill-order
// Called immediately after successful PayPal payment
// Verifies payment → fetches report(s) from CheapVHR → emails customer

const { createClient } = require('@supabase/supabase-js');
const { HttpsProxyAgent } = require('https-proxy-agent');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const proxyAgent = process.env.FIXIE_URL
  ? new HttpsProxyAgent(process.env.FIXIE_URL)
  : null;

const PLANS = {
  carfax:    { amount: 9.99,  reportTypes: ['carfax']               },
  autocheck: { amount: 9.99,  reportTypes: ['autocheck']            },
  combo:     { amount: 14.99, reportTypes: ['carfax', 'autocheck']  },
};

// Verify PayPal payment
async function verifyPayPalPayment(orderId, expectedAmount) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  const authRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const { access_token } = await authRes.json();

  const orderRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${access_token}` },
  });
  const order = await orderRes.json();

  const isPaid = order.status === 'COMPLETED' || order.status === 'APPROVED';
  const paidAmount = parseFloat(order.purchase_units?.[0]?.amount?.value || 0);
  const amountMatch = Math.abs(paidAmount - expectedAmount) < 0.01;

  return isPaid && amountMatch;
}

// Fetch report from CheapVHR via Fixie static IP
async function fetchReport(vin, reportType) {
  const url = `https://api.cheapvhr.com/v1/${reportType}/vin/${vin}/html`;
  const fetchOptions = {
    method: 'GET',
    headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
  };
  if (proxyAgent) fetchOptions.agent = proxyAgent;

  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`CheapVHR ${res.status}: ${errorBody.slice(0, 200)}`);
  }
  return await res.json();
}

// Email reports to customer
async function sendReportEmail(email, vin, reports) {
  const yearMakeModel = reports[0]?.yearMakeModel || '';
  const isCombo = reports.length > 1;

  const attachments = reports.map(r => ({
    filename: `VIN_${vin}_${r.type === 'carfax' ? 'Carfax' : 'AutoCheck'}.html`,
    content: Buffer.from(r.html, 'utf-8').toString('base64'),
  }));

  const reportTypeLabel = isCombo
    ? 'Carfax & AutoCheck Reports'
    : reports[0].type === 'carfax' ? 'Carfax Report' : 'AutoCheck Report';

  const payload = {
    from: 'VINRecordHub <noreply@vinrecordhub.com>',
    to: email,
    subject: `Your ${reportTypeLabel} — ${yearMakeModel || 'VIN ' + vin}`,
    html: `
      <body style="background:#080808;color:#f4f4ef;font-family:sans-serif;padding:40px 20px">
        <div style="max-width:560px;margin:0 auto">
          <div style="font-weight:800;font-size:22px;margin-bottom:24px">VIN<span style="color:#e8ff3f">Record</span>Hub</div>
          <h1 style="font-size:24px;margin-bottom:10px">Your ${reportTypeLabel} ${isCombo ? 'are' : 'is'} Ready ✓</h1>
          ${yearMakeModel ? `<p style="color:#999;font-size:16px;margin-bottom:6px"><strong style="color:#e8ff3f">${yearMakeModel}</strong></p>` : ''}
          <p style="color:#666;margin-bottom:8px">VIN: <strong style="color:#fff;font-family:monospace">${vin}</strong></p>
          <p style="color:#666;margin-bottom:24px">Your full vehicle history report${isCombo ? 's are' : ' is'} attached. Open ${isCombo ? 'them' : 'it'} in any browser to view.</p>
          ${isCombo ? `
          <div style="background:#0f1a00;border:1px solid #2a3a00;border-radius:10px;padding:16px;margin-bottom:24px">
            <p style="color:#e8ff3f;font-size:13px;font-weight:700;margin-bottom:6px">📎 2 reports attached</p>
            <p style="color:#999;font-size:12px;line-height:1.6">
              • <strong style="color:#fff">VIN_${vin}_Carfax.html</strong><br/>
              • <strong style="color:#fff">VIN_${vin}_AutoCheck.html</strong>
            </p>
          </div>
          ` : `
          <div style="background:#0f1a00;border:1px solid #2a3a00;border-radius:10px;padding:16px;margin-bottom:24px">
            <p style="color:#e8ff3f;font-size:13px;font-weight:700;margin-bottom:4px">📎 Report attached</p>
            <p style="color:#666;font-size:12px">Open <strong style="color:#999">${attachments[0].filename}</strong> in any browser.</p>
          </div>
          `}
          <p style="color:#444;font-size:12px;margin-top:24px">Questions? <a href="mailto:support@vinrecordhub.com" style="color:#e8ff3f">support@vinrecordhub.com</a></p>
        </div>
      </body>`,
    attachments,
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
    throw new Error(`Resend ${res.status}: ${err.slice(0, 200)}`);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, vin, plan, paypalOrderId } = req.body;

    // Validate
    if (!email || !vin || !plan || !paypalOrderId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (vin.length !== 17) {
      return res.status(400).json({ error: 'VIN must be 17 characters' });
    }
    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const { amount, reportTypes } = PLANS[plan];

    // Check for duplicate order BEFORE charging credits
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('paypal_order_id', paypalOrderId)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Order already processed' });
    }

    // Verify PayPal payment is real and amount matches
    const isValid = await verifyPayPalPayment(paypalOrderId, amount);
    if (!isValid) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Save order in database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        email,
        plan,
        quantity: reportTypes.length,
        amount,
        paypal_order_id: paypalOrderId,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Fetch report(s) from CheapVHR
    const reports = [];
    for (const type of reportTypes) {
      const report = await fetchReport(vin.toUpperCase(), type);
      if (!report.html) {
        throw new Error(`No HTML returned for ${type}`);
      }
      reports.push({ type, ...report });
    }

    // Email reports to customer
    await sendReportEmail(email, vin.toUpperCase(), reports);

    return res.status(200).json({
      success: true,
      yearMakeModel: reports[0]?.yearMakeModel || '',
      reportsDelivered: reports.length,
    });

  } catch (err) {
    console.error('fulfill-order error:', err.message);
    return res.status(500).json({
      error: 'Failed to deliver report. Please contact support@vinrecordhub.com with your order ID.',
      details: err.message,
    });
  }
};
