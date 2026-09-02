// Part III - Firebase web authentication with Google Sign-In.
//
// Loaded as an ES module (<script type="module">) so it can import the Firebase
// Web SDK straight from the CDN. It wires the Sign in / Sign out buttons in the
// header and exposes a tiny `window.zipAuth` helper + a `zip-auth-changed`
// event so the classic scripts (zip.js) can react to the auth state and attach
// the ID token to their requests.
//
// The firebaseConfig below is public by design (Firebase web config is safe to
// ship to the browser). It comes from the TP guide.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCIvTlTGG115yaWDeFqxi-Jc2oYH45FlME',
  authDomain: 'ecni2-2026.firebaseapp.com',
  databaseURL: 'https://ecni2-2026-default-rtdb.firebaseio.com',
  projectId: 'ecni2-2026',
  storageBucket: 'ecni2-2026.firebasestorage.app',
  messagingSenderId: '1046535202867',
  appId: '1:1046535202867:web:a23b26f739647f87221b46'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

// Minimal API consumed by zip.js (a classic, non-module script).
window.zipAuth = {
  isSignedIn: function () {
    return Boolean(currentUser);
  },
  getUser: function () {
    return currentUser;
  },
  // Fresh ID token for the current user (or null when signed out).
  getIdToken: function () {
    return currentUser ? currentUser.getIdToken() : Promise.resolve(null);
  }
};

const signInBtn = document.querySelector('[data-signin]');
const signOutBtn = document.querySelector('[data-signout]');
const userLabel = document.querySelector('[data-auth-user]');

if (signInBtn) {
  signInBtn.addEventListener('click', function () {
    signInWithPopup(auth, provider).catch(function (error) {
      console.error('[auth] sign-in failed', error);
    });
  });
}

if (signOutBtn) {
  signOutBtn.addEventListener('click', function () {
    signOut(auth).catch(function (error) {
      console.error('[auth] sign-out failed', error);
    });
  });
}

// React to sign-in / sign-out: update the header and notify the rest of the page.
onAuthStateChanged(auth, function (user) {
  currentUser = user;

  if (userLabel) {
    userLabel.textContent = user ? user.displayName || user.email : '';
  }
  if (signInBtn) {
    signInBtn.style.display = user ? 'none' : '';
  }
  if (signOutBtn) {
    signOutBtn.style.display = user ? '' : 'none';
  }

  document.dispatchEvent(
    new CustomEvent('zip-auth-changed', { detail: { signedIn: Boolean(user) } })
  );
});
