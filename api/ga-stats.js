// api/ga-stats.js — Returns analytics built from your own Supabase order data
// No Google account needed — uses data you already have

const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('./rate-limit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rl = rateLimit(req, { maxRequests: 20, windowMs: 60000 });
  if (rl.limited) return res.status(429).json({ error: 'Too many requests' });

  const { token, days } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    await new Promise(r => setTimeout(r, 1000));
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dayRange = parseInt(days) || 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dayRange);
    const cutoffStr = cutoff.toISOString();

    // All orders
    const { data: allOrders } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    // Orders in range
    const { data: rangeOrders } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', cutoffStr)
      .order('created_at', { ascending: true });

    // Previous period for comparison
    const prevCutoff = new Date(cutoff);
    prevCutoff.setDate(prevCutoff.getDate() - dayRange);
    const { data: prevOrders } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', prevCutoff.toISOString())
      .lt('created_at', cutoffStr);

    // Stats for range
    const revenue = rangeOrders.reduce((s, o) => s + parseFloat(o.amount || 0), 0);
    const prevRevenue = prevOrders.reduce((s, o) => s + parseFloat(o.amount || 0), 0);

    // Revenue by day
    const byDay = {};
    rangeOrders.forEach(o => {
      const day = o.created_at.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + parseFloat(o.amount || 0);
    });
    const dailyRevenue = Object.entries(byDay).map(([date, revenue]) => ({ date, revenue: parseFloat(revenue.toFixed(2)) }));

    // By plan
    const byPlan = {};
    rangeOrders.forEach(o => {
      const plan = o.plan || 'carfax';
      byPlan[plan] = (byPlan[plan] || 0) + 1;
    });

    // Top emails (repeat customers)
    const byEmail = {};
    allOrders.forEach(o => { byEmail[o.email] = (byEmail[o.email] || 0) + 1; });
    const repeatCustomers = Object.entries(byEmail)
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([email, count]) => ({ email: email.replace(/(.{2}).*(@.*)/, '$1***$2'), count }));

    // Delta calculations
    const revDelta = prevRevenue > 0 ? (((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : null;
    const countDelta = prevOrders.length > 0 ? (((rangeOrders.length - prevOrders.length) / prevOrders.length) * 100).toFixed(1) : null;

    return res.status(200).json({
      period: { days: dayRange, orders: rangeOrders.length, revenue: revenue.toFixed(2) },
      prev: { orders: prevOrders.length, revenue: prevRevenue.toFixed(2) },
      deltas: { revenue: revDelta, orders: countDelta },
      dailyRevenue,
      byPlan,
      repeatCustomers,
      avgOrder: rangeOrders.length > 0 ? (revenue / rangeOrders.length).toFixed(2) : '0.00',
      allTimeOrders: allOrders.length,
      allTimeRevenue: allOrders.reduce((s, o) => s + parseFloat(o.amount || 0), 0).toFixed(2),
    });

  } catch (err) {
    console.error('analytics error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
