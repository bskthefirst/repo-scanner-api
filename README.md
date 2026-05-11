# RepoScanner API

Scan GitHub repositories for exposed secrets, `.git/config`, environment files, and security misconfigurations.

**Live Demo:** [https://repo-scanner.onrender.com](https://repo-scanner.onrender.com) *(pending deploy)*

## Pricing

- **Free Preview** — 4 quick checks (`.git/config`, `.env`, `.env.local`, `config.json`)
- **Full Scan** — $5.00 via Stripe. 15+ checks including secret pattern matching, misconfig detection, and remediation advice.

## API Endpoints

```
GET  /                          → API info + landing page
GET  /pay                       → Get Stripe payment link
POST /scan?repo=URL             → Free preview scan
POST /scan/full?repo=URL&session_id=XXX  → Paid full scan
POST /create-checkout-session   → Create Stripe checkout session
```

## Quick Start

```bash
git clone https://github.com/bskthefirst/repo-scanner-api.git
cd repo-scanner-api
npm install
STRIPE_SECRET_KEY=sk_test_xxx node index.js
```

## Stripe Setup

1. Create account at [stripe.com](https://stripe.com)
2. Get **Secret Key** from Developers → API keys
3. Set env var: `STRIPE_SECRET_KEY=sk_live_xxx`
4. Create a **Payment Link** or use `/create-checkout-session`
5. Deploy and start accepting $5 scans.

## Deployment

**Render (recommended):**
1. Push to GitHub
2. New Web Service → Connect repo
3. Set env vars: `STRIPE_SECRET_KEY`, `STRIPE_PAYMENT_LINK`
4. Deploy

## What It Detects

- Exposed `.git/config` (full repo history leak)
- Leaked `.env` / `.env.local` files
- Hardcoded AWS keys, GitHub tokens, private keys
- Database connection strings
- Missing security headers
- Open CORS configurations
- Exposed dependency files (`package.json`, `composer.json`)

## License

MIT
