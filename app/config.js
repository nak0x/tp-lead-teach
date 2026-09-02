// Centralized configuration for the queuing / storage feature.
//
// Authentication to Google Cloud (Pub/Sub + Storage) is handled automatically
// by the client libraries through the GOOGLE_APPLICATION_CREDENTIALS
// environment variable, which must point to the absolute path of a service
// account JSON key file. That key file must NEVER be committed to the repo.
//
// See .env.example for the full list of variables.
require('dotenv').config();

// The number "i" attributed to you. The Pub/Sub topic and subscription are
// both named "ecni2-<i>". Set PUBSUB_INDEX in your .env file.
const pubsubIndex = process.env.PUBSUB_INDEX || '';
const resourceName = `ecni2-${pubsubIndex}`;

const isTest = process.env.NODE_ENV === 'test';

// --- Rate limiting (token bucket) -----------------------------------------
// Redis connection used to share the rate-limiter state across horizontally
// scaled instances (Part III of the TP). The password MUST come from an
// environment variable and never be committed (see .env / .env.example).
const redisUrl = process.env.REDIS_URL || '';
const redisHost = process.env.REDIS_HOST || '';
// Only turn the Redis-backed limiter on when we actually have connection
// details; otherwise the limiter degrades to a per-process in-memory map.
const redisConfigured = Boolean(redisUrl || redisHost);

// Firebase Realtime Database is used to persist the completed zips so they
// survive a restart of the instance. The Admin SDK authenticates with the exact
// same service account key as Pub/Sub / Storage (GOOGLE_APPLICATION_CREDENTIALS),
// so no extra credentials are needed.
const firebaseDatabaseUrl =
  process.env.FIREBASE_DATABASE_URL ||
  'https://ecni2-2026-default-rtdb.firebaseio.com';

module.exports = {
  // Google Cloud project that hosts the Pub/Sub topic and the bucket.
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'ecni2-2026',

  // Topic and subscription share the same "ecni2-<i>" name.
  topicName: process.env.PUBSUB_TOPIC || resourceName,
  subscriptionName: process.env.PUBSUB_SUBSCRIPTION || resourceName,

  // Google Cloud Storage bucket where the generated zips are stored.
  storageBucket: process.env.STORAGE_BUCKET || 'ecni22026bucket',

  // Whether to start the background worker on boot. Explicitly controllable via
  // WORKER_ENABLED; otherwise on everywhere except the test environment.
  workerEnabled: process.env.WORKER_ENABLED
    ? process.env.WORKER_ENABLED !== 'false'
    : !isTest,

  pubsubIndex,

  // --- Firebase (Realtime Database) ----------------------------------------

  // Realtime Database URL (Part I & II). From the TP guide.
  firebaseDatabaseUrl,

  // Root path segment ("votreprenom") under which completed zips are stored:
  //   /<firebaseDbRoot>/<heureduzippage>/<filename>
  firebaseDbRoot: process.env.FIREBASE_DB_ROOT || 'theo',

  // Turn the whole Firebase integration on/off. Off in the test environment so
  // the suite never needs a live database; otherwise on. Can be forced with
  // FIREBASE_ENABLED=true/false.
  firebaseEnabled: process.env.FIREBASE_ENABLED
    ? process.env.FIREBASE_ENABLED !== 'false'
    : !isTest,

  // --- Rate limiting (token bucket algorithm) ------------------------------
  // The zip generation endpoint is the most sensitive to abuse (a malicious
  // actor spamming the "generate zip" button), so we throttle it per client IP
  // with a token bucket. The three numbers below are the algorithm constants
  // from the TP:
  //   r    -> tokens refilled per second
  //   b    -> bucket size (also the starting/burst allowance)
  //   cost -> tokens consumed by a single request
  rateLimitRefillPerSecond: Number(process.env.RATE_LIMIT_REFILL_PER_SECOND) || 1, // r
  rateLimitBucketSize: Number(process.env.RATE_LIMIT_BUCKET_SIZE) || 15, // b
  rateLimitRequestCost: Number(process.env.RATE_LIMIT_REQUEST_COST) || 3, // cost

  // Turn rate limiting on/off. Off in the test environment (so the suite never
  // needs a Redis server and isn't throttled); on everywhere else. Force with
  // RATE_LIMIT_ENABLED=true/false.
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED
    ? process.env.RATE_LIMIT_ENABLED !== 'false'
    : !isTest,

  // Back the limiter with Redis so several instances share one bucket per IP
  // (Part III). Enabled automatically when REDIS_URL / REDIS_HOST are set and
  // we're not in tests; otherwise the limiter falls back to an in-memory map
  // (Part II). Force with RATE_LIMIT_REDIS_ENABLED=true/false.
  rateLimitRedisEnabled: process.env.RATE_LIMIT_REDIS_ENABLED
    ? process.env.RATE_LIMIT_REDIS_ENABLED !== 'false'
    : redisConfigured && !isTest,

  // Redis connection details (Part III). Prefer a full REDIS_URL; otherwise
  // assemble the connection from the individual pieces the TP provides.
  redisUrl,
  redisUsername: process.env.REDIS_USERNAME || 'default',
  redisPassword: process.env.REDIS_PASSWORD || '',
  redisHost,
  redisPort: Number(process.env.REDIS_PORT) || 6379
};
