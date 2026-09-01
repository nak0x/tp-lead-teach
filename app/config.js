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
    : process.env.NODE_ENV !== 'test',

  pubsubIndex
};
