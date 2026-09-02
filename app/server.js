// Load environment variables (GOOGLE_APPLICATION_CREDENTIALS, PUBSUB_INDEX, ...)
// as early as possible so every module below sees them.
require('dotenv').config();

const express = require('express');
const favicon = require('serve-favicon');
const path = require('path');

const config = require('./config');

// The API and the queue worker share this single instance. The Google Cloud
// Pub/Sub client can surface publish/subscribe failures (e.g. a transient auth
// error) as unhandled rejections from its internal batch flush, which would
// otherwise crash the whole process. Log and keep serving instead.
process.on('unhandledRejection', reason => {
  console.error('[server] unhandled rejection:', reason);
});

const app = express();

// public assets
app.use(express.static(path.join(__dirname, 'public')));
app.use(favicon(path.join(__dirname, 'public/images', 'favicon.ico')));
app.use('/coverage', express.static(path.join(__dirname, '..', 'coverage')));

// ejs for view templates
app.engine('.html', require('ejs').__express);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

// load route
require('./route')(app);

// server
const port = process.env.PORT || 3000;
app.server = app.listen(port);
console.log(`listening on port ${port}`);

// Part III - start listening for zip jobs on the queue. The worker consuming the
// queue runs on the same instance as the API. It is required lazily so its
// (ESM / Google Cloud) dependencies are only loaded when the worker is enabled.
if (config.workerEnabled) {
  require('./queue/consumer').startWorker();
}

// Memory Store TP - warm up the shared rate-limiter Redis connection at boot so
// the first throttled request doesn't pay the connection latency, and so an
// unreachable Redis fails over to the in-memory limiter early. Non-blocking and
// a no-op when Redis-backed limiting is disabled (e.g. the test environment).
require('./rate_limit/redis').connect().catch(() => {});

module.exports = app;
