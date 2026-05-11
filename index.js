const express = require('express');
const fetch = require('node-fetch');
const { scanRepo } = require('./lib/scanner');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PAYPAL_ME = process.env.PAYPAL_ME || 'bsknap';
const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL || '';
const PRICE = '5.00';
const CURRENCY = 'USD';

// Verified payments store (in-memory for demo, use DB in production)
const verifiedPayments = new Set();

// CORS for public API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function validateRepoUrl(url) {
  if (!url) return 'Missing repo URL';
  if (!url.includes('github.com')) return 'Only GitHub repos supported currently';
  try {
    new URL(url);
  } catch { return 'Invalid URL'; }
  return null;
}

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'repo-scanner-api',
    version: '1.0.0',
    payment_method: 'PayPal',
    paypal_me: `https://paypal.me/${PAYPAL_ME}/${PRICE}${CURRENCY}`,
    endpoints: {
      scan: 'POST /scan?repo=GITHUB_URL  (free preview)',
      full_scan: 'POST /scan/full?repo=GITHUB_URL&tx_id=PAYPAL_TX_ID  (paid)',
      verify_paypal: 'POST /verify-paypal  (submit after payment)'
    },
    price: `$${PRICE} per full scan`
  });
});

// Get payment link
app.get('/pay', (req, res) => {
  const returnUrl = req.query.return_url || req.headers.referer || '/';
  res.json({
    payment_url: `https://paypal.me/${PAYPAL_ME}/${PRICE}${CURRENCY}`,
    price: `$${PRICE}`,
    currency: CURRENCY,
    instructions: [
      '1. Click the payment URL and send the exact amount',
      '2. Note your PayPal Transaction ID (emailed to you)',
      `3. POST to /verify-paypal with {tx_id: "your-tx-id", repo: "github-url"}`
    ],
    payment_url_direct: `https://paypal.me/${PAYPAL_ME}/${PRICE}${CURRENCY}`
  });
});

// Verify PayPal payment (manual approval for now, webhook later)
app.post('/verify-paypal', (req, res) => {
  const { tx_id, repo, payer_email } = req.body;
  
  if (!tx_id || tx_id.length < 6) {
    return res.status(400).json({ error: 'Transaction ID required (minimum 6 chars)' });
  }
  if (!repo) {
    return res.status(400).json({ error: 'Repo URL required' });
  }

  // Check if already verified (prevent double-use)
  if (verifiedPayments.has(tx_id)) {
    return res.status(400).json({ error: 'This transaction ID has already been used' });
  }

  // For now: auto-accept with a note to admin to verify
  // In production, integrate PayPal API here to verify tx
  verifiedPayments.add(tx_id);
  
  res.json({
    verified: true,
    tx_id: tx_id.substring(0, 4) + '****',
    repo: repo,
    note: 'Payment accepted. Scan access granted for 24 hours.',
    scan_url: `/scan/full?repo=${encodeURIComponent(repo)}&tx_id=${encodeURIComponent(tx_id)}`,
    _admin_note: 'Verify in PayPal account dashboard if suspicious'
  });
});

// Free preview scan
app.post('/scan', async (req, res) => {
  const repoUrl = req.query.repo || req.body.repo;
  const error = validateRepoUrl(repoUrl);
  if (error) return res.status(400).json({ error });

  try {
    const result = await scanRepo(repoUrl, false);
    res.json({
      ...result,
      _note: 'This is a FREE preview (4 checks). For full scan with 15+ checks, pay $5 via PayPal',
      _upgrade: `/pay`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full paid scan
app.post('/scan/full', async (req, res) => {
  const repoUrl = req.query.repo || req.body.repo;
  const txId = req.query.tx_id || req.body.tx_id;

  const error = validateRepoUrl(repoUrl);
  if (error) return res.status(400).json({ error });

  if (!txId) {
    return res.status(402).json({
      error: 'Payment required',
      message: `Full scan costs $${PRICE}`,
      payment_url: `https://paypal.me/${PAYPAL_ME}/${PRICE}${CURRENCY}`,
      instructions: [
        '1. Send payment via PayPal link above',
        '2. Get your Transaction ID from PayPal email/receipt',
        '3. POST {tx_id: "...", repo: "..."} to /verify-paypal',
        '4. Then call this endpoint with tx_id parameter'
      ]
    });
  }

  // Verify payment was submitted
  if (!verifiedPayments.has(txId)) {
    return res.status(402).json({
      error: 'Payment not verified',
      message: 'Submit your transaction ID to /verify-paypal first',
      verify_endpoint: '/verify-paypal',
      required_body: { tx_id: txId, repo: repoUrl }
    });
  }

  try {
    const result = await scanRepo(repoUrl, true);
    res.json({
      ...result,
      _payment_verified: true,
      _tx_id: txId.substring(0, 4) + '****'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple webhook placeholder for future PayPal IPN
app.post('/webhook/paypal', (req, res) => {
  // Future: implement PayPal IPN/ webhook listener
  console.log('PayPal webhook:', req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Repo Scanner API running on port ${PORT}`);
  console.log(`PayPal.me: https://paypal.me/${PAYPAL_ME}/${PRICE}${CURRENCY}`);
});
