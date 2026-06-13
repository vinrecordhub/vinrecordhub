// api/paddle-webhook.js
// Receives Paddle webhook events and processes them.
// Handles: transaction.completed, transaction.canceled, transaction.payment_failed
//
// Persists VIN + CheapVHR report ids + delivery status so a failed delivery can
// be recovered (free) from the admin panel via /api/resend-order.

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const svc = require('./report-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

      // Save order first so a failed report/email is still recoverable from admin.
      const { data: inserted } = await supabase
        .from('orders')
        .insert({
          email,
          plan: planInfo.plan,
          quantity: planInfo.reportTypes.length,
          amount: planInfo.amount,
          paypal_order_id: transactionId, // reusing column for transaction ID
          vin,
          delivery_status: 'pending',
        })
        .select('id')
        .single();
      const orderRowId = inserted?.id || null;

      // Generate report(s) — keep going on a per-type failure so a combo still
      // delivers what succeeded; the rest is recoverable via resend.
      const reports = [];
      const idUpdates = {};
      const failures = [];
      for (const type of planInfo.reportTypes) {
        try {
          const r = await svc.generateReportByVin(vin, type);
          if (!r.html) throw new Error('No HTML returned');
          if (r.id) idUpdates[svc.REPORT_ID_COLUMN[type]] = String(r.id);
          reports.push({ type, html: r.html, yearMakeModel: r.yearMakeModel });
        } catch (err) {
          console.error(`CheapVHR ${type} failed for ${vin}:`, err.message);
          failures.push(`${type}: ${err.message}`);
        }
      }

      let emailed = false;
      if (reports.length) {
        try {
          await svc.sendReportEmail(email, vin, reports);
          emailed = true;
          console.log('Report delivered successfully to:', email);
        } catch (err) {
          console.error('Resend email failed:', err.message);
          failures.push(`email: ${err.message}`);
        }
      }

      const status = !reports.length ? 'failed'
        : (emailed && reports.length === planInfo.reportTypes.length ? 'delivered' : 'partial');

      if (orderRowId) {
        await supabase.from('orders').update({
          ...idUpdates,
          year_make_model: reports[0]?.yearMakeModel || null,
          delivery_status: status,
          delivered_at: emailed ? new Date().toISOString() : null,
          last_error: failures.join('; ') || null,
        }).eq('id', orderRowId);
      }
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
