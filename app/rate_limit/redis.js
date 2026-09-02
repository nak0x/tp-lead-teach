// Part III - Redis connection for the rate limiter.
//
// The `tokenbucket` library persists each bucket's state (lastFill +
// tokensLeft) in Redis so that several horizontally scaled instances share a
// single limit per IP. The catch: `tokenbucket` was written for the old
// callback-based node_redis client and calls `redisClient.mset(...cb)` /
// `redisClient.mget(...cb)`, whereas the modern `redis` v6 client is
// promise-based and only exposes `mSet` / `mGet`. This module:
//   1. connects a modern client the way the TP documents (createClient with
//      username / password / socket), and
//   2. wraps it in a tiny callback adapter exposing `mset` / `mget` so the
//      library can talk to it unchanged.
//
// Everything is lazy and guarded by config so the test suite (and any
// environment without Redis) never opens a socket. If the connection fails we
// log once and return null; the rate limiter then degrades to its in-memory
// map instead of crashing requests.
const config = require('../config');

let client = null;
let adapter = null;
// A single connection attempt shared by every caller.
let connectPromise = null;
// Set once a connection attempt has failed, so we stop trying and stay on the
// in-memory limiter (no reconnect storm) until the process restarts.
let unavailable = false;

// Build the modern redis v6 client from configuration. Mirrors the TP snippet:
//   const client = createClient({ username, password, socket: { host, port } });
// with two hardening tweaks so an unreachable Redis fails fast and falls back
// to the in-memory limiter instead of hanging requests or reconnecting forever:
//   - connectTimeout: give up on a dead host after 5s.
//   - reconnectStrategy: stop after a few attempts (returning an Error rejects
//     the pending connect() and ends the retry loop).
function socketOptions(extra) {
  return Object.assign(
    {
      connectTimeout: 5000,
      reconnectStrategy: retries =>
        retries > 2 ? new Error('redis unreachable') : Math.min(retries * 200, 800)
    },
    extra
  );
}

function createClient() {
  const { createClient } = require('redis');
  if (config.redisUrl) {
    return createClient({ url: config.redisUrl, socket: socketOptions() });
  }
  return createClient({
    username: config.redisUsername,
    password: config.redisPassword,
    socket: socketOptions({ host: config.redisHost, port: config.redisPort })
  });
}

// Adapt the promise-based v6 client to the callback API that `tokenbucket`
// expects. Only the two commands the library uses are bridged.
function buildAdapter(c) {
  return {
    // tokenbucket calls: mset('k1', v1, 'k2', v2, cb)
    mset(...args) {
      const cb = args.pop();
      const pairs = [];
      for (let i = 0; i < args.length; i += 2) {
        pairs.push([String(args[i]), String(args[i + 1])]);
      }
      c.mSet(pairs).then(() => cb(null, 'OK')).catch(cb);
    },
    // tokenbucket calls: mget('k1', 'k2', cb) -> cb(null, [v1, v2])
    mget(...args) {
      const cb = args.pop();
      c.mGet(args.map(String)).then(reply => cb(null, reply)).catch(cb);
    }
  };
}

// Whether the Redis-backed limiter is turned on (needs both the feature flag
// and connection details).
function isEnabled() {
  return config.rateLimitRedisEnabled;
}

// Start (or reuse) the connection. Resolves to the callback adapter once ready,
// or null when Redis is disabled/unreachable. Meant to be called once at boot
// as a warm-up; per-request code uses the synchronous getAdapter() instead so a
// slow or dead connection never blocks a request.
function connect() {
  if (!isEnabled() || unavailable) {
    return Promise.resolve(adapter);
  }
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    try {
      client = createClient();
      // Without a listener a connection error would bubble up as an unhandled
      // exception and take the process down.
      client.on('error', err => {
        console.error('[ratelimit] redis client error:', err && err.message);
      });
      await client.connect();
      adapter = buildAdapter(client);
      console.log('[ratelimit] connected to Redis for shared rate limiting');
      return adapter;
    } catch (err) {
      console.error(
        '[ratelimit] could not connect to Redis, using in-memory limiter:',
        err && err.message
      );
      unavailable = true;
      if (client) {
        // Best-effort cleanup of the half-open client so it stops reconnecting.
        client.quit().catch(() => {});
        client = null;
      }
      return null;
    }
  })();

  return connectPromise;
}

// Synchronous accessor used on the request path: the ready adapter, or null
// when Redis isn't connected yet (or is unavailable). The first call also kicks
// off the connection in the background, so the limiter still reaches Redis even
// if the boot-time warm-up was skipped. Never blocks the request.
function getAdapter() {
  if (adapter) {
    return adapter;
  }
  if (isEnabled() && !unavailable && !connectPromise) {
    connect().catch(() => {});
  }
  return null;
}

// Close the connection (used for graceful shutdown / tests).
async function disconnect() {
  if (client) {
    try {
      await client.quit();
    } catch (err) {
      // ignore - we're tearing down anyway
    }
  }
  client = null;
  adapter = null;
  connectPromise = null;
  unavailable = false;
}

module.exports = {
  isEnabled,
  connect,
  getAdapter,
  disconnect
};
