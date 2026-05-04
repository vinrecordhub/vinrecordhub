// api/create-order.js
// Called after PayPal payment is confirmed
// Verifies payment, generates redemption codes, sends email

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PLANS = {
  carfax:    { quantity: 1, amount: 9.99,  reportType: 'carfax'    },
  autocheck: { quantity: 1, amount: 9.99,  reportType: 'autocheck' },
  combo:     { quantity: 2, amount: 14.99, reportType: 'combo'     },
};

// Generate a random alphanumeric code
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code; // Format: XXXX-XXXX-XXXX-XXXX
}

// Verify PayPal payment is real and paid
async function verifyPayPalPayment(orderId, expectedAmount) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  // Get PayPal access token
  const authRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const { access_token } = await authRes.json();

  // Get order details
  const orderRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${access_token}` },
  });
  const order = await orderRes.json();

  const isPaid = order.status === 'COMPLETED';
  const paidAmount = parseFloat(order.purchase_units?.[0]?.amount?.value || 0);
  const amountMatch = Math.abs(paidAmount - expectedAmount) < 0.01;

  return isPaid && amountMatch;
}

// Send email via Resend
async function sendRedemptionEmail(email, codes, plan, quantity) {
  const baseUrl = process.env.SITE_URL || 'https://vinrecordhub.com';
  
  const codeLinks = codes.map((code, i) => 
    `<tr>
      <td style="padding:10px;color:#888;font-family:monospace">Report ${i + 1}</td>
      <td style="padding:10px">
        <a href="${baseUrl}/redeem.html?code=${code}" 
           style="color:#e8ff3f;font-family:monospace;letter-spacing:2px">${code}</a>
      </td>
      <td style="padding:10px">
        <a href="${baseUrl}/redeem.html?code=${code}" 
           style="background:#e8ff3f;color:#000;padding:6px 14px;border-radius:4px;text-decoration:none;font-weight:700;font-size:12px">
          Use →
        </a>
      </td>
    </tr>`
  ).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="background:#080808;color:#f4f4ef;font-family:'DM Sans',sans-serif;margin:0;padding:40px 20px">
      <div style="max-width:580px;margin:0 auto">
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:22px;margin-bottom:30px">
          VIN<span style="color:#e8ff3f">Record</span>Hub
        </div>
        <h1 style="font-size:28px;font-weight:800;margin-bottom:10px;letter-spacing:-1px">Your reports are ready!</h1>
        <p style="color:#666;margin-bottom:30px">
          Thanks for your purchase. You have <strong style="color:#fff">${quantity} vehicle history report${quantity > 1 ? 's' : ''}</strong> ready to use. 
          Your credits never expire — use them whenever you need them.
        </p>

        <div style="background:#111;border:1px solid #222;border-radius:12px;padding:24px;margin-bottom:30px">
          <p style="color:#666;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px">Your Report Credits</p>
          <table width="100%" cellspacing="0" cellpadding="0">
            ${codeLinks}
          </table>
        </div>

        <div style="background:#111;border:1px solid #222;border-radius:12px;padding:24px;margin-bottom:30px">
          <p style="color:#666;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">How to Use</p>
          <p style="font-size:14px;color:#999;line-height:1.7">
            1. Click any "Use →" button above<br/>
            2. Enter the VIN of the vehicle you want to check<br/>
            3. Your full vehicle history report will be emailed to you within 60 seconds
          </p>
        </div>

        <p style="color:#444;font-size:13px">
          Questions? Reply to this email or contact 
          <a href="mailto:support@vinrecordhub.com" style="color:#e8ff3f">support@vinrecordhub.com</a>
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
      subject: `Your ${quantity} VIN Report${quantity > 1 ? 's are' : ' is'} Ready — VINRecordHub`,
      html,
    }),
  });
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, plan, paypalOrderId } = req.body;

    // Validate inputs
    if (!email || !plan || !paypalOrderId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const { quantity, amount } = PLANS[plan];

    // Verify PayPal payment
    const isValid = await verifyPayPalPayment(paypalOrderId, amount);
    if (!isValid) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Check for duplicate order
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('paypal_order_id', paypalOrderId)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Order already processed' });
    }

    // Create order in DB
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({ email, plan, quantity, amount, paypal_order_id: paypalOrderId })
      .select()
      .single();

    if (orderError) throw orderError;

    // Generate unique redemption codes
    const codes = [];
    for (let i = 0; i < quantity; i++) {
      let code, exists = true;
      while (exists) {
        code = generateCode();
        const { data } = await supabase
          .from('redemption_codes')
          .select('id')
          .eq('code', code)
          .single();
        exists = !!data;
      }
      codes.push(code);
    }

    // Insert codes into DB
    const { error: codesError } = await supabase
      .from('redemption_codes')
      .insert(codes.map(code => ({ order_id: order.id, code })));

    if (codesError) throw codesError;

    // Send email
    await sendRedemptionEmail(email, codes, plan, quantity);

    return res.status(200).json({ success: true, quantity });

  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
