// lib/checkout-pricing.js
// Canonical single-report checkout plans + DB coupon validation, shared by
// api/checkout-coupon (price quote) and api/fulfill-order (payment
// verification). Coupons live in the admin-managed coupons table; one applies
// to this flow when applies_to is null or names a checkout plan id. The
// no-account flow has no user identity, so only the global max_redemptions
// cap is enforceable — counted from orders.coupon_code at validation time
// (small check-then-pay window, bounded to discount abuse; credits are never
// involved here).

const { supabase } = require('./supabase-server');

// Plan mapping — supports both old names (carfax/autocheck) and new names (standard/plus)
const CHECKOUT_PLANS = {
  standard:  { amount: 6.99, reportTypes: ['carfax']              },
  plus:      { amount: 6.99, reportTypes: ['autocheck']           },
  combo:     { amount: 9.99, reportTypes: ['carfax', 'autocheck'] },
  carfax:    { amount: 6.99, reportTypes: ['carfax']              },
  autocheck: { amount: 6.99, reportTypes: ['autocheck']           },
};

// applies_to scoping uses the canonical ids only
function canonicalPlanId(plan) {
  return { carfax: 'standard', autocheck: 'plus' }[plan] || plan;
}

async function validateCheckoutCoupon(code, plan) {
  const clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!clean || clean.length < 3 || clean.length > 32) return { error: 'invalid_coupon' };

  const { data: coupon } = await supabase
    .from('coupons')
    .select('id, code, description, discount_type, value, applies_to, max_redemptions, is_active, expires_at')
    .eq('code', clean)
    .single();

  if (!coupon || !coupon.is_active) return { error: 'invalid_coupon' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return { error: 'coupon_expired' };
  if (!['percent', 'fixed_total', 'set_price'].includes(coupon.discount_type)) {
    return { error: 'coupon_not_applicable' }; // per_credit is bundle-flow-only
  }
  const scope = Array.isArray(coupon.applies_to) && coupon.applies_to.length ? coupon.applies_to : null;
  if (scope && !scope.includes(canonicalPlanId(plan))) return { error: 'coupon_not_applicable' };

  if (coupon.max_redemptions !== null) {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_code', coupon.code);
    if ((count || 0) >= coupon.max_redemptions) return { error: 'coupon_exhausted' };
  }

  return { coupon };
}

// Discounted price for a plan. Floor is $0.01 — PayPal can't process $0.
function checkoutPrice(planAmount, coupon) {
  if (!coupon) return planAmount;
  let final = planAmount;
  if (coupon.discount_type === 'set_price') final = Number(coupon.value);
  else if (coupon.discount_type === 'percent') final = planAmount * (1 - Number(coupon.value) / 100);
  else if (coupon.discount_type === 'fixed_total') final = planAmount - Number(coupon.value);
  return Math.max(0.01, Math.round(final * 100) / 100);
}

module.exports = { CHECKOUT_PLANS, validateCheckoutCoupon, checkoutPrice };
