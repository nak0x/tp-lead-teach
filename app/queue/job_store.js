// Part IV - Job state.
// In a real setup the successful job state (key: tags, value: link/object name)
// would live in a database. Because the worker runs on the same instance as the
// API for this experiment, we just keep it in a static/global in-memory map.
const completedJobs = new Map();

function normalizeKey(tags) {
  return String(tags || '').trim().toLowerCase();
}

// Record that the zip for these tags is ready, storing the object name in GCS.
function markComplete(tags, objectName) {
  completedJobs.set(normalizeKey(tags), objectName);
}

// Returns the GCS object name for a finished job, or undefined if not ready yet.
function getObjectName(tags) {
  return completedJobs.get(normalizeKey(tags));
}

module.exports = {
  markComplete,
  getObjectName,
  completedJobs
};
