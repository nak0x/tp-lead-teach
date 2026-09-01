const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const producer = require('./queue/producer');
const jobStore = require('./queue/job_store');
const storage = require('./storage/storage');

function route(app) {
  app.get('/', async (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false,
      // Part V - whether a zip for these tags is already available (so the page
      // can show the download button straight away after a reload).
      zipReady: false
    };

    // if no input params are passed in then render the view with out querying the api
    if (!tags && !tagmode) {
      return res.render('index', ejsLocalVariables);
    }

    // validate query parameters
    if (!formValidator.hasValidFlickrAPIParams(tags, tagmode)) {
      ejsLocalVariables.invalidParameters = true;
      return res.render('index', ejsLocalVariables);
    }

    // Part V - if the zip for these tags is already available, let the view show
    // the (streamed) download button right away.
    ejsLocalVariables.zipReady = Boolean(jobStore.getObjectName(tags));

    // get photos from flickr public feed api
    return photoModel
      .getFlickrPhotos(tags, tagmode)
      .then(photos => {
        ejsLocalVariables.photos = photos;
        ejsLocalVariables.searchResults = true;
        return res.render('index', ejsLocalVariables);
      })
      .catch(error => {
        console.log('aspdfonaposd', error);
        return res.status(500).send({ error });
      });
  });

  // Part I & II - endpoint producer: queue a "zip these tags" job.
  // Called over AJAX from the search results page; returns JSON so the page can
  // start polling /zip/status instead of navigating away to the raw response.
  app.post('/zip', async (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode || 'all';

    if (!tags) {
      return res.status(400).send({ error: 'Missing "tags" query parameter' });
    }

    try {
      const messageId = await producer.publishZipJob(tags, tagmode);
      // Record the freshly queued job so /zip/status reports "queued" until the
      // worker picks it up.
      jobStore.markQueued(tags);
      return res.status(202).send({ status: 'queued', messageId, tags });
    } catch (error) {
      console.error('failed to publish zip job', error);
      return res.status(500).send({ error: 'Failed to queue zip job' });
    }
  });

  // Live status endpoint polled by the progress bar on the page.
  app.get('/zip/status', (req, res) => {
    const tags = req.query.tags;

    if (!tags) {
      return res.status(400).send({ error: 'Missing "tags" query parameter' });
    }

    const status = jobStore.getStatus(tags);
    return res.status(200).send({
      status: status.status,
      progress: status.progress,
      // Once ready, tell the client where to stream the file from.
      downloadUrl: status.status === 'done'
        ? `/zip/download?tags=${encodeURIComponent(tags)}`
        : null,
      error: status.error
    });
  });

  // Part V - stream the finished zip straight from Google Cloud Storage to the
  // client (Content-Disposition: attachment triggers the browser download).
  app.get('/zip/download', (req, res) => {
    const tags = req.query.tags;

    if (!tags) {
      return res.status(400).send({ error: 'Missing "tags" query parameter' });
    }

    const objectName = jobStore.getObjectName(tags);
    if (!objectName) {
      return res.status(404).send({ error: 'No zip available for these tags yet' });
    }

    const safeName = String(tags).trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    const filename = `${safeName || 'photos'}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const readStream = storage.createReadStream(objectName);
    readStream.on('error', error => {
      console.error('failed to stream zip', error);
      if (!res.headersSent) {
        res.status(500).send({ error: 'Failed to download zip' });
      } else {
        res.destroy(error);
      }
    });

    return readStream.pipe(res);
  });
}

module.exports = route;
