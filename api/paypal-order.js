// api/paypal-order.js
// POST /api/paypal-order  { action: 'create' | 'capture', ... }
//
// create:  { action, bundleId, couponCode? } -> { paypalOrderId, pricing }
//   Server computes the price from lib/bundles + the coupons table; the client
//   never supplies an amount. A credit_orders row is opened before the PayPal
//   order so the webhook can correlate via custom_id.
// capture: { action, paypalOrderId } -> { granted, balance }
//   Captures server-side, then grants through apply_credit_purchase() — the
//   same idempotent SECURITY DEFINER path the webhook uses, so double grants
//   are impossible regardless of which arrives first.

const rateLimit = require('../lib/rate-limit');
const { supabase, getUserFromRequest, isEmailVerified } = require('../lib/supabase-server');
const { getBundle, applyCoupon } = require('../lib/bundles');
const paypal = require('../lib/paypal');

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

async function validateCoupon(code, bundleId, userId) {
  const clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!clean) return { coupon: null };
  if (clean.length < 3 || clean.length > 32) return { error: 'invalid_coupon' };

  const { data: coupon } = await supabase
    .from('coupons')
    .select('id, code, discount_type, value, applies_to, max_redemptions, redemption_count, per_user_limit, is_active, expires_at')
    .eq('code', clean)
    .single();

  if (!coupon || !coupon.is_active) return { error: 'invalid_coupon' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return { error: 'coupon_expired' };
  if (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions) {
    return { error: 'coupon_exhausted' };
  }
  if (Array.isArray(coupon.applies_to) && coupon.applies_to.length && !coupon.applies_to.includes(bundleId)) {
    return { error: 'coupon_not_applicable' };
  }
  const { count } = await supabase
    .from('coupon_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', coupon.id)
    .eq('user_id', userId);
  if ((count || 0) >= coupon.per_user_limit) return { error: 'coupon_already_used' };

  return { coupon };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://vinrecordhub.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'POST only');

  const rl = rateLimit(req, { maxRequests: 10, windowMs: 60000 });
  if (rl.limited) return fail(res, 429, 'rate_limited', `Too many requests. Retry in ${rl.resetIn}s.`);

  const user = await getUserFromRequest(req);
  if (!user) return fail(res, 401, 'unauthorized', 'Sign in required');
  if (!isEmailVerified(user)) return fail(res, 403, 'email_unverified', 'Verify your email before buying credits');

  const { action } = req.body || {};

  try {
    // Price preview for the summary panel — validates the coupon server-side,
    // writes nothing.
    if (action === 'quote') {
      const bundle = getBundle(req.body.bundleId);
      if (!bundle) return fail(res, 400, 'invalid_bundle', 'Unknown bundle');
      const couponResult = await validateCoupon(req.body.couponCode, req.body.bundleId, user.id);
      if (couponResult.error) return fail(res, 400, couponResult.error, 'Coupon cannot be applied');
      return res.status(200).json({
        pricing: applyCoupon(bundle, couponResult.coupon),
        coupon: couponResult.coupon ? { code: couponResult.coupon.code } : null,
      });
    }

    if (action === 'create') {
      const bundle = getBundle(req.body.bundleId);
      if (!bundle) return fail(res, 400, 'invalid_bundle', 'Unknown bundle');

      const couponResult = await validateCoupon(req.body.couponCode, req.body.bundleId, user.id);
      if (couponResult.error) return fail(res, 400, couponResult.error, 'Coupon cannot be applied');
      const coupon = couponResult.coupon;

      const pricing = applyCoupon(bundle, coupon);

      const { data: orderRow, error: insertErr } = await supabase
        .from('credit_orders')
        .insert({
          user_id: user.id,
          bundle_id: req.body.bundleId,
          credits: bundle.credits,
          list_price_usd: pricing.listPriceUsd,
          discount_usd: pricing.discountUsd,
          amount_due_usd: pricing.amountDueUsd,
          coupon_id: coupon ? coupon.id : null,
        })
        .select('id')
        .single();
      if (insertErr) throw new Error('order insert failed: ' + insertErr.message);

      // Reserve the coupon atomically now (under a row lock) so per-user and
      // max-redemption limits hold even if many orders are opened before any is
      // paid. The create-time validateCoupon above is only fast UX feedback.
      if (coupon) {
        const { data: reserved, error: reserveErr } = await supabase.rpc('reserve_coupon', {
          p_coupon_id: coupon.id,
          p_user_id: user.id,
          p_order_id: orderRow.id,
        });
        if (reserveErr) throw new Error('reserve_coupon failed: ' + reserveErr.message);
        if (reserved !== true) {
          await supabase.from('credit_orders')
            .update({ status: 'canceled', updated_at: new Date().toISOString() })
            .eq('id', orderRow.id);
          return fail(res, 409, 'coupon_unavailable', 'This coupon is no longer available');
        }
      }

      const pp = await paypal.createOrder({
        amountUsd: pricing.amountDueUsd,
        description: `VINRecordHub — ${bundle.label} (${bundle.credits} report${bundle.credits > 1 ? 's' : ''})`,
        customId: orderRow.id,
      });
      if (!pp.ok || !pp.json?.id) {
        console.error('PayPal create failed:', pp.status, JSON.stringify(pp.json || {}).slice(0, 300));
        await supabase.from('credit_orders')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('id', orderRow.id);
        if (coupon) await supabase.rpc('release_coupon_for_order', { p_order_id: orderRow.id });
        return fail(res, 502, 'paypal_error', 'Could not start payment');
      }

      await supabase
        .from('credit_orders')
        .update({ paypal_order_id: pp.json.id, updated_at: new Date().toISOString() })
        .eq('id', orderRow.id);

      return res.status(200).json({ paypalOrderId: pp.json.id, pricing });
    }

    if (action === 'capture') {
      const paypalOrderId = String(req.body.paypalOrderId || '').trim();
      if (!/^[A-Z0-9]{10,20}$/i.test(paypalOrderId)) return fail(res, 400, 'invalid_order_id', 'Bad order id');

      const { data: orderRow } = await supabase
        .from('credit_orders')
        .select('id, user_id, status, amount_due_usd')
        .eq('paypal_order_id', paypalOrderId)
        .single();
      if (!orderRow || orderRow.user_id !== user.id) {
        return fail(res, 404, 'order_not_found', 'Order not found');
      }
      if (orderRow.status === 'granted') {
        return res.status(200).json({ granted: true, message: 'already_granted' });
      }

      let capture = await paypal.captureOrder(paypalOrderId);
      let captureId = null;
      let paidAmount = null;
      let status = capture.json?.status;

      if (!capture.ok && capture.json?.details?.some(d => d.issue === 'ORDER_ALREADY_CAPTURED')) {
        // Webhook or a retry captured first — read the order instead.
        capture = await paypal.getOrder(paypalOrderId);
        status = capture.json?.status;
      }
      const captureObj = capture.json?.purchase_units?.[0]?.payments?.captures?.[0];
      captureId = captureObj?.id || null;
      paidAmount = parseFloat(captureObj?.amount?.value || 'NaN');

      if (captureObj && captureObj.amount?.currency_code !== 'USD') {
        console.error('non-USD capture refused:', paypalOrderId, captureObj.amount?.currency_code);
        return fail(res, 409, 'currency_mismatch', 'Unexpected payment currency — contact support@vinrecordhub.com');
      }
      if (status !== 'COMPLETED' || !captureId || Number.isNaN(paidAmount)) {
        console.error('capture not completed:', paypalOrderId, status);
        return fail(res, 402, 'payment_incomplete', 'Payment was not completed');
      }

      const { data: grant, error: grantErr } = await supabase
        .rpc('apply_credit_purchase', {
          p_paypal_order_id: paypalOrderId,
          p_capture_id: captureId,
          p_paid_amount: paidAmount,
        });
      if (grantErr) throw new Error('grant rpc failed: ' + grantErr.message);

      const result = Array.isArray(grant) ? grant[0] : grant;
      const { data: profile } = await supabase
        .from('profiles')
        .select('credit_balance')
        .eq('id', user.id)
        .single();

      const ok = result?.granted || result?.message === 'already_granted' || result?.message === 'duplicate_capture';
      if (!ok) {
        console.error('grant refused:', paypalOrderId, result?.message);
        return fail(res, 409, 'grant_refused', 'Payment received but credit grant was refused — contact support@vinrecordhub.com');
      }
      return res.status(200).json({ granted: true, balance: profile?.credit_balance ?? null });
    }

    return fail(res, 400, 'invalid_action', "action must be 'create' or 'capture'");
  } catch (err) {
    console.error('paypal-order error:', err.message);
    return fail(res, 500, 'internal', 'Something went wrong — you were not charged twice. Contact support@vinrecordhub.com');
  }
};
