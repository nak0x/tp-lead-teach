// Part IV - Zipping.
// Builds an in-memory zip buffer from a list of { name, buffer } entries.
const { ZipArchive } = require('archiver');

function zipImages(images) {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks = [];

    archive.on('data', chunk => chunks.push(chunk));
    archive.on('warning', err => {
      if (err.code !== 'ENOENT') {
        reject(err);
      }
    });
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    images.forEach(image => {
      archive.append(image.buffer, { name: image.name });
    });

    archive.finalize();
  });
}

module.exports = {
  zipImages
};
