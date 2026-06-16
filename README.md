# Seat Reservation Platform

Public seat reservation platform — Linkz Senior/Lead Engineer technical assessment.

**Stack:** Next.js 16 (App Router) · Supabase Auth + PostgreSQL · Stripe · Vercel

---

## Features

- Magic link login, no password — session persists 90 days via refresh token rotation
- 30 seats across 5 rows (A–E), venue-style layout with live status (available / held / reserved)
- Atomic seat hold via `UPDATE WHERE status='available' OR hold_expired` — prevents double booking without Redis or queues
- Expired holds reclaimed inline on the next reservation attempt — no dependency on cron schedule
- Stripe payment flow in test mode
- Stripe Webhook as source of truth for reservation confirmation — immune to browser crash or network failure
- Idempotent reserve API — safe under React StrictMode double-invocation and retries
- Auto-refresh every 60 s — seat page re-fetches without a full reload

---

## Architecture Decisions

See [docs/adr/](docs/adr/) for detailed trade-off analysis.

| Decision | Choice | Reason |
|----------|--------|--------|
| Race condition | Atomic SQL UPDATE | No extra infra; PostgreSQL guarantees single winner |
| Expired hold reclaim | Inline on next request | Works regardless of cron schedule; cron is a cleanup fallback |
| Payment confirmation | Stripe Webhook, not redirect | Ghost payment prevention — redirect is UX only |
| Auth session | Supabase magic link + refresh rotation | 90-day UX without long-lived JWT |
| Deployment | Vercel | Built-in Cron, Edge, zero-config Next.js |

---

## Project Structure

```
seat-reservation/
├── src/
│   ├── proxy.ts                        # Auth guard middleware
│   ├── app/
│   │   ├── login/page.tsx              # Magic link login
│   │   ├── seats/page.tsx              # Seat list (Server Component, force-dynamic)
│   │   ├── checkout/[seatId]/          # Stripe payment form
│   │   ├── success/page.tsx            # Confirmation page with webhook poll
│   │   ├── auth/callback/route.ts      # PKCE code exchange → session cookies
│   │   └── api/
│   │       ├── reserve/route.ts        # Atomic hold + Stripe PaymentIntent
│   │       ├── webhook/route.ts        # Stripe event handler (source of truth)
│   │       ├── reservation-status/     # Polling endpoint for success page
│   │       └── cron/release-holds/     # Release expired seat holds (cron fallback)
│   ├── components/
│   │   ├── SeatCard.tsx                # Individual seat button
│   │   └── SeatsRefresh.tsx            # Client component: router.refresh() every 60 s
│   ├── lib/supabase/{client,server,service}.ts
│   ├── lib/stripe.ts
│   └── types/database.ts
├── supabase/
│   ├── migrations/
│   │   ├── 20260616000000_init_schema.sql
│   │   └── 20260617000000_add_seats.sql
│   └── seed.sql
├── docs/
│   └── adr/                            # Architecture Decision Records
├── scripts/
│   └── setup-supabase.ps1             # Automated Supabase cloud setup
└── vercel.json                         # Cron job configuration
```

---

## Local Setup

### Prerequisites

- Node.js 18+
- [Supabase](https://supabase.com) account (free tier)
- [Stripe](https://stripe.com) account (test mode)
- [Stripe CLI](https://docs.stripe.com/stripe-cli)

### Steps

**1. Install dependencies**

```bash
cd seat-reservation
npm install
```

**2. Create Supabase project**

Option A — automated (PowerShell):
```powershell
.\scripts\setup-supabase.ps1 -Token "sbp_your_personal_access_token"
```

Option B — manual:
- Create project at [supabase.com](https://supabase.com)
- SQL Editor → run `supabase/migrations/20260616000000_init_schema.sql`
- SQL Editor → run `supabase/migrations/20260617000000_add_seats.sql`
- Authentication → URL Configuration:
  - Site URL: `http://localhost:3000`
  - Redirect URLs: `http://localhost:3000/**`
- Authentication → Settings → Session: set JWT expiry to `7776000` (90 days)

**3. Configure environment**

```bash
cp .env.example .env.local
# Fill in values — see .env.example for guidance
```

**4. Start dev server**

```bash
npm run dev
```

**5. Forward Stripe webhooks**

```bash
stripe listen --forward-to localhost:3000/api/webhook
# Copy the whsec_... secret into .env.local as STRIPE_WEBHOOK_SECRET
# Restart npm run dev
```

**6. Test payment**

Open `http://localhost:3000`, log in, select a seat, and use Stripe test card:

| Field | Value |
|-------|-------|
| Card number | `4242 4242 4242 4242` |
| Expiry | Any future date |
| CVC | Any 3 digits |

---

## Running Tests

```bash
npm test
```

21 unit tests cover: auth guard (401), atomic hold logic, race condition prevention (409), Stripe signature verification, webhook idempotency, cron authorization, and expired hold reclaim.

---

## Deploy to Vercel

Connect the GitHub repository to Vercel. Add all `.env.local` variables in Vercel dashboard → Settings → Environment Variables.

Add Stripe webhook endpoint in [Stripe Dashboard](https://dashboard.stripe.com/test/webhooks):
- URL: `https://your-app.vercel.app/api/webhook`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`

`vercel.json` configures a daily cron job (`0 0 * * *`) to release any stale seat holds — a cleanup fallback since expired holds are already reclaimed inline on the next reservation request.

> **Note:** Vercel Hobby plan only supports daily cron schedules. The inline reclaim in `/api/reserve` ensures seats are never permanently stuck regardless of cron frequency.

---

## Known Limitations (out of scope)

- No rate limiting or MFA
- No real-time seat updates (Supabase Realtime subscription)
- No hold countdown timer on the UI
- No confirmation email
- Cron runs daily on Hobby plan (inline reclaim compensates)
