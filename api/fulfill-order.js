
// api/fulfill-order.js
// POST /api/fulfill-order
// Verifies PayPal payment → fetches report from CheapVHR via Fixie → emails customer

const { createClient } = require('@supabase/supabase-js');
const { ProxyAgent, fetch: undiciFetch } = require('undici');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const proxyAgent = process.env.FIXIE_URL
  ? new ProxyAgent(process.env.FIXIE_URL)
  : null;

// Plan mapping — supports both old names (carfax/autocheck) and new approval names (standard/plus)
const PLANS = {
  // Approval version names
  standard: { amount: 9.99,  reportTypes: ['carfax']              },
  plus:     { amount: 9.99,  reportTypes: ['autocheck']           },
  combo:    { amount: 14.99, reportTypes: ['carfax', 'autocheck'] },
  // Original names (kept for backward compatibility)
  carfax:    { amount: 9.99,  reportTypes: ['carfax']              },
  autocheck: { amount: 9.99,  reportTypes: ['autocheck']           },
};

// Coupon validation — must match checkout.html
const COUPONS = {
  'TESTONLY':  { fixedPrice: 1.00 },
  'LAUNCH50':  { type: 'percent', value: 50 },
  'WELCOME20': { type: 'percent', value: 20 },
};

function getDiscountedAmount(planAmount, couponCode) {
  if (!couponCode) return planAmount;
  const coupon = COUPONS[couponCode.toUpperCase()];
  if (!coupon) return planAmount;
  if (coupon.fixedPrice !== undefined) return coupon.fixedPrice;
  if (coupon.type === 'percent') return Math.max(0.01, planAmount * (1 - coupon.value / 100));
  if (coupon.type === 'fixed') return Math.max(0.01, planAmount - coupon.value);
  return planAmount;
}

// Verify PayPal payment is real and amount matches
async function verifyPayPalPayment(orderId, expectedAmount) {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const { access_token } = await tokenRes.json();

  const orderRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${access_token}` },
  });
  const order = await orderRes.json();

  const isPaid = order.status === 'COMPLETED' || order.status === 'APPROVED';
  const paidAmount = parseFloat(order.purchase_units?.[0]?.amount?.value || 0);
  const amountMatch = Math.abs(paidAmount - expectedAmount) < 0.02; // 2 cent tolerance
  return isPaid && amountMatch;
}

// Fetch report from CheapVHR via Fixie static IP proxy
async function fetchReport(vin, reportType) {
  const res = await undiciFetch(
    `https://api.cheapvhr.com/v1/${reportType}/vin/${vin}/html`,
    {
      method: 'GET',
      headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
      dispatcher: proxyAgent,
    }
  );
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`CheapVHR ${res.status}: ${errorBody.slice(0, 200)}`);
  }
  return await res.json(); // { yearMakeModel, vin, id, html }
}

// Email report(s) to customer via Resend
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
    const err = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${err.slice(0, 200)}`);
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, vin, plan, paypalOrderId, coupon } = req.body;

    // Validate inputs
    if (!email || !vin || !plan || !paypalOrderId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (vin.length !== 17) {
      return res.status(400).json({ error: 'VIN must be 17 characters' });
    }
    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan: ' + plan });
    }

    const { amount: baseAmount, reportTypes } = PLANS[plan];
    const expectedAmount = getDiscountedAmount(baseAmount, coupon);

    // Prevent duplicate orders
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('paypal_order_id', paypalOrderId)
      .single()
      .catch(() => ({ data: null }));

    if (existing) {
      console.log('Duplicate order:', paypalOrderId);
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    // Verify PayPal payment
    const isValid = await verifyPayPalPayment(paypalOrderId, expectedAmount);
    if (!isValid) {
      console.error('Payment verification failed:', paypalOrderId, expectedAmount);
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Save order to database
    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        email,
        plan,
        quantity: reportTypes.length,
        amount: expectedAmount,
        paypal_order_id: paypalOrderId,
      });

    if (orderError) {
      console.error('DB error:', orderError);
      // Don't block report delivery if DB save fails
    }

    // Fetch report(s) from CheapVHR
    const reports = [];
    for (const type of reportTypes) {
      console.log(`Fetching ${type} report for VIN: ${vin}`);
      const report = await fetchReport(vin.toUpperCase(), type);
      if (!report.html) throw new Error(`No HTML returned for ${type}`);
      reports.push({ type, ...report });
    }

    // Email report(s) to customer
    await sendReportEmail(email, vin.toUpperCase(), reports);
    console.log('Report delivered to:', email);

    return res.status(200).json({
      success: true,
      yearMakeModel: reports[0]?.yearMakeModel || '',
      reportsDelivered: reports.length,
    });

  } catch (err) {
    console.error('fulfill-order error:', err.message);
    return res.status(500).json({
      error: 'Failed to deliver report. Please contact support@vinrecordhub.com',
      details: err.message,
    });
  }
};
