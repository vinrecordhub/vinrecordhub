// api/check-code.js
// GET /api/check-code?code=XXXX-XXXX-XXXX-XXXX
// Returns whether a code is valid and unused

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://vinrecordhub.com');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const { data, error } = await supabase
      .from('redemption_codes')
      .select('id, code, is_used, vin_used, created_at')
      .eq('code', code.toUpperCase())
      .single();

    if (error || !data) {
      return res.status(404).json({ valid: false, error: 'Code not found' });
    }

    if (data.is_used) {
      return res.status(200).json({ valid: false, error: 'Code already used', vin_used: data.vin_used });
    }

    return res.status(200).json({ valid: true, code: data.code });

  } catch (err) {
    console.error('check-code error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
