// Sign up / log in with Google or phone number (Firebase Authentication).
// Loaded automatically by app.js. Exposes window.MaknazulAuth.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  RecaptchaVerifier, signInWithPhoneNumber, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

let resolveReady;
const ready = new Promise(function (resolve) { resolveReady = resolve; });
const api = {
  user: null,
  configured: false,
  ready: ready,
  getToken: async function () { return null; },
  openLogin: function () {}
};
window.MaknazulAuth = api;

const $ = function (id) { return document.getElementById(id); };

const CSS = `
.mi-auth-btn{background:#ffffff20;color:#fff;border:1px solid #ffffff50;border-radius:10px;padding:9px 12px;font-size:14px;font-weight:700;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.mi-auth-overlay{position:fixed;inset:0;z-index:100;background:#061b2c99;display:flex;align-items:center;justify-content:center;padding:16px}
.mi-auth-overlay[hidden]{display:none}
.mi-auth-card{position:relative;background:#fff;color:#172b4d;width:100%;max-width:400px;max-height:92vh;overflow-y:auto;border-radius:20px;padding:24px 20px;box-shadow:0 20px 50px #0007;font-family:Arial,Helvetica,sans-serif}
.mi-auth-card h2{margin:0 28px 6px 0;font-size:21px}
.mi-auth-card label{display:block;font-size:13px;font-weight:700;margin:14px 0 6px}
.mi-auth-card input{width:100%;border:1px solid #ccd8e5;border-radius:10px;padding:12px;font:inherit;outline:none;box-sizing:border-box}
.mi-auth-card input:focus{border-color:#087f8c;box-shadow:0 0 0 3px #087f8c20}
.mi-muted{color:#65758b;font-size:13px;margin:0 0 14px}
.mi-btn{display:block;width:100%;margin-top:12px;padding:12px 16px;border:0;border-radius:11px;background:#087f8c;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.mi-btn:disabled{opacity:.6;cursor:default}
.mi-btn-light{background:#fff;color:#075b68;border:1px solid #ccd8e5}
.mi-or{display:flex;align-items:center;gap:10px;color:#65758b;font-size:12px;margin:18px 0 0}
.mi-or:before,.mi-or:after{content:"";flex:1;height:1px;background:#e2eaf2}
.mi-auth-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border:0;border-radius:50%;background:#eef3f8;color:#40536b;font-size:16px;cursor:pointer}
.mi-msg{margin:14px 0 0;padding:0;font-size:13px;font-weight:700;color:#075b68;min-height:0}
.mi-msg:not(:empty){padding:10px 12px;border-radius:10px;background:#edf8f8}
`;

const HTML = `
<div id="miAuthOverlay" class="mi-auth-overlay" hidden>
  <div class="mi-auth-card" role="dialog" aria-modal="true" aria-labelledby="miAuthTitle">
    <button type="button" id="miAuthClose" class="mi-auth-close" aria-label="Close">✕</button>
    <div id="miSignedOut">
      <h2 id="miAuthTitle">Sign in or create account</h2>
      <p class="mi-muted">New here? Signing in creates your account automatically.</p>
      <button type="button" id="miGoogle" class="mi-btn mi-btn-light">Continue with Google</button>
      <div class="mi-or">or use your phone number</div>
      <label for="miPhone">Phone number</label>
      <input id="miPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0801 234 5678">
      <button type="button" id="miSendCode" class="mi-btn">Send code</button>
      <div id="miCodeBox" hidden>
        <label for="miCode">6-digit code</label>
        <input id="miCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">
        <button type="button" id="miVerify" class="mi-btn">Verify and continue</button>
      </div>
    </div>
    <div id="miSignedIn" hidden>
      <h2>You are signed in</h2>
      <p id="miWho" class="mi-muted"></p>
      <button type="button" id="miSignOut" class="mi-btn mi-btn-light">Sign out</button>
    </div>
    <p id="miMsg" class="mi-msg" role="alert"></p>
    <div id="miRecaptcha"></div>
  </div>
</div>`;

function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s()-]/g, '');
  if (p.indexOf('00') === 0) p = '+' + p.slice(2);
  else if (p.indexOf('234') === 0) p = '+' + p;
  else if (p.charAt(0) === '0') p = '+234' + p.slice(1);
  return /^\+\d{8,15}$/.test(p) ? p : null;
}

function friendly(err) {
  const code = (err && err.code) || '';
  console.error('Auth error:', code, err && err.message);
  const map = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups and try again.',
    'auth/invalid-phone-number': 'That phone number is not valid. Try a format like 0801 234 5678.',
    'auth/missing-phone-number': 'Enter your phone number first.',
    'auth/too-many-requests': 'Too many attempts. Please wait a while and try again.',
    'auth/invalid-verification-code': 'That code is not correct. Check it and try again.',
    'auth/code-expired': 'That code has expired. Tap Send code to get a new one.',
    'auth/quota-exceeded': 'The SMS limit has been reached. Try again later or use Google.',
    'auth/unauthorized-domain': 'This website address is not authorised in Firebase yet.',
    'auth/operation-not-allowed': 'This sign-in method is not turned on in Firebase yet.',
    'auth/billing-not-enabled': 'SMS sign-in needs billing turned on in Firebase. Use Google for now.',
    'auth/network-request-failed': 'Network problem. Check your connection and try again.'
  };
  return map[code] || 'Sign-in failed. Please try again.';
}

function setMsg(text) { $('miMsg').textContent = text || ''; }

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = label;
}

function openModal() { $('miAuthOverlay').hidden = false; }
function closeModal() { $('miAuthOverlay').hidden = true; setMsg(''); }

function buildUI() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const holder = document.createElement('div');
  holder.innerHTML = HTML;
  document.body.appendChild(holder.firstElementChild);

  const menu = $('menuButton');
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'miAuthButton';
  button.className = 'mi-auth-btn';
  button.textContent = 'Sign in';
  if (menu && menu.parentNode) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;flex-shrink:0';
    menu.parentNode.insertBefore(wrap, menu);
    wrap.appendChild(button);
    wrap.appendChild(menu);
  } else {
    document.body.insertBefore(button, document.body.firstChild);
  }

  button.addEventListener('click', openModal);
  $('miAuthClose').addEventListener('click', closeModal);
  $('miAuthOverlay').addEventListener('click', function (e) {
    if (e.target === $('miAuthOverlay')) closeModal();
  });
  api.openLogin = openModal;
}

function updateUI() {
  const user = api.user;
  const button = $('miAuthButton');
  $('miSignedOut').hidden = Boolean(user);
  $('miSignedIn').hidden = !user;
  if (user) {
    const label = user.name || user.email || user.phone || 'Account';
    button.textContent = '👤 ' + label.split(' ')[0];
    $('miWho').textContent = 'Signed in as ' + (user.name || user.email || user.phone) + '.';
    const email = $('email');
    const name = $('customerName');
    if (email && !email.value && user.email) email.value = user.email;
    if (name && !name.value && user.name) name.value = user.name;
  } else {
    button.textContent = 'Sign in';
  }
}

(function init() {
  buildUI();

  fetch('/api/config')
    .then(function (r) { return r.json(); })
    .catch(function () { return {}; })
    .then(function (config) {
      const firebase = config && config.firebase;
      if (!firebase || !firebase.apiKey || !firebase.projectId) {
        $('miSignedOut').innerHTML =
          '<h2>Sign-in unavailable</h2><p class="mi-muted">Sign-in has not been set up on this site yet.</p>';
        resolveReady();
        return;
      }

      const app = initializeApp(firebase);
      const auth = getAuth(app);
      auth.useDeviceLanguage();
      api.configured = true;
      api.getToken = async function () {
        return auth.currentUser ? auth.currentUser.getIdToken() : null;
      };

      onAuthStateChanged(auth, function (user) {
        api.user = user
          ? { uid: user.uid, email: user.email || '', phone: user.phoneNumber || '', name: user.displayName || '' }
          : null;
        updateUI();
        resolveReady();
        window.dispatchEvent(new CustomEvent('maknazul:auth-changed'));
      });

      // Google
      $('miGoogle').addEventListener('click', async function () {
        setMsg('');
        const btn = $('miGoogle');
        setBusy(btn, true);
        try {
          await signInWithPopup(auth, new GoogleAuthProvider());
          closeModal();
        } catch (err) {
          setMsg(friendly(err));
        } finally {
          setBusy(btn, false);
        }
      });

      // Phone number
      let verifier = null;
      let confirmation = null;

      function resetVerifier() {
        try { if (verifier) verifier.clear(); } catch (e) { /* ignore */ }
        verifier = null;
        $('miRecaptcha').innerHTML = '';
      }

      $('miSendCode').addEventListener('click', async function () {
        setMsg('');
        const phone = normalizePhone($('miPhone').value);
        if (!phone) {
          setMsg('Enter a valid phone number, for example 0801 234 5678.');
          return;
        }
        const btn = $('miSendCode');
        setBusy(btn, true, 'Sending…');
        try {
          if (!verifier) verifier = new RecaptchaVerifier(auth, 'miRecaptcha', { size: 'invisible' });
          confirmation = await signInWithPhoneNumber(auth, phone, verifier);
          $('miCodeBox').hidden = false;
          setMsg('Code sent to ' + phone + '. Enter it below.');
          $('miCode').focus();
        } catch (err) {
          setMsg(friendly(err));
          resetVerifier();
        } finally {
          setBusy(btn, false, 'Send code');
        }
      });

      $('miVerify').addEventListener('click', async function () {
        setMsg('');
        const code = $('miCode').value.trim();
        if (!confirmation) { setMsg('Tap Send code first.'); return; }
        if (!/^\d{6}$/.test(code)) { setMsg('Enter the 6-digit code.'); return; }
        const btn = $('miVerify');
        setBusy(btn, true, 'Checking…');
        try {
          await confirmation.confirm(code);
          closeModal();
        } catch (err) {
          setMsg(friendly(err));
        } finally {
          setBusy(btn, false, 'Verify and continue');
        }
      });

      $('miSignOut').addEventListener('click', async function () {
        try { await signOut(auth); } catch (e) { /* ignore */ }
        closeModal();
      });
    });
})();
