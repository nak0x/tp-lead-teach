// Firebase Admin SDK bootstrap (firebase-admin v14, modular API).
//
// The Admin SDK authenticates exactly like the Pub/Sub / Storage clients: it
// reads the service account key pointed to by GOOGLE_APPLICATION_CREDENTIALS
// (applicationDefault()). No extra credentials are required.
//
// Everything is initialised lazily and guarded by config.firebaseEnabled so
// that the test suite (and any environment without a service account) never
// touches a live database.
const config = require('../config');

let app = null;
let initialized = false;

// Initialise the singleton Admin app the first time it is needed. Returns null
// when Firebase is disabled or when initialisation fails (we log and degrade
// gracefully rather than crash the request/worker).
function getApp() {
  if (!config.firebaseEnabled) {
    return null;
  }
  if (initialized) {
    return app;
  }
  initialized = true;

  try {
    // Required lazily so the dependency is only loaded when Firebase is enabled
    // (keeps the CommonJS test runner from pulling in the whole Admin SDK).
    const { initializeApp, getApps, getApp: getExistingApp, applicationDefault } =
      require('firebase-admin/app');

    // Reuse an app if one was already created elsewhere in the process.
    app = getApps().length
      ? getExistingApp()
      : initializeApp({
          credential: applicationDefault(),
          databaseURL: config.firebaseDatabaseUrl
        });
  } catch (error) {
    console.error('[firebase] failed to initialise Admin SDK:', error);
    app = null;
  }

  return app;
}

// Realtime Database handle, or null when Firebase is unavailable.
function getDb() {
  const current = getApp();
  if (!current) {
    return null;
  }
  const { getDatabase } = require('firebase-admin/database');
  return getDatabase(current);
}

// Auth handle (used to verify web ID tokens), or null when unavailable.
function getAuth() {
  const current = getApp();
  if (!current) {
    return null;
  }
  const { getAuth: getAdminAuth } = require('firebase-admin/auth');
  return getAdminAuth(current);
}

module.exports = {
  getApp,
  getDb,
  getAuth,
  enabled: () => config.firebaseEnabled
};
