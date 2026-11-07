# Apex Goods Co.

A small storefront with a Node.js HTTP server, a persistent SQLite database, product management, a shopping cart, promo codes, and order tracking. The frontend uses plain HTML, CSS, and JavaScript. No npm packages are required.

## Run locally

Requires **Node.js 22.13 or newer** (`node:sqlite` must be available).

On Windows, double-click `run.bat`, or run:

```powershell
.\run.ps1
```

On Linux, start the server in the foreground with:

```sh
sh ./run.sh
```

For a direct server deployment, set `NODE_ENV=production` in `.env` and configure the initial admin password for a new database as described below. The Docker Compose deployment uses `deploy/deploy.sh`.

From any terminal in this folder:

```sh
node src/server.js
```

Open [the storefront](http://localhost:3000) or [the store manager](http://localhost:3000/admin.html). If a previous server is running, stop it before starting the updated server. `PORT` can select another port.

The development password for a newly created database is `123`. Existing databases retain their existing password. Change it in the store manager; new passwords require at least 12 characters. `ADMIN_PASSWORD` only initializes a new database and never overrides a password changed in the dashboard.

## Configuration and data

Copy `.env.example` to `.env` if you want to change the defaults. The server loads this file automatically. Existing process environment variables take precedence.

- `DB_PATH`: defaults to `data/ecommerce.db`, resolved relative to the project folder.
- `TAX_RATE`, `FREE_SHIPPING_THRESHOLD`, `STANDARD_SHIPPING_FEE`: shared by the storefront, checkout quote, and order creation. The tax rate is a configurable demonstration rule, not jurisdiction-specific tax calculation.
- `PAYMENT_MODE=mock`: enables demonstration checkout only.
- `SEED_DEMO_DATA=true`: fills a new, empty database with the example catalog, reviews, promo codes, and sample orders. Development does this by default. Production does not seed by default.
- `NODE_ENV=production`: when initializing a new production database, `ADMIN_PASSWORD` must be at least 12 characters.

Schema additions are applied automatically without deleting existing records. Old password hashes are upgraded after successful login. The test suite uses temporary databases; the browser QA preview uses `.qa/preview.db`. Neither uses `data/ecommerce.db`.

## What works

- Responsive catalog, searchable categories, sorting, shareable filter URLs, empty/loading/error states, and image fallbacks.
- Product details, gallery, quantity controls, inventory limits, and a cart synchronized between tabs.
- Server-verified checkout quotes, cents-based totals, promo minimums and usage limits. `WELCOME10` requires $50; `FREESHIP` requires $30 and waives shipping rather than subtracting from merchandise.
- Order creation and inventory updates in one SQLite transaction. Repeated submissions with the same `Idempotency-Key` return the same order; using that key for a different payload is rejected.
- Private receipts: the same checkout tab uses a receipt token stored in session storage. Manual lookup requires the order reference and matching email. The email is sent in the request body, not in the URL.
- Admin sessions, product creation/editing, shelf visibility, stock updates, orders, tracking, cancellation, and database status. Cancelling an unshipped order restores stock once. Cancelled orders cannot be reopened here.

## Payments

**Real Stripe and PayPal payments are not implemented.** Previous code displayed a fake payment intent and marked orders as paid without contacting a payment provider. The updated checkout explicitly creates demo orders, takes no card details, makes no charge, sends no email, and excludes new demo orders from paid revenue.

Setting `PAYMENT_MODE` to anything other than `mock` disables order submission. Adding provider keys does not enable payments. See `docs/PAYMENT_INTEGRATION_GUIDE.md` for the remaining implementation work.

## Verification

```sh
node --test
```

The tests cover invalid quantities, duplicate lines, hidden products, configurable totals, coupon rules, duplicate submissions, receipt authorization, cancellation, partial stock updates, password changes, malformed requests, static pages, and browser cart state.

There is no frontend build step. You can also use `npm start`, `npm run dev`, and `npm test` if npm is installed.

## Files

- `src/server.js`: routes, sessions, static serving, and admin operations.
- `src/commerce.js`: checkout validation, pricing, order creation, and product validation.
- `src/db.js`: SQLite schema, compatible migrations, and password hashing.
- `src/config.js`: `.env` and shared store configuration.
- `public/`: storefront and store manager.
- `test/store.test.js`: isolated regression tests.
- `.backups/before-improvements.zip`: original source, pages, launchers, README, and example configuration before this revision.

Docker and cloud deployment files remain in `docker/`, `deploy/`, and `docs/`. They have not been deployed or verified against a cloud account during this revision. The app still needs a real payment-provider flow, verified webhooks, email delivery, and store policies before accepting real customer purchases.
