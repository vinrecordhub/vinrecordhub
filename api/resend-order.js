// api/resend-order.js
// POST /api/resend-order   (admin only)
//
// Resends a customer's report(s). For each report type the order requires:
//   1. stored CheapVHR id        -> retrieve by id (FREE) and email
//   2. else found in /user/reports -> retrieve by id (FREE) and email
//   3. else                       -> generate by VIN (1 CREDIT) and email
// Already-generated reports are never regenerated.
//
// Body: { token, orderId, vin?, email?, dryRun? }
//   vin    — required only for legacy orders with no stored VIN
//   email  — optional override (defaults to the order's email)
//   dryRun — true: report what WOULD happen + cost, without spending credits
//            or sending email.

const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('./rate-limit');
const { sanitizeVin, sanitizeEmail } = require('./sanitize');
const svc = require('./report-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function summarizeOrder(o) {
  return {
    id: o.id,
    email: o.email,
    plan: o.plan,
    amount: o.amount,
    vin: o.vin || null,
    created_at: o.created_at,
    delivery_status: o.delivery_status || null,
    delivered_at: o.delivered_at || null,
    year_make_model: o.year_make_model || null,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://vinrecordhub.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit admin actions.
  const rl = rateLimit(req, { maxRequests: 20, windowMs: 60000 });
  if (rl.limited) return res.status(429).json({ error: 'Too many requests' });

  const { token, orderId, vin: vinOverride, email: emailOverride, dryRun } = req.body || {};

  // Auth — fixed delay on failure to slow brute force (mirrors admin-orders).
  if (!token || token !== process.env.ADMIN_TOKEN) {
    await new Promise(r => setTimeout(r, 1000));
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) return res.status(404).json({ error: 'Order not found' });

    const reportTypes = svc.reportTypesForPlan(order.plan);

    const vin = sanitizeVin(vinOverride || order.vin);
    if (!vin) {
      return res.status(400).json({
        error: 'This order has no stored VIN. Enter the customer\'s 17-character VIN to resend.',
        needsVin: true,
        order: summarizeOrder(order),
      });
    }

    const email = (emailOverride && sanitizeEmail(emailOverride)) || order.email;
    if (!email) return res.status(400).json({ error: 'Order has no email and no override provided' });

    // ── Plan each report: reuse stored id > look up existing > generate ──
    const steps = [];
    for (const type of reportTypes) {
      const storedId = order[svc.REPORT_ID_COLUMN[type]];
      if (storedId) {
        steps.push({ type, source: 'stored', id: storedId, charges: false });
        continue;
      }
      let existingId = null;
      try {
        existingId = await svc.findExistingReportId(vin, type);
      } catch (e) {
        // /user/reports lookup is best-effort; fall through to generate.
        console.error('findExistingReportId failed:', e.message);
      }
      if (existingId) steps.push({ type, source: 'existing', id: existingId, charges: false });
      else steps.push({ type, source: 'generate', id: null, charges: true });
    }

    let limits = null;
    try { limits = await svc.getLimits(); } catch (e) { console.error('getLimits failed:', e.message); }

    // ── Dry run: show the plan + cost, spend nothing ──
    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        order: summarizeOrder(order),
        vin,
        email,
        reportTypes,
        plan: steps.map(s => ({ type: s.type, source: s.source, willCharge: s.charges })),
        creditsNeeded: steps.filter(s => s.charges).length,
        limits,
      });
    }

    // ── Execute: fetch/generate each report, then email what we got ──
    const reports = [];
    const results = [];
    const idUpdates = {};

    for (const step of steps) {
      try {
        const r = step.source === 'generate'
          ? await svc.generateReportByVin(vin, step.type)
          : await svc.getReportById(step.type, step.id);
        if (!r || !r.html) throw new Error('No HTML returned');
        const id = r.id || step.id;
        if (id) idUpdates[svc.REPORT_ID_COLUMN[step.type]] = String(id);
        reports.push({ type: step.type, html: r.html, yearMakeModel: r.yearMakeModel });
        results.push({ type: step.type, source: step.source, status: 'ok', id: id || null });
      } catch (err) {
        results.push({ type: step.type, source: step.source, status: 'failed', error: err.message });
      }
    }

    let emailed = false;
    let emailError = null;
    if (reports.length) {
      try {
        await svc.sendReportEmail(email, vin, reports);
        emailed = true;
      } catch (err) {
        emailError = err.message;
      }
    }

    const failures = results.filter(r => r.status === 'failed').map(r => `${r.type}: ${r.error}`);
    if (emailError) failures.push(`email: ${emailError}`);
    const status = !reports.length ? 'failed' : (emailed && results.every(r => r.status === 'ok') ? 'delivered' : 'partial');

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        ...idUpdates,
        vin,
        year_make_model: reports[0]?.yearMakeModel || order.year_make_model || null,
        delivery_status: status,
        delivered_at: emailed ? new Date().toISOString() : order.delivered_at,
        last_resend_at: new Date().toISOString(),
        last_error: failures.join('; ') || null,
      })
      .eq('id', order.id);
    if (updateError) console.error('order update failed:', updateError.message);

    return res.status(emailed ? 200 : 502).json({
      success: emailed,
      status,
      emailed,
      email,
      vin,
      results,
      emailError,
      limits,
    });

  } catch (err) {
    console.error('resend-order error:', err.message);
    return res.status(500).json({ error: 'Resend failed', details: err.message });
  }
};
