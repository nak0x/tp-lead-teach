// Google Cloud Storage helpers (upload + signed download URL).
// Authenticates automatically via GOOGLE_APPLICATION_CREDENTIALS.
const { Storage } = require('@google-cloud/storage');
const moment = require('moment');
const config = require('../config');

const storage = new Storage({ projectId: config.projectId });

// Part IV - Store the zip in GCS with the given object name.
// The source is piped straight into the GCS write stream, so nothing is
// buffered in memory on the way up.
function uploadStream(objectName, source, contentType) {
  const file = storage.bucket(config.storageBucket).file(objectName);

  const stream = file.createWriteStream({
    metadata: {
      contentType,
      cacheControl: 'private'
    },
    resumable: false
  });

  return new Promise((resolve, reject) => {
    source.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', () => resolve('Ok'));

    source.pipe(stream);
  });
}

// Part V - Open a read stream on the stored zip so the API can pipe it straight
// to the client (streamed download) without buffering the whole file in memory.
function createReadStream(objectName) {
  return storage
    .bucket(config.storageBucket)
    .file(objectName)
    .createReadStream();
}

// Part V - Generate a temporary (2 days) signed download URL for the zip.
async function getDownloadUrl(objectName) {
  const options = {
    action: 'read',
    expires: moment().add(2, 'days').unix() * 1000
  };

  const signedUrls = await storage
    .bucket(config.storageBucket)
    .file(objectName)
    .getSignedUrl(options);

  return signedUrls[0];
}

module.exports = {
  uploadStream,
  createReadStream,
  getDownloadUrl
};
