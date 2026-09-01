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
      // Part V - download link for an already-zipped result (if any).
      zipDownloadUrl: ''
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

    // Part V - if the zip for these tags is already available, generate a
    // temporary download link and expose it to the view.
    const completedObjectName = jobStore.getObjectName(tags);
    if (completedObjectName) {
      try {
        ejsLocalVariables.zipDownloadUrl = await storage.getDownloadUrl(completedObjectName);
      } catch (error) {
        console.error('failed to generate signed url', error);
      }
    }

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
  app.post('/zip', async (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode || 'all';

    if (!tags) {
      return res.status(400).send({ error: 'Missing "tags" query parameter' });
    }

    try {
      const messageId = await producer.publishZipJob(tags, tagmode);
      return res.status(202).send({ status: 'queued', messageId, tags });
    } catch (error) {
      console.error('failed to publish zip job', error);
      return res.status(500).send({ error: 'Failed to queue zip job' });
    }
  });
}

module.exports = route;
