// api/rate-limit.js
// Simple in-memory rate limiter for API endpoints
// Limits: 10 requests per IP per minute for payment endpoints

const rateLimitMap = new Map();

function rateLimit(req, options = {}) {
  const {
    maxRequests = 10,
    windowMs = 60 * 1000, // 1 minute
  } = options;

  // Get IP from Vercel headers
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';

  const key = `${ip}:${req.url}`;
  const now = Date.now();

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: maxRequests - 1 };
  }

  const record = rateLimitMap.get(key);

  // Reset window if expired
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
    return { limited: false, remaining: maxRequests - 1 };
  }

  record.count++;

  if (record.count > maxRequests) {
    return {
      limited: true,
      remaining: 0,
      resetIn: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  return { limited: false, remaining: maxRequests - record.count };
}

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = rateLimit;
