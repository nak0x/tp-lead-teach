# express-app-testing-demo

This project is a simple express app for demonstrating testing and code coverage.
[Jest](https://facebook.github.io/jest/) and
[Supertest](https://github.com/visionmedia/supertest) are used for testing.
Jest is also used for mocking functions and measuring code coverage.
Note that this app only focuses on server-side JavaScript testing.


## Requirements

* Node.js - [https://nodejs.org/](https://nodejs.org/)


## Getting Started

* Clone the repo
* Install dependencies with `npm install`
* Run server with `npm start` and go here:
[http://localhost:3000/](http://localhost:3000/)


## Background zipping (queuing feature)

The app can zip the first 10 photos of a search result in the background using
Google Cloud Pub/Sub (queue) + Cloud Storage. Flow:

1. On a search result page, the **"Zip first 10 photos"** button calls
   `POST /zip?tags=...&tagmode=...`.
2. The endpoint (producer) publishes the tags onto the Pub/Sub topic.
3. The worker (`app/queue/consumer.js`, started from `app/server.js`) consumes
   the message, fetches the Flickr photos, zips the first 10, uploads the zip to
   the bucket, records the finished job in memory, then acknowledges the message.
4. Re-running the same search on `GET /` shows a **"Download zip"** button backed
   by a temporary (2-day) signed URL.

### Setup

1. Place the provided service account **JSON key somewhere on your file system,
   NOT inside this repository** (`.env` and `*.json` key files are git-ignored).
2. Copy `.env.example` to `.env` and fill it in:
   * `GOOGLE_APPLICATION_CREDENTIALS` — absolute path to the key file. The Google
     Cloud client libraries use this automatically to authenticate.
   * `PUBSUB_INDEX` — the number `i` you were attributed. The Pub/Sub topic and
     subscription are both named `ecni2-<i>`.
   * `GOOGLE_CLOUD_PROJECT` — `ecni2-2026` (default).
   * `STORAGE_BUCKET` — `ecni22026bucket` (default).
3. `npm start`.

On [render.com](https://render.com), upload the key as a secret file and set the
same environment variables directly in the UI.

Set `WORKER_ENABLED=false` to run the API without the background worker.


## Running Tests

* Run unit and integration tests: `npm test`
* Run end-to-end tests: `npm run test:e2e`

## Code Coverage Report

A new code coverage report is generated every time `npm test` runs.
Normally this coverage report is ignored by git.
This project includes it in source control so the coverage report can be viewed in the demo app:
[http://express-app-testing-demo.herokuapp.com/coverage/lcov-report/index.html](http://express-app-testing-demo.herokuapp.com/coverage/lcov-report/index.html)
