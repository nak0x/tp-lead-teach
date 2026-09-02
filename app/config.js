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

  // --- Firebase (Realtime Database + Auth) ---------------------------------

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

  // Require a verified Firebase ID token on the mutating zip endpoints (Part
  // III). Defaults to on wherever Firebase is enabled; force with
  // AUTH_REQUIRED=true/false.
  authRequired: process.env.AUTH_REQUIRED
    ? process.env.AUTH_REQUIRED !== 'false'
    : !isTest
};
