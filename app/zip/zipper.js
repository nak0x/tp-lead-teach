// Part IV - Zipping.
// Streams a list of { name, stream } entries into a zip archive. The archive is
// itself a Readable stream, so the caller can pipe it straight to storage
// without ever buffering the whole zip (or the source images) in memory.
const { ZipArchive } = require('archiver');

// `onEntry` (optional) is invoked each time an image has been streamed into the
// archive, which lets the caller report progress.
function createZipStream(images, { onEntry } = {}) {
  const archive = new ZipArchive({ zlib: { level: 9 } });

  archive.on('warning', err => {
    if (err.code !== 'ENOENT') {
      archive.emit('error', err);
    }
  });

  if (typeof onEntry === 'function') {
    archive.on('entry', onEntry);
  }

  images.forEach(image => {
    archive.append(image.stream, { name: image.name });
  });

  archive.finalize();

  return archive;
}

module.exports = {
  createZipStream
};
