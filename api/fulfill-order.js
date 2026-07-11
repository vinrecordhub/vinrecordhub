// api/fulfill-order.js
// POST /api/fulfill-order
// Verifies PayPal payment -> generates report(s) from CheapVHR -> emails customer.
// Persists VIN + CheapVHR report ids + delivery status so a failed delivery can
// be recovered (free) from the admin panel via /api/resend-order.

const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('../lib/rate-limit');
const { sanitizeVin, sanitizeEmail, sanitizePlan, sanitizeOrderId, sanitizeCoupon } = require('../lib/sanitize');
const svc = require('../lib/report-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const { CHECKOUT_PLANS, validateCheckoutCoupon, checkoutPrice } = require('../lib/checkout-pricing');

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

// ─── MAIN HANDLER ─────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://vinrecordhub.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit: 5 payment attempts per IP per minute
  const rl = rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (rl.limited) {
    return res.status(429).json({ error: 'Too many requests. Please wait ' + rl.resetIn + ' seconds.' });
  }

  try {
    // Sanitize all inputs
    const email = sanitizeEmail(req.body.email);
    const vin = sanitizeVin(req.body.vin);
    const plan = sanitizePlan(req.body.plan);
    const paypalOrderId = sanitizeOrderId(req.body.paypalOrderId);
    const coupon = sanitizeCoupon(req.body.coupon);

    // Validate sanitized inputs
    if (!email) return res.status(400).json({ error: 'Invalid email address' });
    if (!vin) return res.status(400).json({ error: 'Invalid VIN — must be 17 alphanumeric characters' });
    if (!plan) return res.status(400).json({ error: 'Invalid plan selected' });
    if (!paypalOrderId) return res.status(400).json({ error: 'Invalid order ID' });

    const { amount: baseAmount, reportTypes } = CHECKOUT_PLANS[plan];

    // Coupons come from the admin-managed coupons table. An invalid, revoked,
    // or exhausted code means full price is expected — a client that paid the
    // discounted amount anyway then fails payment verification below.
    let couponRow = null;
    if (coupon) {
      const cv = await validateCheckoutCoupon(coupon, plan);
      couponRow = cv.coupon || null;
    }
    const expectedAmount = checkoutPrice(baseAmount, couponRow);

    // Prevent duplicate orders
    let existing = null;
    try {
      const { data } = await supabase
        .from('orders')
        .select('id')
        .eq('paypal_order_id', paypalOrderId)
        .single();
      existing = data;
    } catch (e) {
      // No existing order found — this is fine, continue
    }

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

    // Save order first so a failed report/email is still recoverable from admin.
    let orderRowId = null;
    const { data: inserted, error: orderError } = await supabase
      .from('orders')
      .insert({
        email,
        plan,
        quantity: reportTypes.length,
        amount: expectedAmount,
        paypal_order_id: paypalOrderId,
        vin,
        coupon_code: couponRow ? couponRow.code : null,
        delivery_status: 'pending',
      })
      .select('id')
      .single();
    if (orderError) console.error('DB insert error:', orderError.message);
    else orderRowId = inserted?.id || null;

    // Generate report(s) — keep going on a per-type failure so a combo still
    // delivers the half that succeeded; the rest is recoverable via resend.
    const reports = [];
    const idUpdates = {};
    const failures = [];
    for (const type of reportTypes) {
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

    // Email whatever generated successfully.
    let emailed = false;
    if (reports.length) {
      try {
        await svc.sendReportEmail(email, vin, reports);
        emailed = true;
      } catch (err) {
        console.error('Resend email failed:', err.message);
        failures.push(`email: ${err.message}`);
      }
    }

    const status = !reports.length ? 'failed'
      : (emailed && reports.length === reportTypes.length ? 'delivered' : 'partial');

    if (orderRowId) {
      await supabase.from('orders').update({
        ...idUpdates,
        year_make_model: reports[0]?.yearMakeModel || null,
        delivery_status: status,
        delivered_at: emailed ? new Date().toISOString() : null,
        last_error: failures.join('; ') || null,
      }).eq('id', orderRowId);
    }

    // Customer paid — if nothing got delivered, signal the failure (the order is
    // saved as 'failed'/'partial' for one-click recovery from the admin panel).
    if (!emailed) {
      return res.status(502).json({
        error: 'Your payment went through, but the report is delayed. We\'ll email it to you shortly — contact support@vinrecordhub.com if it doesn\'t arrive within an hour.',
        status,
      });
    }

    return res.status(200).json({
      success: true,
      yearMakeModel: reports[0]?.yearMakeModel || '',
      reportsDelivered: reports.length,
      status,
    });

  } catch (err) {
    console.error('fulfill-order error:', err.message);
    return res.status(500).json({
      error: 'Failed to deliver report. Please contact support@vinrecordhub.com',
      details: err.message,
    });
  }
};
