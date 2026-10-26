# MAKNAZUL 'IRFAN Bills & Services — Paystack test integration

Responsive educational bills and utility portal inspired by the supplied Tripleg screenshots. Includes a teal dashboard/navigation drawer, WAEC/JAMB/NECO/NABTEB cards, school/acceptance fee forms, utilities, Paystack hosted test checkout, server-side verification, and local transaction history.

## Security first
The secret key previously shared in chat should be rotated/revoked in your Paystack Dashboard before you run this project. Do not paste that exposed key into this project. Use a newly generated **test** secret key only.

## Run in Spck NodeJS on Android
1. Extract the ZIP and open the `maknazul-irfan-bills` folder in Spck NodeJS.
2. Copy `.env.example` to a new file named `.env`.
3. In `.env`, replace `PAYSTACK_SECRET_KEY` with your newly rotated `sk_test_...` key. The public test key is already filled in; you may replace it if you rotate it too.
4. In the terminal, run `npm install` and then `npm start`.
5. Open the local preview at the port shown by Spck (normally 3000). The server must be running for checkout and verification to work.

## Test-mode behaviour
- Every service currently uses a **sample ₦1,000 test amount**. These are not official service prices.
- The backend initializes Paystack checkout and verifies the returned transaction on the server. The server checks transaction status, reference, currency, and expected amount before labelling it verified.
- The backend refuses to run payment operations unless `PAYSTACK_SECRET_KEY` is a test key.
- Transaction history is stored in the browser's localStorage, so it is only a local prototype history, not a shared admin ledger.
- No valid WAEC/JAMB/NECO/NABTEB PIN, school fee receipt, data bundle, electricity token or TV subscription is delivered. Authorized vendor/service-provider APIs must be integrated before offering those services for real.

## Before production
1. Set real approved service prices in the server-side `SERVICES` catalogue and connect each service to an authorized vendor API.
2. Add user authentication, a database-backed order ledger, webhook signature validation, idempotent fulfilment, refunds/reconciliation, rate limiting and operational monitoring.
3. Deploy behind HTTPS, set `APP_BASE_URL` to the deployed HTTPS domain, and configure Paystack webhook/callback settings.
4. Only after testing, switch to live keys stored as server environment variables in your hosting provider's secret manager. Never put any `sk_...` key in browser code or GitHub.

## Files
- `server.js`: Express API, Paystack initialization and verification.
- `public/`: browser UI and client logic.
- `.env.example`: safe configuration template (does not contain a secret key).
