# Payment integration status

The current application supports **demo checkout only**. It creates orders with `payment_status=mock`, reserves inventory, and displays that no money was charged. It does not collect card details or send confirmation emails.

`GET /api/payments/config` reports both Stripe and PayPal disabled. `POST /api/payments/create-intent` returns HTTP 501. Setting a non-mock `PAYMENT_MODE` causes order submission to return HTTP 503. Provider environment variables by themselves do not implement payment processing.

The previous implementation returned a fabricated Stripe client secret and marked orders paid without verifying payment. That behavior has been removed.

## Work required for real payments

1. Create a provider checkout session on the server using the server-calculated cart total, never an amount supplied by the browser.
2. Use the provider's hosted checkout or secure payment elements. Keep raw card data out of this application.
3. Store a pending order and its provider session identifier, with retry-safe creation and an inventory reservation expiry strategy.
4. Verify provider webhook signatures against the raw request body. Mark an order paid only after a verified successful payment event. Deduplicate events and verify amount, currency, and order identity.
5. Handle failed, expired, refunded, and disputed payments. Release reservations exactly once when appropriate.
6. Implement email delivery and replace demo copy only after those services are connected.
7. Exercise the full sandbox flow and its failure cases before enabling production credentials.

Consult the provider's official integration documentation when implementing this work. No payment provider was connected or deployed as part of this revision.
