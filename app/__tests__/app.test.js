const request = require('supertest');

jest.mock('../../app/photo_model');
const app = require('../../app/server');

describe('index route', () => {
  afterEach(() => {
    app.server.close();
  });

  test('should respond with a 200 with no query parameters', () => {
    return request(app)
      .get('/')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(
          /<title>Express App Testing Demo<\/title>/
        );
      });
  });

  test('should respond with a 200 with valid query parameters', () => {
    return request(app)
      .get('/?tags=california&tagmode=all')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(
          /<div class="panel panel-default search-results">/
        );
      });
  });

  test('should respond with a 200 with invalid query parameters', () => {
    return request(app)
      .get('/?tags=california123&tagmode=all')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(/<div class="alert alert-danger">/);
      });
  });

  test('should respond with a 500 error due to bad jsonp data', () => {
    return request(app)
      .get('/?tags=error&tagmode=all')
      .expect('Content-Type', /json/)
      .expect(500)
      .then(response => {
        expect(response.body).toEqual({ error: 'Internal server error' });
      });
  });
});

describe('zip status route', () => {
  afterEach(() => {
    app.server.close();
  });

  test('should respond with 400 when "tags" is missing', () => {
    return request(app)
      .get('/zip/status')
      .expect('Content-Type', /json/)
      .expect(400);
  });

  test('should report an idle status for unknown tags', () => {
    return request(app)
      .get('/zip/status?tags=never%20queued')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        expect(response.body).toEqual({
          status: 'idle',
          progress: 0,
          downloadUrl: null,
          error: null
        });
      });
  });
});

describe('zip download route', () => {
  afterEach(() => {
    app.server.close();
  });

  test('should respond with 400 when "tags" is missing', () => {
    return request(app)
      .get('/zip/download')
      .expect('Content-Type', /json/)
      .expect(400);
  });

  test('should respond with 404 when no zip is ready for the tags', () => {
    return request(app)
      .get('/zip/download?tags=never%20queued')
      .expect('Content-Type', /json/)
      .expect(404);
  });
});
