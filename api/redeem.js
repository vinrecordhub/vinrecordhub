// api/redeem.js
// POST /api/redeem
// Validates a redemption code, generates the report from CheapVHR, emails customer.

const { createClient } = require('@supabase/supabase-js');
const svc = require('./report-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://vinrecordhub.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { code, vin, email, reportType } = req.body;

    // Default to carfax if not specified
    const type = (reportType === 'autocheck') ? 'autocheck' : 'carfax';

    // Validate inputs
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing redemption code' });
    }
    if (!vin || !/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim())) {
      return res.status(400).json({ error: 'Invalid VIN — must be 17 alphanumeric characters' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const cleanVin = vin.trim().toUpperCase();

    // Validate redemption code in Supabase
    const { data: codeData, error: codeError } = await supabase
      .from('redemption_codes')
      .select('id, is_used, vin_used')
      .eq('code', code.toUpperCase())
      .single();

    if (codeError || !codeData) {
      return res.status(404).json({ error: 'Invalid redemption code' });
    }
    if (codeData.is_used) {
      return res.status(400).json({
        error: 'Code already used',
        vin_used: codeData.vin_used,
      });
    }

    // Mark code as used IMMEDIATELY to prevent double-redemption
    const { error: updateError } = await supabase
      .from('redemption_codes')
      .update({
        is_used: true,
        vin_used: cleanVin,
        used_at: new Date().toISOString(),
      })
      .eq('id', codeData.id);

    if (updateError) throw updateError;

    // Generate report from CheapVHR (via Fixie static IP), with retry.
    const report = await svc.generateReportByVin(cleanVin, type);
    if (!report.html) {
      throw new Error('No HTML content in CheapVHR response');
    }

    // Email report to customer
    await svc.sendReportEmail(email.trim(), cleanVin, [{
      type,
      html: report.html,
      yearMakeModel: report.yearMakeModel || '',
    }]);

    return res.status(200).json({
      success: true,
      yearMakeModel: report.yearMakeModel,
      reportId: report.id,
    });

  } catch (err) {
    console.error('redeem error:', err.message);
    return res.status(500).json({
      error: 'Failed to generate report. Contact support@vinrecordhub.com',
    });
  }
};
