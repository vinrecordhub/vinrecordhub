// api/sanitize.js
// Input sanitization helpers

// Validate VIN — 17 chars, alphanumeric, no I O Q
function sanitizeVin(vin) {
  if (!vin || typeof vin !== 'string') return null;
  const clean = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  if (clean.length !== 17) return null;
  return clean;
}

// Validate email
function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return null;
  if (clean.length > 254) return null;
  return clean;
}

// Validate plan name
function sanitizePlan(plan) {
  const validPlans = ['carfax', 'autocheck', 'combo', 'standard', 'plus'];
  if (!plan || !validPlans.includes(plan.toLowerCase())) return null;
  return plan.toLowerCase();
}

// Validate PayPal order ID
function sanitizeOrderId(orderId) {
  if (!orderId || typeof orderId !== 'string') return null;
  const clean = orderId.trim().toUpperCase();
  if (!/^[A-Z0-9]{17}$/.test(clean)) return null;
  return clean;
}

// Sanitize coupon code
function sanitizeCoupon(coupon) {
  if (!coupon || typeof coupon !== 'string') return null;
  const clean = coupon.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length > 20) return null;
  return clean;
}

module.exports = {
  sanitizeVin,
  sanitizeEmail,
  sanitizePlan,
  sanitizeOrderId,
  sanitizeCoupon,
};
