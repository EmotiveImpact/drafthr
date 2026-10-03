# Marketplace payment retries

Apply migration `0027_booking_checkout_attempts` before releasing this payment
code. It adds nullable request ID, request parameters and request time fields;
existing payment rows with a Checkout Session ID remain supported.

Each booking reserves its exact Checkout request in PostgreSQL before contacting
Stripe. Concurrent workers reuse the saved request and idempotency key. Price,
currency, destination, fee and return URLs stay fixed for that attempt. Open
sessions are reused. A confirmed expired session or terminal failed payment can
be replaced under the booking's database lock. Completed payments cannot start
another checkout.

The marketplace webhook processes these event types:

- `account.updated` on the Connect endpoint.
- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and
  `checkout.session.async_payment_failed` on the platform endpoint.

Configure all three Checkout events when enabling the endpoint. Processing
failure returns HTTP 503 so Stripe retries. Payment event IDs and payment changes
commit in one transaction. Duplicate deliveries do not overwrite a replacement
attempt. Before marking paid, the handler verifies the stored session or reserved
attempt, payment intent, amount and currency. It can recover a paid session even
when the original create response never reached the app.

## An unknown create outcome older than 23 hours

The app returns `payment_reconciliation_required` and logs
`marketplace_checkout_reconciliation_required` with the booking ID. Stripe may
discard idempotency keys after 24 hours, so this request is not sent again.

An operator must find the original session using its booking/attempt metadata,
confirm its payment status and reconcile it with the stored reservation. A
matching paid webhook can complete this automatically. Do not delete the
reservation or assign a new key merely to clear the message: first establish
whether Stripe created or collected the earlier payment. An unresolved outcome
stays blocked to prevent a second payment.

References: [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests),
[Checkout expiry](https://docs.stripe.com/api/checkout/sessions/create), and
[webhook delivery](https://docs.stripe.com/webhooks).
