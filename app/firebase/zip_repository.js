// Part I & II - Firebase Realtime Database store for completed zips.
//
// This is the persistent replacement for the in-memory job map in
// queue/job_store.js: once a zip has been successfully generated and uploaded
// to Google Cloud Storage, a record is written here so it survives a restart of
// the instance.
//
// Data is stored following the TP layout:
//   /<root>/<heureduzippage>/<filename> = {
//     path:       'zips/<uuid>.zip',            // GCS object path
//     url:        '/zip/download?tags=...',     // durable download link
//     filename:   'cats.zip',
//     tags, tagmode, createdAt (ISO), zippedAt (epoch ms)
//   }
//
// See https://firebase.google.com/docs/database/admin/save-data
const config = require('../config');
const { getDb } = require('./admin');

const root = config.firebaseDbRoot;

// A misconfigured / unreachable Realtime Database retries connecting forever
// instead of failing, which would otherwise hang the HTTP request. Cap every
// read so it degrades to "empty" rather than blocking the response.
const READ_TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firebase read timed out')), ms).unref()
    )
  ]);
}

// Same normalisation as the in-memory job store so lookups line up.
function normalizeKey(tags) {
  return String(tags || '')
    .trim()
    .toLowerCase();
}

// Human-facing zip file name derived from the tags (e.g. "cats, dogs" -> "cats_dogs.zip").
function filenameForTags(tags) {
  const safeName = String(tags || '')
    .trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return `${safeName || 'photos'}.zip`;
}

// Realtime Database keys may not contain '.', '#', '$', '[', ']' or '/'.
// Turn the filename into a safe leaf key (e.g. "cats.zip" -> "cats_zip").
function filenameKey(filename) {
  return String(filename).replace(/[.#$[\]/]+/g, '_');
}

// Part I - Persist a freshly generated zip.
// Resolves to the record written, or null when Firebase is disabled / fails
// (the caller treats persistence as best-effort and never crashes on it).
async function saveCompletedZip({ tags, tagmode, objectName }) {
  const db = getDb();
  if (!db) {
    return null;
  }

  const zippedAt = Date.now();
  const filename = filenameForTags(tags);
  const record = {
    path: objectName,
    url: `/zip/download?tags=${encodeURIComponent(tags)}`,
    filename,
    tags,
    tagmode: tagmode || 'all',
    createdAt: new Date(zippedAt).toISOString(),
    zippedAt
  };

  try {
    await withTimeout(
      db.ref(`${root}/${zippedAt}/${filenameKey(filename)}`).set(record),
      READ_TIMEOUT_MS
    );
    return record;
  } catch (error) {
    console.error('[firebase] failed to save zip record', error);
    return null;
  }
}

// Flatten the /<root> subtree ( { zippedAt: { filenameKey: record } } ) into a
// plain array of records.
function flatten(tree) {
  const records = [];
  if (!tree) {
    return records;
  }
  Object.keys(tree).forEach(timeKey => {
    const bucket = tree[timeKey];
    if (!bucket || typeof bucket !== 'object') {
      return;
    }
    Object.keys(bucket).forEach(fileKey => {
      records.push(bucket[fileKey]);
    });
  });
  return records;
}

// Part II - List every zip already generated, most recent first.
async function listZips() {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    const snapshot = await withTimeout(db.ref(root).once('value'), READ_TIMEOUT_MS);
    return flatten(snapshot.val()).sort(
      (a, b) => (b.zippedAt || 0) - (a.zippedAt || 0)
    );
  } catch (error) {
    console.error('[firebase] failed to list zips', error);
    return [];
  }
}

// Find the most recent stored zip for the given tags (used to keep downloads and
// the "zip ready" badge working across restarts). Returns the record or null.
async function findLatestByTags(tags) {
  const db = getDb();
  if (!db) {
    return null;
  }

  const wanted = normalizeKey(tags);
  const all = await listZips();
  return all.find(record => normalizeKey(record.tags) === wanted) || null;
}

module.exports = {
  saveCompletedZip,
  listZips,
  findLatestByTags
};
