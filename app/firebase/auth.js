// Part III - Server-side Firebase authentication.
//
// The web client signs in with Google (Firebase Web SDK) and sends the
// resulting ID token as an `Authorization: Bearer <token>` header. This
// middleware verifies that token with the Admin SDK so the mutating zip
// endpoints can only be used by a signed-in user.
const config = require('../config');
const { getAuth } = require('./admin');

// Pull a bearer token out of the Authorization header, if present.
function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// Express middleware: require a valid Firebase ID token.
// When auth is disabled (e.g. the test environment) it is a no-op passthrough.
async function requireAuth(req, res, next) {
  if (!config.authRequired) {
    return next();
  }

  const auth = getAuth();
  if (!auth) {
    // Auth was requested but the Admin SDK is not available.
    return res.status(503).send({ error: 'Authentication is not available' });
  }

  const token = bearerToken(req);
  if (!token) {
    return res.status(401).send({ error: 'Missing authentication token' });
  }

  try {
    req.user = await auth.verifyIdToken(token);
    return next();
  } catch (error) {
    console.error('[firebase] token verification failed', error && error.message);
    return res.status(401).send({ error: 'Invalid authentication token' });
  }
}

module.exports = {
  requireAuth
};
