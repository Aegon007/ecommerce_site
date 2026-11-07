# Application architecture

The application uses Node.js 22.13+ with built-in `http`, `sqlite`, `crypto`, and filesystem modules. The browser uses plain HTML, CSS, and JavaScript; there is no dependency installation or frontend build step.

## Components

- `src/config.js` loads `.env` and validates shared pricing settings.
- `src/db.js` opens a single SQLite database in WAL mode, creates tables, and adds backward-compatible order columns. Existing data is retained.
- `src/commerce.js` validates products and checkout input, combines duplicate product lines, verifies active inventory, calculates in integer cents, and creates demo orders within `BEGIN IMMEDIATE` transactions.
- `src/server.js` handles HTTP routes, bounded JSON parsing, sessions, local rate limits, protected admin operations, and static serving.
- `public/js/cart.js` validates local cart state and broadcasts changes across tabs. `checkout.js` verifies totals against the server before submission. Receipt tokens remain in session storage; manual lookup verifies the email address.

## Public API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Database connectivity, uptime, memory |
| GET | `/api/store-config` | USD pricing settings and payment mode |
| GET | `/api/categories` | Categories and active product counts |
| GET | `/api/products` | Active catalog; category/search/price/sort/limit filters |
| GET | `/api/products/:idOrSlug` | Active product, gallery, reviews, active related products |
| POST | `/api/coupons/validate` | Validate code, minimum subtotal, and usage limit |
| POST | `/api/checkout/quote` | Authoritative prices, availability, discounts, shipping, and tax |
| POST | `/api/orders` | Demo order creation; optional `Idempotency-Key` header for retry safety |
| POST | `/api/orders/lookup` | Lookup using `order_number` and `email` in JSON body |
| GET | `/api/orders/:number` | Receipt; requires `X-Order-Token` or an admin session |
| GET | `/api/payments/config` | Reports demo checkout and disabled live providers |
| POST | `/api/payments/create-intent` | HTTP 501: live payments are not implemented |

An order body includes `customer: {name, email, phone?}`, `shipping: {address, city, state?, postal_code, country?}`, `items: [{id, quantity}]`, and optional `couponCode`. Prices come from the database. Quantities must be integers from 1 to 99, including the combined total for a product. Checkout returns `order_number`, `lookup_token`, totals, and explicit `payment_status=mock`.

## Admin API

`POST /api/admin/login` accepts username (defaults to `admin`) and password. All other admin routes require a valid `Authorization: Bearer <token>` session.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/admin/verify` | Verify session |
| POST | `/api/admin/logout` | Revoke session |
| POST | `/api/admin/change-password` | Set a 12+ character password and revoke other sessions |
| GET | `/api/admin/metrics` | Paid revenue, order counts, low stock, recent orders |
| GET | `/api/admin/database-info` | Database facts and row counts |
| GET | `/api/admin/products` | All products, including off-shelf |
| POST | `/api/admin/products` | Create validated product |
| PUT | `/api/admin/products/:id` | Partial product update; omitted values are retained |
| DELETE | `/api/admin/products/:id` | Delete product and its reviews |
| POST | `/api/admin/products/:id/toggle-shelf` | Toggle storefront visibility |
| GET | `/api/admin/orders` | Latest 50 orders |
| PATCH | `/api/admin/orders/:id` | Status/tracking updates; cancellation restores inventory once |

Passwords use per-password random salts with scrypt. Legacy SHA-256 hashes are accepted and upgraded on successful login. `ADMIN_PASSWORD` initializes a new database and is never an alternative password or a restart-time reset. Sessions expire after seven days.

## Persistence and limits

Tables include `categories`, `products`, `coupons`, `orders`, `reviews`, `admin_users`, `admin_sessions`, and `system_logs`. Order migrations add `lookup_token`, `checkout_key` (unique when present), and `request_hash`.

Inventory, coupon consumption, and order creation commit or roll back together. Client-supplied prices are ignored. Reusing a checkout key with a different payload returns HTTP 409. Cancellation cannot reopen an order or cancel a dispatched shipment through this endpoint.

JSON bodies are limited to 64 KB. Mutating browser requests must have the same origin host. Login, checkout, and receipt lookup have in-memory per-socket-address rate limits. Behind a proxy this limit applies to the proxy address; proxy configuration and production traffic limits still require deployment-specific review. The app does not blindly trust forwarded IP headers.

This remains a single-node SQLite application. Docker/Nginx files are included, but production hosting, TLS, backups, email delivery, tax rules, and live payment integrations were not provisioned or verified during this revision. There is no automatic PostgreSQL support or multi-node database migration.
