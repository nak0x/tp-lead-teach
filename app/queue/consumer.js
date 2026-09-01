// Part III & IV - Worker.
// Listens for zip jobs on the Pub/Sub subscription, fetches the matching Flickr
// photos, zips the first 10, uploads the zip to Google Cloud Storage and records
// the completed job. The @google-cloud/pubsub client authenticates automatically
// via GOOGLE_APPLICATION_CREDENTIALS.
const crypto = require('crypto');
const { PubSub } = require('@google-cloud/pubsub');

const config = require('../config');
const photoModel = require('../photo_model');
const zipper = require('../zip/zipper');
const storage = require('../storage/storage');
const jobStore = require('./job_store');

const pubsub = new PubSub({ projectId: config.projectId });

const MAX_PHOTOS = 10;

// Download a single remote image into a Buffer.
// got is ESM-only, so it is required lazily (keeps CommonJS test runners happy).
function fetchImageBuffer(url) {
  const got = require('got');
  return got.default.get(url, { responseType: 'buffer' }).then(response => response.body);
}

// Part IV - Process one job: flickr -> zip -> GCS -> job store.
// Progress is reported into the shared job store as we go so the status endpoint
// (and the progress bar on the page) can follow along:
//   5% queued picked up, 10-70% fetching images, 75% zipping, 85-95% uploading,
//   100% done.
async function processJob({ tags, tagmode }) {
  jobStore.setStatus(tags, 'processing', 5);

  const photos = await photoModel.getFlickrPhotos(tags, tagmode);
  const firstPhotos = photos.slice(0, MAX_PHOTOS);
  jobStore.setProgress(tags, 10);

  const total = firstPhotos.length || 1;
  let fetched = 0;

  const images = await Promise.all(
    firstPhotos.map(async (photo, index) => {
      const buffer = await fetchImageBuffer(photo.media.b);
      fetched += 1;
      // Image fetching spans 10% -> 70% of the overall progress.
      jobStore.setProgress(tags, 10 + (fetched / total) * 60);
      return { name: `photo_${index + 1}.jpg`, buffer };
    })
  );

  jobStore.setProgress(tags, 75);
  const zipBuffer = await zipper.zipImages(images);
  jobStore.setProgress(tags, 85);

  const objectName = `zips/${crypto.randomUUID()}.zip`;
  await storage.uploadBuffer(objectName, zipBuffer, 'application/zip');
  jobStore.setProgress(tags, 95);

  // No DB in this experiment: keep the successful state in a global store.
  jobStore.markComplete(tags, objectName);

  return objectName;
}

// Pub/Sub message handler: process then ack (nack on failure so it is retried).
async function handleMessage(message) {
  let payload;
  try {
    payload = JSON.parse(message.data.toString());
    console.log(`[worker] received job for tags "${payload.tags}"`);

    const objectName = await processJob(payload);

    console.log(`[worker] job done for tags "${payload.tags}" -> ${objectName}`);
    message.ack();
  } catch (error) {
    console.error('[worker] failed to process job', error);
    if (payload && payload.tags) {
      jobStore.markError(payload.tags, error && error.message);
    }
    message.nack();
  }
}

// Part III - Start listening for messages on the subscription.
function startWorker() {
  const subscription = pubsub.subscription(config.subscriptionName);

  subscription.on('message', handleMessage);
  subscription.on('error', error => {
    console.error('[worker] subscription error', error);
  });

  console.log(`[worker] listening on subscription "${config.subscriptionName}"`);
  return subscription;
}

module.exports = {
  startWorker,
  handleMessage,
  processJob
};
