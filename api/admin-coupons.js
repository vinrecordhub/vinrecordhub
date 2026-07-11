// api/admin-coupons.js
// Admin CRUD for checkout coupons (price reduction only — coupons can never
// mint credits; grants happen exclusively via verified payment captures).
//   GET    /api/admin-coupons?token=...           list with redemption stats
//   POST   /api/admin-coupons?token=...           create
//   PUT    /api/admin-coupons?token=...&id=N      update (incl. max_redemptions)
//   DELETE /api/admin-coupons?token=...&id=N      deactivate (soft)

const { supabase } = require('../lib/supabase-server');
const { BUNDLES } = require('../lib/bundles');
const { isAuthorizedAdmin } = require('../lib/admin-auth');

// applies_to accepts bundle ids (credit flow) and/or checkout plan ids
// (no-account single-report flow). set_price coupons must stay checkout-only.
const CHECKOUT_PLAN_IDS = ['standard', 'plus', 'combo'];
const VALID_SCOPES = [...Object.keys(BUNDLES), ...CHECKOUT_PLAN_IDS];

function isCheckoutOnlyScope(appliesTo) {
  return Array.isArray(appliesTo) && appliesTo.length > 0
    && appliesTo.every(s => CHECKOUT_PLAN_IDS.includes(s));
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

const MUTABLE = ['description', 'value', 'applies_to', 'max_redemptions', 'per_user_limit', 'is_active', 'expires_at'];

function validateFields(body, { forCreate }) {
  const out = {};
  const errs = [];

  if (forCreate) {
    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) errs.push('code must be 3-32 chars A-Z 0-9 _ -');
    out.code = code;
    if (!['percent', 'fixed_total', 'per_credit', 'set_price'].includes(body.discount_type)) {
      errs.push("discount_type must be percent | fixed_total | per_credit | set_price");
    }
    out.discount_type = body.discount_type;
    if (body.discount_type === 'set_price' && !isCheckoutOnlyScope(body.applies_to)) {
      errs.push(`set_price coupons must be scoped to checkout plans only (${CHECKOUT_PLAN_IDS.join(', ')})`);
    }
  }

  if (body.value !== undefined) {
    const v = Number(body.value);
    const type = body.discount_type;
    if (!Number.isFinite(v) || v <= 0) errs.push('value must be > 0');
    else if ((type === 'percent' || (!forCreate && type === undefined)) && v > 100) errs.push('percent value must be <= 100');
    out.value = v;
  } else if (forCreate) {
    errs.push('value required');
  }

  if (body.applies_to !== undefined && body.applies_to !== null) {
    if (!Array.isArray(body.applies_to) || body.applies_to.some(s => !VALID_SCOPES.includes(s))) {
      errs.push(`applies_to must be null or an array of: ${VALID_SCOPES.join(', ')}`);
    } else {
      out.applies_to = body.applies_to.length ? body.applies_to : null;
    }
  } else if ('applies_to' in body) {
    out.applies_to = null;
  }

  if (body.max_redemptions !== undefined) {
    if (body.max_redemptions === null) out.max_redemptions = null;
    else {
      const n = parseInt(body.max_redemptions, 10);
      if (!Number.isInteger(n) || n <= 0) errs.push('max_redemptions must be a positive integer or null');
      else out.max_redemptions = n;
    }
  }
  if (body.per_user_limit !== undefined) {
    const n = parseInt(body.per_user_limit, 10);
    if (!Number.isInteger(n) || n <= 0) errs.push('per_user_limit must be a positive integer');
    else out.per_user_limit = n;
  }
  if (body.is_active !== undefined) out.is_active = Boolean(body.is_active);
  if (body.expires_at !== undefined) {
    if (body.expires_at === null) out.expires_at = null;
    else if (Number.isNaN(Date.parse(body.expires_at))) errs.push('expires_at must be an ISO date or null');
    else out.expires_at = new Date(body.expires_at).toISOString();
  }
  if (body.description !== undefined) out.description = String(body.description || '').slice(0, 200);

  return { fields: out, errs };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthorizedAdmin(req)) return fail(res, 401, 'unauthorized', 'Bad token');

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      // redemption_count only tracks the bundle flow; checkout (no-account)
      // uses are counted from orders.coupon_code.
      const { data: orderRows } = await supabase
        .from('orders')
        .select('coupon_code')
        .not('coupon_code', 'is', null);
      const checkoutUses = {};
      for (const row of orderRows || []) {
        checkoutUses[row.coupon_code] = (checkoutUses[row.coupon_code] || 0) + 1;
      }
      return res.status(200).json({
        coupons: data.map(c => ({ ...c, checkout_uses: checkoutUses[c.code] || 0 })),
      });
    }

    if (req.method === 'POST') {
      const { fields, errs } = validateFields(req.body || {}, { forCreate: true });
      if (errs.length) return fail(res, 400, 'validation', errs.join('; '));
      const { data, error } = await supabase.from('coupons').insert(fields).select('*').single();
      if (error) {
        if (/duplicate key/.test(error.message)) return fail(res, 409, 'duplicate_code', 'Code already exists');
        throw new Error(error.message);
      }
      return res.status(201).json({ coupon: data });
    }

    if (req.method === 'PUT') {
      const id = parseInt(req.query.id, 10);
      if (!Number.isInteger(id)) return fail(res, 400, 'invalid_id', 'id required');
      const body = req.body || {};
      const unknown = Object.keys(body).filter(k => !MUTABLE.includes(k));
      if (unknown.length) return fail(res, 400, 'immutable_field', `Cannot change: ${unknown.join(', ')}`);
      const { fields, errs } = validateFields(body, { forCreate: false });
      if (errs.length) return fail(res, 400, 'validation', errs.join('; '));
      if (!Object.keys(fields).length) return fail(res, 400, 'empty', 'Nothing to update');
      // discount_type is immutable, so only a scope change can move a
      // set_price coupon onto bundles — refuse that here.
      if ('applies_to' in fields) {
        const { data: existing } = await supabase
          .from('coupons').select('discount_type').eq('id', id).single();
        if (existing?.discount_type === 'set_price' && !isCheckoutOnlyScope(fields.applies_to)) {
          return fail(res, 400, 'validation',
            `set_price coupons must be scoped to checkout plans only (${CHECKOUT_PLAN_IDS.join(', ')})`);
        }
      }
      fields.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('coupons').update(fields).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ coupon: data });
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id, 10);
      if (!Number.isInteger(id)) return fail(res, 400, 'invalid_id', 'id required');
      const { error } = await supabase
        .from('coupons')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ deactivated: true });
    }

    return fail(res, 405, 'method_not_allowed', 'GET, POST, PUT, DELETE only');
  } catch (err) {
    console.error('admin-coupons error:', err.message);
    return fail(res, 500, 'internal', 'Internal error');
  }
};
