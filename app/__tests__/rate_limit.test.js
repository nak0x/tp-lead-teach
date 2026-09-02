// Tests for the token-bucket rate limiter (Memory Store TP).
//
// These exercise the in-memory path (Redis is disabled under NODE_ENV=test),
// which runs the exact same tokenbucket algorithm the Redis path uses.
const config = require('../config');
const { consume, _resetInMemory } = require('../rate_limit/rate_limiter');
const { rateLimit, clientIp } = require('../rate_limit/middleware');

describe('rate limiter - consume()', () => {
  beforeEach(() => {
    _resetInMemory();
  });

  test('lets a burst through up to the bucket size, then drops', async () => {
    // b=15, cost=3 -> exactly 5 requests fit in the initial bucket.
    const allowed = [];
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      const result = await consume('10.0.0.1');
      allowed.push(result.allowed);
    }
    expect(allowed).toEqual([true, true, true, true, true, false]);
  });

  test('reports remaining tokens and a retry delay when throttled', async () => {
    let last;
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      last = await consume('10.0.0.2');
    }
    // Fifth request drains the bucket to 0 and is still allowed.
    expect(last).toMatchObject({ allowed: true, remaining: 0, limit: 15 });

    const blocked = await consume('10.0.0.2');
    expect(blocked.allowed).toBe(false);
    // Needs 3 tokens back at 1/second -> 3 seconds.
    expect(blocked.retryAfter).toBe(3);
  });

  test('tracks each IP independently', async () => {
    // Drain the first IP completely.
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      await consume('1.1.1.1');
    }
    // A different IP still has a full bucket.
    const other = await consume('2.2.2.2');
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(12);
  });

  test('refills over time at r tokens per second', async () => {
    jest.useFakeTimers();
    const start = Date.parse('2026-01-01T00:00:00Z');
    jest.setSystemTime(start);

    // Drain the bucket (5 * cost 3 = 15).
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await consume('3.3.3.3');
    }
    expect((await consume('3.3.3.3')).allowed).toBe(false);

    // Three seconds later, 3 tokens have been refilled -> one more request fits.
    jest.setSystemTime(start + 3000);
    expect((await consume('3.3.3.3')).allowed).toBe(true);
    // ...and the bucket is empty again.
    expect((await consume('3.3.3.3')).allowed).toBe(false);

    jest.useRealTimers();
  });
});

describe('rate limiter - clientIp()', () => {
  test('prefers x-forwarded-for and takes the first entry', () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' },
      socket: { remoteAddress: '10.0.0.9' }
    };
    expect(clientIp(req)).toBe('203.0.113.5');
  });

  test('falls back to the socket remote address', () => {
    const req = { headers: {}, socket: { remoteAddress: '10.0.0.9' } };
    expect(clientIp(req)).toBe('10.0.0.9');
  });

  test('returns null when the IP cannot be determined', () => {
    const req = { headers: {}, socket: {} };
    expect(clientIp(req)).toBeNull();
  });
});

describe('rate limiter - middleware', () => {
  // The middleware short-circuits when disabled (the default in tests), so flip
  // the shared config flag on for these cases and restore it afterwards.
  let previousEnabled;

  beforeEach(() => {
    previousEnabled = config.rateLimitEnabled;
    config.rateLimitEnabled = true;
    _resetInMemory();
  });

  afterEach(() => {
    config.rateLimitEnabled = previousEnabled;
  });

  function fakeRes() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(name, value) {
        this.headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(payload) {
        this.body = payload;
        return this;
      }
    };
  }

  function reqFrom(ip) {
    return { headers: { 'x-forwarded-for': ip }, socket: {} };
  }

  test('calls next() and sets rate-limit headers while under the limit', async () => {
    const res = fakeRes();
    const next = jest.fn();
    await rateLimit(reqFrom('9.9.9.9'), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers['X-RateLimit-Limit']).toBe(15);
    expect(res.headers['X-RateLimit-Remaining']).toBe(12);
  });

  test('responds 429 with Retry-After once the bucket is empty', async () => {
    const ip = '8.8.8.8';
    // Five allowed requests drain the bucket.
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await rateLimit(reqFrom(ip), fakeRes(), jest.fn());
    }

    const res = fakeRes();
    const next = jest.fn();
    await rateLimit(reqFrom(ip), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe(3);
    expect(res.body).toMatchObject({ retryAfter: 3 });
    expect(res.body.error).toMatch(/too many requests/i);
  });

  test('is a no-op passthrough when rate limiting is disabled', async () => {
    config.rateLimitEnabled = false;
    const res = fakeRes();
    const next = jest.fn();
    await rateLimit(reqFrom('7.7.7.7'), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers['X-RateLimit-Limit']).toBeUndefined();
  });
});
