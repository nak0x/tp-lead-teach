#!/bin/sh
set -e

# Materialize the Google service account key from an environment variable.
#
# Some deploy targets (e.g. Coolify) can only inject environment variables, not
# mounted files. But the Google Cloud client libraries authenticate through
# GOOGLE_APPLICATION_CREDENTIALS, which must be a *path* to a JSON key file.
#
# So: pass the key's contents in GOOGLE_APPLICATION_CREDENTIALS_JSON and this
# script writes them to a real file, then points GOOGLE_APPLICATION_CREDENTIALS
# at it before starting the app.

# Where the key file is written (defaults to the project root). Respect an
# explicit GOOGLE_APPLICATION_CREDENTIALS path if the operator set one.
CRED_PATH="${GOOGLE_APPLICATION_CREDENTIALS:-/key.json}"

if [ -n "$GOOGLE_APPLICATION_CREDENTIALS_JSON" ]; then
  case "$GOOGLE_APPLICATION_CREDENTIALS_JSON" in
    # Raw JSON pasted directly into the env var.
    \{*) printf '%s' "$GOOGLE_APPLICATION_CREDENTIALS_JSON" >"$CRED_PATH" ;;
    # Otherwise assume base64-encoded JSON (safest for one-line env values).
    *)   printf '%s' "$GOOGLE_APPLICATION_CREDENTIALS_JSON" | base64 -d >"$CRED_PATH" ;;
  esac
  chmod 600 "$CRED_PATH"
  export GOOGLE_APPLICATION_CREDENTIALS="$CRED_PATH"
  echo "[entrypoint] wrote service account key to $CRED_PATH"
fi

exec "$@"
