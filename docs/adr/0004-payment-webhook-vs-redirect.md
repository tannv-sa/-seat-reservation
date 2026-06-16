# ADR-0004: Payment Confirmation — Webhook vs. Redirect

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Engineering Team

---

## Context

After a user completes payment, the system must confirm the reservation and update the seat status from `held` → `reserved`. The key question: *what is the source of truth that triggers this action?*

**Two possible flows:**

**Flow A — Browser Redirect (unreliable):**
```
User pays → Stripe redirects to /success → App updates DB → Seat reserved
```

**Flow B — Stripe Webhook (reliable):**
```
User pays → Stripe calls /api/webhook → App updates DB → Seat reserved
                                          ↑
                        Browser can crash, network can drop —
                        webhook fires independently regardless
```

---

## Options Considered

### Option A: Browser redirect only (not chosen)
### Option B: Stripe Webhook only (chosen)
### Option C: Both, with webhook as primary

---

## Decision

**Choose Option B: Stripe Webhook is the sole source of truth for confirming a reservation.**

The browser redirect to `/success` is UI-only — it triggers no DB operations.

### Complete flow

```
1. User selects seat → POST /api/reserve → seat status = 'held'
2. App creates Stripe PaymentIntent → returns client_secret to frontend
3. Frontend uses Stripe.js to process payment
4. Stripe processes the payment:
   a. Success → Stripe POSTs to /api/webhook with event 'payment_intent.succeeded'
   b. Failure → Stripe POSTs to /api/webhook with event 'payment_intent.payment_failed'
5. Webhook handler:
   - Verifies Stripe signature (prevents spoofing)
   - Idempotency check (prevents double-processing)
   - Updates reservation status = 'confirmed', seat status = 'reserved'
6. Stripe redirects user to /success (UI only)
7. /success page polls DB for actual status to display
```

### Webhook handler (idempotent)

```typescript
// POST /api/webhook
export async function POST(req: Request) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')!

  // Step 1: Verify signature — reject if not from Stripe
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent

    // Step 2: Idempotency check — Stripe may deliver the same event more than once
    const reservation = await db.from('reservations')
      .select('id, seat_id, status')
      .eq('payment_intent_id', intent.id)
      .maybeSingle()

    if (reservation?.status === 'confirmed') {
      return NextResponse.json({ received: true }) // already processed, skip
    }

    // Step 3: Update reservation and seat atomically
    await Promise.all([
      db.from('reservations').update({ status: 'confirmed' }).eq('payment_intent_id', intent.id),
      db.from('seats').update({ status: 'reserved', held_by: null, held_until: null }).eq('id', reservation.seat_id),
    ])
  }

  if (event.type === 'payment_intent.payment_failed') {
    await releaseSeatHold(intent.id) // returns seat to available
  }

  return NextResponse.json({ received: true })
}
```

---

## Rationale

### Why not use the browser redirect (Option A)?

**Failure scenarios with redirect:**
- User pays → network drops → never reaches `/success` → seat not confirmed
- User closes the tab right after Stripe confirms but before the redirect
- Browser crashes after payment
- User crafts a fake request to `/success` without actually paying

All of these cause a "ghost payment" — Stripe has charged the card but the seat is not booked. This is the most serious failure mode in a payment system.

### Why is webhook the right approach?
- Webhook fires server-to-server (Stripe → App) — independent of the user's browser
- Stripe retries the webhook if the server returns an error (exponential backoff)
- Stripe signature verification guarantees the request is genuinely from Stripe
- This is the standard pattern for every production payment integration

### Why is idempotency required?
Stripe may deliver the same webhook event more than once (network retries, at-least-once delivery guarantee). Without an idempotency check, one payment could trigger two confirmation updates, potentially violating DB constraints or causing unexpected behaviour.

### Why not combine both (Option C)?
- Adds unnecessary complexity
- The redirect often fires before the webhook in many scenarios → race condition between two places updating the DB
- A single source of truth is simpler and has fewer bugs

---

## Consequences

**Positive:**
- Ghost payments are impossible (card charged but seat not booked)
- Resilient to network failures and browser crashes
- Stripe retry guarantees eventual delivery of the webhook
- Full audit trail available in the Stripe dashboard

**Negative / Risks:**
- Requires a public HTTPS endpoint for the webhook — use Stripe CLI or Vercel for local development
- Small delay between payment and confirmation (webhook delivery can take a few seconds)
- `/success` page must poll the DB (or use Supabase Realtime) to display accurate status, not rely on Stripe redirect params alone
- `STRIPE_WEBHOOK_SECRET` must be stored securely in environment variables

**Out of scope (future work):**
- Logging all webhook events to a `webhook_events` table for debugging
- Alerting when webhooks repeatedly fail (e.g. Sentry, Datadog)
- Dead-letter queue for webhook events that cannot be processed after N retries
