// Part IV - Job state.
// In a real setup the job state (key: tags, value: status/progress/object name)
// would live in a database. Because the worker runs on the same instance as the
// API for this experiment, we just keep it in a static/global in-memory map so
// the producer, the worker and the status endpoint all share it.
//
// Each entry looks like:
//   { status: 'queued' | 'processing' | 'done' | 'error',
//     progress: 0..100,
//     objectName: string | null,
//     error: string | null }
const jobs = new Map();

function normalizeKey(tags) {
  return String(tags || '').trim().toLowerCase();
}

function clampProgress(progress) {
  const value = Number(progress);
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ensureEntry(key) {
  let entry = jobs.get(key);
  if (!entry) {
    entry = { status: 'queued', progress: 0, objectName: null, error: null };
    jobs.set(key, entry);
  }
  return entry;
}

// Mark a job as queued (freshly published, not picked up by the worker yet).
// Resets any previous state for these tags so re-zipping starts from scratch.
function markQueued(tags) {
  jobs.set(normalizeKey(tags), {
    status: 'queued',
    progress: 0,
    objectName: null,
    error: null
  });
}

// Update the coarse status of a job, optionally setting its progress.
function setStatus(tags, status, progress) {
  const entry = ensureEntry(normalizeKey(tags));
  entry.status = status;
  if (progress !== undefined) {
    entry.progress = clampProgress(progress);
  }
}

// Update only the progress (0..100) of an in-flight job.
function setProgress(tags, progress) {
  const entry = ensureEntry(normalizeKey(tags));
  entry.progress = clampProgress(progress);
}

// Record that the zip for these tags is ready, storing the object name in GCS.
function markComplete(tags, objectName) {
  jobs.set(normalizeKey(tags), {
    status: 'done',
    progress: 100,
    objectName,
    error: null
  });
}

// Record that a job failed so the client can stop polling and show the error.
function markError(tags, message) {
  const entry = ensureEntry(normalizeKey(tags));
  entry.status = 'error';
  entry.error = message || 'Unknown error';
}

// Returns the GCS object name for a finished job, or undefined if not ready yet.
function getObjectName(tags) {
  const entry = jobs.get(normalizeKey(tags));
  return entry && entry.status === 'done' ? entry.objectName : undefined;
}

// Returns the full status for these tags. When nothing is known yet we report
// an "idle" status so the client can tell "never queued" from "queued".
function getStatus(tags) {
  const entry = jobs.get(normalizeKey(tags));
  if (!entry) {
    return { status: 'idle', progress: 0, objectName: null, error: null };
  }
  return {
    status: entry.status,
    progress: entry.progress,
    objectName: entry.objectName,
    error: entry.error
  };
}

module.exports = {
  markQueued,
  setStatus,
  setProgress,
  markComplete,
  markError,
  getObjectName,
  getStatus,
  jobs
};
