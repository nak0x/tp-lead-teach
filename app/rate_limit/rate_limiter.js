// Part II & III - Token bucket rate limiter.
//
// Uses the `tokenbucket` library to implement the algorithm described in the
// TP. Each client (identified by IP) gets its own bucket:
//   - size (b)                  = config.rateLimitBucketSize        (15)
//   - tokensToAddPerInterval(r) = config.rateLimitRefillPerSecond   (1 / second)
//   - a request costs (cost)    = config.rateLimitRequestCost       (3)
//
// Two storage backends, chosen automatically:
//   * Redis (Part III) - the bucket state lives in Redis so every instance of
//     the API shares one limit per IP. We load the saved state, try to spend
//     the tokens, and save the new state back.
//   * In-memory map (Part II) - a per-process Map keyed by IP, used when Redis
//     is disabled or unreachable. State is kept in the bucket instances.
const TokenBucket = require('tokenbucket');
const config = require('../config');
const redisStore = require('./redis');

// Part II fallback: one long-lived bucket per IP, keyed by IP.
const localBuckets = new Map();

// Shared bucket options for a given IP. When `redisAdapter` is provided the
// bucket persists to Redis under a per-IP key.
function bucketOptions(ip, redisAdapter) {
  const options = {
    size: config.rateLimitBucketSize, // b
    tokensToAddPerInterval: config.rateLimitRefillPerSecond, // r
    interval: 'second'
  };
  if (redisAdapter) {
    options.redis = {
      bucketName: `ratelimit:${ip}`,
      redisClient: redisAdapter
    };
  }
  return options;
}

// Shape the outcome of a consume() call into something the middleware can turn
// into headers / a 429 response.
function toResult(allowed, bucket, cost) {
  const remaining = Math.max(0, Math.floor(bucket.tokensLeft));
  let retryAfter = 0;
  if (!allowed) {
    // Seconds until the bucket refills enough tokens for one more request.
    const missing = cost - bucket.tokensLeft;
    retryAfter = Math.max(1, Math.ceil(missing / config.rateLimitRefillPerSecond));
  }
  return { allowed, remaining, retryAfter, limit: config.rateLimitBucketSize };
}

// Part III path: spend `cost` tokens on the Redis-backed bucket for this IP.
// A fresh bucket per request; its state is loaded from / saved to Redis so it is
// shared across instances. Load -> try to spend -> save on success only (a
// dropped request must not consume tokens, matching the TP).
async function consumeWithRedis(adapter, ip, cost) {
  const bucket = new TokenBucket(bucketOptions(ip, adapter));
  await bucket.loadSaved();
  const allowed = bucket.removeTokensSync(cost);
  if (allowed) {
    await bucket.save();
  }
  return toResult(allowed, bucket, cost);
}

// Part II path: spend `cost` tokens on the in-memory bucket for this IP.
function consumeInMemory(ip, cost) {
  let bucket = localBuckets.get(ip);
  if (!bucket) {
    bucket = new TokenBucket(bucketOptions(ip, null));
    localBuckets.set(ip, bucket);
  }
  const allowed = bucket.removeTokensSync(cost);
  return toResult(allowed, bucket, cost);
}

// Try to consume `cost` tokens for `ip`. Prefers the shared Redis bucket (when
// the connection is ready) and transparently falls back to the in-memory bucket
// when Redis is off, still connecting, or errors on a command.
async function consume(ip, cost = config.rateLimitRequestCost) {
  if (redisStore.isEnabled()) {
    const adapter = redisStore.getAdapter();
    if (adapter) {
      try {
        return await consumeWithRedis(adapter, ip, cost);
      } catch (err) {
        console.error(
          '[ratelimit] Redis bucket failed, using in-memory fallback:',
          err && err.message
        );
      }
    }
  }
  return consumeInMemory(ip, cost);
}

// Exposed for tests: wipe the in-memory buckets between cases.
function _resetInMemory() {
  localBuckets.clear();
}

module.exports = {
  consume,
  _resetInMemory
};
