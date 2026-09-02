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
const zipRepository = require('../firebase/zip_repository');

const pubsub = new PubSub({ projectId: config.projectId });

const MAX_PHOTOS = 10;

// Open a read stream on a remote image so it can be piped straight into the zip
// without ever holding the whole image in a Buffer.
// got is ESM-only, so it is required lazily (keeps CommonJS test runners happy).
function fetchImageStream(url) {
  const got = require('got');
  return got.default.stream(url);
}

// Part IV - Process one job: flickr -> zip -> GCS -> job store.
// Images are streamed straight into the zip and the zip is streamed straight to
// GCS, so fetching, zipping and uploading all happen at once. Progress is
// reported into the shared job store as we go so the status endpoint (and the
// progress bar on the page) can follow along:
//   5% queued picked up, 10% photos listed, 10-70% images zipped, 95% uploaded,
//   100% done.
async function processJob({ tags, tagmode }) {
  jobStore.setStatus(tags, 'processing', 5);

  const photos = await photoModel.getFlickrPhotos(tags, tagmode);
  const firstPhotos = photos.slice(0, MAX_PHOTOS);
  jobStore.setProgress(tags, 10);

  const total = firstPhotos.length || 1;
  let zipped = 0;

  // Each image is a live read stream fed straight into the archive.
  const images = firstPhotos.map((photo, index) => ({
    name: `photo_${index + 1}.jpg`,
    stream: fetchImageStream(photo.media.b)
  }));

  const zipStream = zipper.createZipStream(images, {
    // 'entry' fires once an image has been streamed into the archive, which
    // happens as the zip is piped to storage: spread that across 10% -> 70%.
    onEntry: () => {
      zipped += 1;
      jobStore.setProgress(tags, 10 + (zipped / total) * 60);
    }
  });

  // Pipe the archive straight to GCS - the images, the zip and the upload all
  // flow through as streams, so nothing is buffered end to end.
  const objectName = `zips/${crypto.randomUUID()}.zip`;
  await storage.uploadStream(objectName, zipStream, 'application/zip');
  jobStore.setProgress(tags, 95);

  // Part I - persist the finished zip in Firebase so it survives a restart of
  // the instance (stores the GCS object path + download link). Best-effort:
  // never fail an otherwise successful job on a database hiccup.
  await zipRepository.saveCompletedZip({ tags, tagmode, objectName });

  // Keep the live in-memory status too, so the polling status endpoint reports
  // "done" instantly without a database round-trip.
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
