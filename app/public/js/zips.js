// Part II - list the zips already generated, read from the web client.
//
// Fetches GET /zips (which reads the Firebase Realtime Database) and renders the
// results into the "Previously generated zips" panel on the home page.
(function () {
  'use strict';

  var list = document.querySelector('[data-zips-list]');
  if (!list) {
    return;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }

  function renderEmpty(message, className) {
    list.innerHTML =
      '<li class="list-group-item ' +
      (className || 'text-muted') +
      '">' +
      escapeHtml(message) +
      '</li>';
  }

  function renderZip(zip) {
    var when = zip.createdAt ? new Date(zip.createdAt).toLocaleString() : '';
    var meta = [zip.tags, when].filter(Boolean).map(escapeHtml).join(' — ');

    return (
      '<li class="list-group-item">' +
      '<a href="' +
      escapeHtml(zip.url || '#') +
      '">' +
      escapeHtml(zip.filename || 'photos.zip') +
      '</a>' +
      (meta ? ' <small class="text-muted">' + meta + '</small>' : '') +
      '</li>'
    );
  }

  fetch('/zips', { headers: { Accept: 'application/json' } })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var zips = (data && data.zips) || [];
      if (!zips.length) {
        renderEmpty('No zips generated yet.');
        return;
      }
      list.innerHTML = zips.map(renderZip).join('');
    })
    .catch(function () {
      renderEmpty('Failed to load zips.', 'text-danger');
    });
})();
