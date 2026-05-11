const express = require('express');
const Stripe = require('stripe');
const { scanRepo } = require('./lib/scanner');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
const PAYMENT_LINK = process.env.STRIPE_PAYMENT_LINK || '';
const PRICE_CENTS = 500; // $5.00

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
    endpoints: {
      scan: 'POST /scan?repo=GITHUB_URL  (free preview)',
      full_scan: 'POST /scan/full?repo=GITHUB_URL&session_id=STRIPE_SESSION_ID  (paid)',
      payment: 'GET /pay  (get Stripe payment link)'
    },
    price: '$5.00 per full scan'
  });
});

// Get payment link
app.get('/pay', (req, res) => {
  if (!PAYMENT_LINK) {
    return res.status(503).json({ error: 'Payment not configured yet. Set STRIPE_PAYMENT_LINK env var.' });
  }
  res.json({
    payment_link: PAYMENT_LINK,
    price: '$5.00',
    note: 'After payment, you will be redirected back with a session_id. Use that to call /scan/full'
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
      _note: 'This is a FREE preview (4 checks). For full scan with 15+ checks, pay $5 at /pay',
      _upgrade: '/pay'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full paid scan
app.post('/scan/full', async (req, res) => {
  const repoUrl = req.query.repo || req.body.repo;
  const sessionId = req.query.session_id || req.body.session_id;

  const error = validateRepoUrl(repoUrl);
  if (error) return res.status(400).json({ error });

  if (!sessionId) {
    return res.status(402).json({
      error: 'Payment required',
      message: 'Full scan costs $5.00',
      payment_link: PAYMENT_LINK || 'Not configured',
      instructions: '1. Pay at the payment link 2. You will get a session_id 3. Call this endpoint with ?session_id=xxx'
    });
  }

  // Verify Stripe payment
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed or failed.' });
    }
    // Optional: verify amount matches
    if (session.amount_total < PRICE_CENTS) {
      return res.status(402).json({ error: 'Insufficient payment amount.' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Invalid session_id: ' + err.message });
  }

  try {
    const result = await scanRepo(repoUrl, true);
    res.json({
      ...result,
      _payment_verified: true,
      _session_id: sessionId.substring(0, 8) + '...'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct checkout session creation (for API integrations)
app.post('/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Full Repo Security Scan', description: 'Complete security audit of one GitHub repository' },
          unit_amount: PRICE_CENTS,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin || 'https://repo-scanner.onrender.com'}/scan/full?repo=${encodeURIComponent(req.body.repo || '')}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://repo-scanner.onrender.com'}/`,
    });
    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Repo Scanner API running on port ${PORT}`);
  console.log(`Stripe configured: ${stripe ? 'YES' : 'NO'}`);
  console.log(`Payment link: ${PAYMENT_LINK || 'NOT SET'}`);
});
