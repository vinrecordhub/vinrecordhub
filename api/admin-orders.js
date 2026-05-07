// api/admin-orders.js
// GET /api/admin-orders?token=YOUR_ADMIN_TOKEN
// Secure endpoint — returns all orders for admin panel
// Token is checked server-side, Supabase service key never exposed to browser

const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('./rate-limit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit admin endpoint — 20 requests per minute
  const rl = rateLimit(req, { maxRequests: 20, windowMs: 60000 });
  if (rl.limited) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Check admin token
  const token = req.query.token;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    // Add delay to prevent brute force
    await new Promise(r => setTimeout(r, 1000));
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch all orders newest first
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate stats
    const total = orders.length;
    const revenue = orders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0);
    const avg = total > 0 ? revenue / total : 0;

    const today = new Date().toDateString();
    const todayOrders = orders.filter(o =>
      new Date(o.created_at).toDateString() === today
    );
    const todayRevenue = todayOrders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0);

    // This week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekOrders = orders.filter(o => new Date(o.created_at) > weekAgo);
    const weekRevenue = weekOrders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0);

    return res.status(200).json({
      orders,
      stats: {
        total,
        revenue: revenue.toFixed(2),
        avg: avg.toFixed(2),
        todayCount: todayOrders.length,
        todayRevenue: todayRevenue.toFixed(2),
        weekCount: weekOrders.length,
        weekRevenue: weekRevenue.toFixed(2),
      }
    });

  } catch (err) {
    console.error('admin-orders error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
};
