// api/generate-report.js
// POST /api/generate-report  { vin, reportType: 'carfax'|'autocheck', requestId }
// Auth: Authorization: Bearer <supabase access token>, verified email required.
//
// Spends exactly 1 credit atomically (DB constraint forbids negative balance),
// generates the report via CheapVHR, emails it, and refunds the credit exactly
// once if generation fails. requestId is a client-generated UUID that makes
// accidental double-submits spend only once.

const crypto = require('crypto');
const rateLimit = require('../lib/rate-limit');
const { sanitizeVin } = require('../lib/sanitize');
const { supabase, getUserFromRequest, isEmailVerified } = require('../lib/supabase-server');
const svc = require('../lib/report-service');

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://vinrecordhub.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'POST only');

  const rl = rateLimit(req, { maxRequests: 6, windowMs: 60000 });
  if (rl.limited) return fail(res, 429, 'rate_limited', `Too many requests. Retry in ${rl.resetIn}s.`);

  const user = await getUserFromRequest(req);
  if (!user) return fail(res, 401, 'unauthorized', 'Sign in required');
  if (!isEmailVerified(user)) return fail(res, 403, 'email_unverified', 'Verify your email before spending credits');

  const vin = sanitizeVin(req.body?.vin);
  if (!vin) return fail(res, 400, 'invalid_vin', 'VIN must be 17 characters (no I, O, Q)');

  const reportType = req.body?.reportType === 'autocheck' ? 'autocheck'
    : req.body?.reportType === 'carfax' ? 'carfax' : null;
  if (!reportType) return fail(res, 400, 'invalid_report_type', "reportType must be 'carfax' or 'autocheck'");

  const requestId = /^[a-f0-9-]{8,64}$/i.test(String(req.body?.requestId || ''))
    ? req.body.requestId
    : crypto.randomUUID();
  const idempotencyKey = `spend:${user.id}:${requestId}`;

  // 1. Atomic spend — opens the report row and writes the -1 ledger entry in
  //    one DB transaction. Insufficient balance aborts both.
  let reportId;
  try {
    const { data, error } = await supabase.rpc('spend_credit_for_report', {
      p_user_id: user.id,
      p_vin: vin,
      p_report_type: reportType,
      p_idempotency: idempotencyKey,
    });
    if (error) {
      if (/credit_balance/.test(error.message)) {
        return fail(res, 402, 'insufficient_credits', 'You have no credits left — buy a bundle to continue');
      }
      if (/idempotency|duplicate key/.test(error.message)) {
        return fail(res, 409, 'duplicate_request', 'This request was already processed');
      }
      throw new Error(error.message);
    }
    const row = Array.isArray(data) ? data[0] : data;
    reportId = row?.report_id;
    if (!reportId) throw new Error('spend rpc returned no report id');
  } catch (err) {
    console.error('spend failed:', err.message);
    return fail(res, 500, 'internal', 'Could not start report generation — no credit was spent');
  }

  // 2. Generate + deliver. Any failure before delivery refunds the credit
  //    exactly once (refund idempotency key is derived from the report id).
  try {
    const report = await svc.generateReportByVin(vin, reportType);
    if (!report.html) throw new Error('No HTML returned from provider');

    let emailed = false;
    let emailErr = null;
    try {
      await svc.sendReportEmail(user.email, vin, [{
        type: reportType,
        html: report.html,
        yearMakeModel: report.yearMakeModel || '',
      }]);
      emailed = true;
    } catch (e) {
      emailErr = e.message; // report exists — recoverable via admin resend, no refund
      console.error('report email failed:', e.message);
    }

    await supabase.from('reports').update({
      status: 'delivered',
      cheapvhr_report_id: report.id ? String(report.id) : null,
      year_make_model: report.yearMakeModel || null,
      last_error: emailErr,
      updated_at: new Date().toISOString(),
    }).eq('id', reportId);

    const { data: profile } = await supabase
      .from('profiles').select('credit_balance').eq('id', user.id).single();

    return res.status(200).json({
      success: true,
      reportId,
      yearMakeModel: report.yearMakeModel || '',
      emailed,
      balance: profile?.credit_balance ?? null,
    });
  } catch (err) {
    console.error(`CheapVHR ${reportType} failed for ${vin}:`, err.message);
    try {
      await supabase.rpc('refund_report_credit', {
        p_report_id: reportId,
        p_error: err.message,
      });
    } catch (refundErr) {
      console.error('refund rpc failed (manual review needed):', reportId, refundErr.message);
    }
    return fail(res, 502, 'report_failed',
      'Report generation failed — your credit has been refunded. Try again shortly or contact support@vinrecordhub.com');
  }
};
