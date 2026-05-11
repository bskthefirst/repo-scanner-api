# RepoScanner API

Scan GitHub repositories for exposed secrets, `.git/config`, environment files, and security misconfigurations.

**Live Demo:** [https://repo-scanner.onrender.com](https://repo-scanner.onrender.com) *(pending deploy)*

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/bskthefirst/repo-scanner-api)

## Pricing

- **Free Preview** — 4 quick checks (`.git/config`, `.env`, `.env.local`, `config.json`)
- **Full Scan** — $5.00 via PayPal.me. 15+ checks including secret pattern matching, misconfig detection, and remediation advice.

## How It Works (PayPal)

1. **Free Scan** → Enter any GitHub repo URL, get instant risk score
2. **Pay $5** → Click PayPal button, send payment to `paypal.me/bsknap/5USD`
3. **Enter TX ID** → Paste your PayPal Transaction ID to unlock the full report
4. **Get Full Report** → 15+ security checks with detailed findings

## API Endpoints

```
GET  /                          → API info + landing page
GET  /pay                       → Get PayPal payment instructions
POST /verify-paypal             → Submit tx_id after PayPal payment
POST /scan?repo=URL             → Free preview scan
POST /scan/full?repo=URL&tx_id=XXX  → Paid full scan
```

## Quick Start

```bash
git clone https://github.com/bskthefirst/repo-scanner-api.git
cd repo-scanner-api
npm install
PAYPAL_ME=yourhandle node index.js
```

## PayPal Setup (1 min)

1. You already have a PayPal.me link like `paypal.me/bsknap`
2. Set env var: `PAYPAL_ME=bsknap`
3. Done. Payments go straight to your PayPal. No SSN, no Stripe, no KYC.

## Deployment

**Render (one-click):**
Click the button above. Set env var `PAYPAL_ME=bsknap`.

**Manual:**
```bash
git push origin main
# Connect repo to Render / Railway / Fly.io
# Set env: PAYPAL_ME=yourhandle
```

## What It Detects

- Exposed `.git/config` (full repo history leak)
- Leaked `.env` / `.env.local` files
- Hardcoded AWS keys, GitHub tokens, private keys
- Database connection strings
- Missing security headers
- Open CORS configurations
- Exposed dependency files (`package.json`, `composer.json`)

## Architecture

- `/lib/scanner.js` — scanning engine with 12 secret patterns
- `/public/index.html` — dark-mode landing page with built-in scanner
- `index.js` — Express API with PayPal verification flow

## License

MIT
