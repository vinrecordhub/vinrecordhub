// api/paddle-webhook.js
// Receives Paddle webhook events and processes them
// Handles: transaction.completed, transaction.canceled, transaction.payment_failed

const { createClient } = require('@supabase/supabase-js');
const { ProxyAgent, fetch: undiciFetch } = require('undici');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const proxyAgent = process.env.FIXIE_URL ? new ProxyAgent(process.env.FIXIE_URL) : null;

// Paddle price ID to plan mapping
const PRICE_TO_PLAN = {
  'pri_01kqwnxq99mq0f1p751syqjmm2': { plan: 'carfax',    reportTypes: ['carfax'],              amount: 9.99  },
  'pri_01kqwp0ge245ahg9427jzcfwj5': { plan: 'autocheck', reportTypes: ['autocheck'],            amount: 9.99  },
  'pri_01kqwp325vx2xvksm42ejsx4k3': { plan: 'combo',     reportTypes: ['carfax', 'autocheck'], amount: 14.99 },
};

// Verify Paddle webhook signature
function verifyPaddleWebhook(rawBody, signature, secret) {
  try {
    const parts = signature.split(';');
    const tsPart = parts.find(p => p.startsWith('ts='));
    const h1Part = parts.find(p => p.startsWith('h1='));
    if (!tsPart || !h1Part) return false;

    const ts = tsPart.split('=')[1];
    const h1 = h1Part.split('=')[1];
    const signedPayload = `${ts}:${rawBody}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(h1), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

// Fetch report from CheapVHR via Fixie
async function fetchReport(vin, reportType) {
  const res = await undiciFetch(`https://api.cheapvhr.com/v1/${reportType}/vin/${vin}/html`, {
    method: 'GET',
    headers: { 'x-api-key': process.env.CHEAPVHR_API_KEY },
    dispatcher: proxyAgent,
  });
  if (!res.ok) throw new Error(`CheapVHR ${res.status}`);
  return await res.json();
}

// Send report email via Resend
async function sendReportEmail(email, vin, reports) {
  const yearMakeModel = reports[0]?.yearMakeModel || '';
  const isCombo = reports.length > 1;
  const reportTypeLabel = isCombo ? 'Carfax & AutoCheck Reports' : reports[0].type === 'carfax' ? 'Carfax Report' : 'AutoCheck Report';

  const attachments = reports.map(r => ({
    filename: `VIN_${vin}_${r.type === 'carfax' ? 'Carfax' : 'AutoCheck'}.html`,
    content: Buffer.from(r.html, 'utf-8').toString('base64'),
  }));

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
            <p style="color:#666;margin-bottom:24px">Your report${isCombo ? 's are' : ' is'} attached. Open ${isCombo ? 'them' : 'it'} in any browser.</p>
            <div style="background:#0f1a00;border:1px solid #2a3a00;border-radius:10px;padding:16px;margin-bottom:24px">
              <p style="color:#e8ff3f;font-size:13px;font-weight:700;margin-bottom:6px">📎 ${isCombo ? '2 reports' : 'Report'} attached</p>
              ${isCombo ? `<p style="color:#999;font-size:12px">• VIN_${vin}_Carfax.html<br/>• VIN_${vin}_AutoCheck.html</p>` : `<p style="color:#666;font-size:12px">Open <strong style="color:#999">${attachments[0].filename}</strong> in any browser.</p>`}
            </div>
            <p style="color:#444;font-size:12px">Questions? <a href="mailto:support@vinrecordhub.com" style="color:#e8ff3f">support@vinrecordhub.com</a></p>
          </div>
        </body>`,
      attachments,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// Send failure notification email
async function sendFailureEmail(email, reason) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'VINRecordHub <noreply@vinrecordhub.com>',
      to: email,
      subject: 'Payment Issue — VINRecordHub',
      html: `
        <body style="background:#080808;color:#f4f4ef;font-family:sans-serif;padding:40px 20px">
          <div style="max-width:560px;margin:0 auto">
            <div style="font-weight:800;font-size:22px;margin-bottom:24px">VIN<span style="color:#e8ff3f">Record</span>Hub</div>
            <h1 style="font-size:24px;margin-bottom:10px">Payment ${reason === 'canceled' ? 'Cancelled' : 'Failed'}</h1>
            <p style="color:#666;margin-bottom:24px">
              ${reason === 'canceled'
                ? 'Your payment was cancelled. No charge was made to your account.'
                : 'We were unable to process your payment. Please try again with a different payment method.'}
            </p>
            <a href="https://vinrecordhub.com" style="background:#e8ff3f;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Try Again →</a>
            <p style="color:#444;font-size:12px;margin-top:24px">Questions? <a href="mailto:support@vinrecordhub.com" style="color:#e8ff3f">support@vinrecordhub.com</a></p>
          </div>
        </body>`,
    }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Get raw body for signature verification
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['paddle-signature'];

  // Verify webhook signature
  const isValid = verifyPaddleWebhook(rawBody, signature, process.env.PADDLE_WEBHOOK_SECRET);
  if (!isValid) {
    console.error('Invalid Paddle webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event_type, data } = req.body;
  console.log('Paddle webhook received:', event_type);

  try {
    // Get customer email and custom data from transaction
    const email = data?.customer?.email || data?.custom_data?.email;
    const vin = data?.custom_data?.vin?.toUpperCase();
    const priceId = data?.items?.[0]?.price?.id;
    const transactionId = data?.id;

    // Handle transaction.completed — deliver report
    if (event_type === 'transaction.completed') {
      if (!email || !vin || !priceId) {
        console.error('Missing required fields:', { email, vin, priceId });
        return res.status(200).json({ received: true }); // Return 200 so Paddle doesn't retry
      }

      const planInfo = PRICE_TO_PLAN[priceId];
      if (!planInfo) {
        console.error('Unknown price ID:', priceId);
        return res.status(200).json({ received: true });
      }

      // Check for duplicate
      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('paypal_order_id', transactionId)
        .single();

      if (existing) {
        console.log('Duplicate transaction, skipping:', transactionId);
        return res.status(200).json({ received: true });
      }

      // Save order
      await supabase.from('orders').insert({
        email,
        plan: planInfo.plan,
        quantity: planInfo.reportTypes.length,
        amount: planInfo.amount,
        paypal_order_id: transactionId, // reusing column for transaction ID
      });

      // Fetch reports from CheapVHR
      const reports = [];
      for (const type of planInfo.reportTypes) {
        const report = await fetchReport(vin, type);
        if (!report.html) throw new Error(`No HTML for ${type}`);
        reports.push({ type, ...report });
      }

      // Email reports to customer
      await sendReportEmail(email, vin, reports);
      console.log('Report delivered successfully to:', email);
    }

    // Handle transaction.canceled
    if (event_type === 'transaction.canceled') {
      if (email) {
        await sendFailureEmail(email, 'canceled');
        console.log('Cancellation email sent to:', email);
      }
    }

    // Handle transaction.payment_failed
    if (event_type === 'transaction.payment_failed') {
      if (email) {
        await sendFailureEmail(email, 'failed');
        console.log('Payment failed email sent to:', email);
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook processing error:', err.message);
    // Still return 200 to prevent Paddle from retrying indefinitely
    // Log the error for manual review
    return res.status(200).json({ received: true, error: err.message });
  }
};
