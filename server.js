const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createRemoteJWKSet, jwtVerify } = require('jose');
try { require('dotenv').config(); } catch (_) {}
const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);
app.use(express.json({ limit: '30kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// TEST-ONLY sample prices in kobo. Replace with approved supplier prices before launch.
// Never accept an amount from the browser; the server selects it from this catalogue.
const SERVICES = {
  waec: { name: 'WAEC Scratch Card', amount: 100000 },
  jamb: { name: 'JAMB PIN Vending', amount: 100000 },
  neco: { name: 'NECO Services', amount: 100000 },
  nabteb: { name: 'NABTEB Services', amount: 100000 },
  schoolfees: { name: 'School Fees', amount: 100000 },
  admission: { name: 'Acceptance Fees', amount: 100000 },
  data: { name: 'Data Subscription', amount: 100000 },
  electricity: { name: 'Electricity Bills', amount: 100000 },
  tv: { name: 'TV Subscriptions', amount: 100000 },
  airtime: { name: 'Airtime Top-up', amount: 100000 },
  other: { name: 'Other Bills', amount: 100000 }
};

/* ---------- Sign-in (Firebase Authentication) ---------- */

// Public web config for the browser. These are identifiers, not secrets.
function firebaseConfig() {
  const apiKey = process.env.FIREBASE_API_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    appId: process.env.FIREBASE_APP_ID || ''
  };
}

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

// Checks the Firebase ID token sent by the browser before any payment is started.
async function requireUser(req, res, next) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return res.status(503).json({ error: 'Sign-in is not configured yet.' });
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId
    });
    if (!payload.sub) throw new Error('Token has no subject');
    req.user = { uid: payload.sub, email: payload.email || '', phone: payload.phone_number || '' };
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
}

app.get('/api/status', (_req, res) => res.json({
  app: "MAKNAZUL 'IRFAN Bills & Services",
  paymentProvider: 'Paystack',
  mode: 'test',
  configured: Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PUBLIC_KEY),
  signInConfigured: Boolean(firebaseConfig()),
  livePaymentsEnabled: false,
  note: 'Test-only sample prices. No examination PINs or utility tokens are supplied by this app.'
}));

app.get('/api/config', (_req, res) => res.json({
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
  currency: 'NGN',
  mode: 'test',
  firebase: firebaseConfig()
}));

app.post('/api/payments/initialize', requireUser, async (req, res) => {
  try {
    const { serviceId, email, details } = req.body || {};
    const service = SERVICES[serviceId];
    if (!service) return res.status(400).json({ error: 'Choose a supported service.' });
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!process.env.PAYSTACK_SECRET_KEY || !process.env.PAYSTACK_SECRET_KEY.startsWith('sk_test_')) {
      return res.status(503).json({ error: 'Paystack test mode is not configured. Add a rotated test secret key to .env.' });
    }
    const reference = `mia_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
    const baseUrl = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: service.amount,
        currency: 'NGN',
        reference,
        callback_url: `${baseUrl}/?payment=verify`,
        metadata: {
          service_id: serviceId,
          service_name: service.name,
          user_id: req.user.uid,
          user_phone: req.user.phone,
          user_email: req.user.email,
          customer_details: sanitizeDetails(details)
        }
      })
    });
    const result = await response.json();
    if (!response.ok || !result.status || !result.data?.authorization_url) {
      return res.status(502).json({ error: result.message || 'Could not initialize Paystack checkout.' });
    }
    res.json({ authorizationUrl: result.data.authorization_url, reference, amount: service.amount, service: service.name });
  } catch (err) {
    console.error('Paystack initialization error:', err.message);
    res.status(500).json({ error: 'Unable to start payment. Please try again.' });
  }
});

app.get('/api/payments/verify/:reference', async (req, res) => {
  try {
    const reference = String(req.params.reference || '');
    if (!/^mia_[a-zA-Z0-9_]+$/.test(reference)) return res.status(400).json({ error: 'Invalid transaction reference.' });
    if (!process.env.PAYSTACK_SECRET_KEY || !process.env.PAYSTACK_SECRET_KEY.startsWith('sk_test_')) {
      return res.status(503).json({ error: 'Paystack test mode is not configured.' });
    }
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });
    const result = await response.json();
    if (!response.ok || !result.status || !result.data) return res.status(502).json({ error: 'Could not verify this payment.' });
    const data = result.data;
    const serviceId = data.metadata?.service_id;
    const service = SERVICES[serviceId];
    const verified = data.status === 'success' && service && data.amount === service.amount && data.currency === 'NGN' && data.reference === reference;
    res.json({
      verified: Boolean(verified),
      status: data.status,
      reference: data.reference,
      amount: data.amount,
      currency: data.currency,
      service: service?.name || data.metadata?.service_name || 'Unknown service',
      message: verified ? 'Test payment verified. This does not deliver a PIN, token or school service.' : 'Payment is not verified as successful; do not fulfil the order.'
    });
  } catch (err) {
    console.error('Paystack verification error:', err.message);
    res.status(500).json({ error: 'Unable to verify payment right now.' });
  }
});

function sanitizeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(details).slice(0, 12)) {
    if (typeof value === 'string') safe[String(key).slice(0, 40)] = value.slice(0, 120);
  }
  return safe;
}

// Run a normal server locally (npm start); on Vercel the exported app is used instead.
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`Maknazul Irfan Bills running on port ${PORT}`));
}

module.exports = app;
