// Part II - Producer.
// Publishes a "zip these tags" job onto the Pub/Sub topic. The @google-cloud/pubsub
// client authenticates automatically via GOOGLE_APPLICATION_CREDENTIALS.
const { PubSub } = require('@google-cloud/pubsub');
const config = require('../config');

const pubsub = new PubSub({ projectId: config.projectId });

// The exact shape of the message does not matter: the worker parses it back
// the same way on the other side.
function publishZipJob(tags, tagmode) {
  const payload = { tags, tagmode: tagmode || 'all' };
  const dataBuffer = Buffer.from(JSON.stringify(payload));

  return pubsub.topic(config.topicName).publishMessage({ data: dataBuffer });
}

module.exports = {
  publishZipJob
};
