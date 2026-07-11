// api/checkout-coupon.js
// POST /api/checkout-coupon  { code, plan } -> { coupon, basePrice, finalPrice }
// Public price quote for the no-account single-report checkout. Writes
// nothing; fulfill-order re-validates the coupon at payment time, so a code
// deactivated between quote and pay simply fails amount verification there.

const rateLimit = require('../lib/rate-limit');
const { sanitizePlan } = require('../lib/sanitize');
const { CHECKOUT_PLANS, validateCheckoutCoupon, checkoutPrice } = require('../lib/checkout-pricing');

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://vinrecordhub.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'POST only');

  const rl = rateLimit(req, { maxRequests: 15, windowMs: 60000 });
  if (rl.limited) return fail(res, 429, 'rate_limited', `Too many requests. Retry in ${rl.resetIn}s.`);

  const plan = sanitizePlan(req.body?.plan);
  if (!plan) return fail(res, 400, 'invalid_plan', 'Unknown plan');

  try {
    const result = await validateCheckoutCoupon(req.body?.code, plan);
    if (result.error) return fail(res, 400, result.error, 'Coupon cannot be applied');

    const base = CHECKOUT_PLANS[plan].amount;
    return res.status(200).json({
      coupon: {
        code: result.coupon.code,
        discountType: result.coupon.discount_type,
        value: Number(result.coupon.value),
        description: result.coupon.description || '',
      },
      basePrice: base,
      finalPrice: checkoutPrice(base, result.coupon),
    });
  } catch (err) {
    console.error('checkout-coupon error:', err.message);
    return fail(res, 500, 'internal', 'Could not validate coupon');
  }
};
