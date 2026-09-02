// Client-side driver for the background zip feature.
//
// Instead of navigating the browser to POST /zip (which used to just dump the
// raw JSON response on screen), this:
//   1. queues the job over AJAX,
//   2. polls GET /zip/status to drive a live progress bar,
//   3. streams the finished file down as an automatic download.
(function () {
  'use strict';

  var POLL_INTERVAL_MS = 1200;

  var container = document.querySelector('[data-zip]');
  if (!container) {
    return;
  }

  var tags = container.getAttribute('data-tags') || '';
  var tagmode = container.getAttribute('data-tagmode') || 'all';

  var startBtn = container.querySelector('[data-zip-start]');
  var downloadBtn = container.querySelector('[data-zip-download]');
  var progressWrap = container.querySelector('[data-zip-progress]');
  var progressTrack = container.querySelector('[data-zip-track]');
  var progressBar = container.querySelector('[data-zip-bar]');
  var statusText = container.querySelector('[data-zip-status]');
  var errorBox = container.querySelector('[data-zip-error]');
  var authHint = container.querySelector('[data-zip-auth-hint]');

  var polling = false;
  var downloaded = false;
  // Part III - the zip button is only usable once the user has signed in.
  var signedIn = false;

  function isSignedIn() {
    return Boolean(window.zipAuth && window.zipAuth.isSignedIn());
  }

  // Reflect the current auth state on the start button + hint.
  function updateAuthState() {
    signedIn = isSignedIn();
    startBtn.disabled = !signedIn || polling;
    if (authHint) {
      authHint.style.display = signedIn ? 'none' : '';
    }
  }

  // firebase-auth.js announces sign-in / sign-out through this event.
  document.addEventListener('zip-auth-changed', updateAuthState);
  // Handle the case where auth resolved before this script attached its listener.
  updateAuthState();

  function setProgress(percent) {
    var value = Math.max(0, Math.min(100, Math.round(percent || 0)));
    progressBar.style.width = value + '%';
    progressBar.setAttribute('aria-valuenow', value);
    progressBar.textContent = value + '%';
  }

  function setStatusText(text) {
    if (statusText) {
      statusText.textContent = text;
    }
  }

  // The stripe pattern / animation lives on the .progress container in this
  // Bootstrap build; stop it (remove "active") once the job settles.
  function stopAnimation() {
    if (progressTrack) {
      progressTrack.className = 'progress';
    }
  }

  function showError(message) {
    if (errorBox) {
      errorBox.textContent = message || 'Something went wrong while zipping.';
      errorBox.style.display = 'block';
    }
    // Let the user try again (still respecting the auth gate).
    updateAuthState();
    stopAnimation();
    progressBar.className = 'progress-bar progress-bar-danger';
  }

  function finishSuccess(downloadUrl) {
    setProgress(100);
    setStatusText('Done! Your download should start automatically.');
    // Stop the striped animation, turn the bar green.
    stopAnimation();
    progressBar.className = 'progress-bar progress-bar-success';

    if (downloadBtn) {
      downloadBtn.style.display = '';
      if (downloadUrl) {
        downloadBtn.setAttribute('href', downloadUrl);
      }
    }

    if (!downloaded && downloadUrl) {
      downloaded = true;
      triggerDownload(downloadUrl);
    }
  }

  // Kick off the streamed download without navigating away from the page.
  function triggerDownload(url) {
    var link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function poll() {
    fetch('/zip/status?tags=' + encodeURIComponent(tags), {
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.status === 'error') {
          polling = false;
          showError(data.error);
          return;
        }

        if (data.status === 'done') {
          polling = false;
          finishSuccess(data.downloadUrl);
          return;
        }

        if (data.status === 'queued') {
          setStatusText('Queued… waiting for a worker.');
        } else if (data.status === 'processing') {
          setStatusText('Zipping your photos…');
        }
        setProgress(data.progress);

        setTimeout(poll, POLL_INTERVAL_MS);
      })
      .catch(function () {
        // Transient network/JSON error: keep polling, it will recover.
        if (polling) {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      });
  }

  function startZip() {
    if (polling) {
      return;
    }

    // Part III - refuse to queue a job unless the user is signed in. The server
    // enforces this too (verified Firebase ID token), this is just nicer UX.
    if (!isSignedIn()) {
      showError('Please sign in with Google before generating a zip.');
      return;
    }

    startBtn.disabled = true;
    downloaded = false;
    if (errorBox) {
      errorBox.style.display = 'none';
    }
    if (downloadBtn) {
      downloadBtn.style.display = 'none';
    }
    progressWrap.style.display = 'block';
    if (progressTrack) {
      progressTrack.className = 'progress progress-striped active';
    }
    progressBar.className = 'progress-bar';
    setProgress(0);
    setStatusText('Queuing…');

    var url =
      '/zip?tags=' +
      encodeURIComponent(tags) +
      '&tagmode=' +
      encodeURIComponent(tagmode);

    // Attach the Firebase ID token so the server can verify the request.
    window.zipAuth
      .getIdToken()
      .then(function (token) {
        var headers = { Accept: 'application/json' };
        if (token) {
          headers.Authorization = 'Bearer ' + token;
        }
        return fetch(url, { method: 'POST', headers: headers });
      })
      .then(function (res) {
        if (!res.ok && res.status !== 202) {
          throw new Error('Failed to queue zip job (HTTP ' + res.status + ')');
        }
        return res.json();
      })
      .then(function () {
        polling = true;
        poll();
      })
      .catch(function (err) {
        showError(err && err.message);
      });
  }

  startBtn.addEventListener('click', startZip);
})();
