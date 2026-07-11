// lib/bundles.js
// Canonical credit-bundle pricing. This is the ONLY place bundle prices exist
// server-side — the client never supplies a price, only a bundle id.

const BUNDLES = {
  b3:  { credits: 3,  priceUsd: 19.99, label: '3 Credits'  },
  b10: { credits: 10, priceUsd: 54.99, label: '10 Credits' },
  b15: { credits: 15, priceUsd: 74.99, label: '15 Credits' },
  b25: { credits: 25, priceUsd: 99.99, label: '25 Credits' },
};

function getBundle(bundleId) {
  return BUNDLES[bundleId] || null;
}

// Coupons reduce fiat price only. PayPal can't process $0 orders, so the
// floor is $0.01 — a truly free grant must go through admin_adjust, never
// through checkout.
function applyCoupon(bundle, coupon) {
  const list = bundle.priceUsd;
  let discount = 0;
  if (coupon) {
    if (coupon.discount_type === 'percent') {
      discount = list * (Number(coupon.value) / 100);
    } else if (coupon.discount_type === 'fixed_total') {
      discount = Number(coupon.value);
    } else if (coupon.discount_type === 'per_credit') {
      discount = Number(coupon.value) * bundle.credits;
    }
  }
  discount = Math.min(discount, list - 0.01);
  discount = Math.max(0, Math.round(discount * 100) / 100);
  const amountDue = Math.round((list - discount) * 100) / 100;
  return { listPriceUsd: list, discountUsd: discount, amountDueUsd: amountDue };
}

module.exports = { BUNDLES, getBundle, applyCoupon };
