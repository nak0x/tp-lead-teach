// Part II & III - Express middleware that rate limits by client IP.
//
// Applied to the sensitive zip-generation endpoint. It resolves the caller's
// IP, spends the configured token cost from that IP's bucket, and either lets
// the request through or answers 429 Too Many Requests.
const config = require('../config');
const { consume } = require('./rate_limiter');

// Resolve the client IP the way the TP suggests:
//   var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
// `x-forwarded-for` can be a comma-separated list "client, proxy1, proxy2"; the
// original client is the first entry.
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded || (req.socket && req.socket.remoteAddress) || null;
  return ip ? String(ip).split(',')[0].trim() : null;
}

// Express middleware. No-op when rate limiting is disabled (e.g. tests).
async function rateLimit(req, res, next) {
  if (!config.rateLimitEnabled) {
    return next();
  }

  const ip = clientIp(req);
  if (!ip) {
    // Can't identify the caller: fail open rather than block everyone.
    console.warn('[ratelimit] could not determine client IP; letting request through');
    return next();
  }

  try {
    const { allowed, remaining, retryAfter, limit } = await consume(ip);

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!allowed) {
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).send({
        error: 'Too many requests. Please slow down and try again shortly.',
        retryAfter
      });
    }

    return next();
  } catch (err) {
    // Never let a limiter failure take down the endpoint: fail open and log.
    console.error('[ratelimit] unexpected error, letting request through:', err);
    return next();
  }
}

module.exports = {
  rateLimit,
  clientIp
};
