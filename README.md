# Seat Reservation Platform

> Linkz Senior/Lead Engineer Technical Assessment

A production-grade seat reservation platform built with Next.js 16, Supabase, and Stripe. Demonstrates engineering judgment across authentication, concurrency handling, payment reliability, and operational concerns.

**Live demo:** https://seat-reservation-93jj-git-master-tannvsa-3076s-projects.vercel.app/seats

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL 15) |
| Auth | Supabase Auth — magic link + PKCE |
| Payments | Stripe (test mode) |
| Styling | Tailwind CSS 4 |
| Testing | Vitest 4 |
| Deployment | Vercel (Hobby) |

---

## Features

- **Passwordless login** — magic link via email, session persists 90 days through refresh token rotation
- **Venue-style seat map** — 30 seats across 5 rows (A–E), live status: available / on hold / reserved
- **Race-condition-safe reservations** — single atomic `UPDATE … WHERE status = 'available'` at the DB layer; PostgreSQL guarantees exactly one winner with no Redis or queue required
- **Expired hold reclaim** — holds expire after 10 minutes; reclaimed inline on the next reservation attempt so seats never stay stuck regardless of cron schedule
- **Reliable payment confirmation** — Stripe Webhook is the source of truth; browser redirect is UI-only, immune to tab-close or network failure
- **Idempotent API** — safe to retry; handles React StrictMode double-invocation
- **Live seat refresh** — page re-fetches server data every 60 s; expired holds flip to available without a manual reload

---

## Architecture Decisions

Full trade-off analysis in [docs/adr/](docs/adr/). Architecture diagrams in [docs/architecture.md](docs/architecture.md).

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Concurrency | Atomic SQL `UPDATE WHERE` | No extra infra; PostgreSQL serialises concurrent writers |
| Expired holds | Inline reclaim + daily cron | Reclaim on demand — cron is a cleanup fallback only |
| Payment confirmation | Stripe Webhook (not redirect) | Redirect is unreliable; webhook fires server-to-server regardless of browser state |
| Authentication | Supabase magic link + PKCE | No passwords to store; 90-day session with rotation via one dashboard config |
| Deployment | Vercel | Zero-config Next.js; built-in Cron; Edge middleware |

---

## Project Structure

```
seat-reservation/
├── src/
│   ├── proxy.ts                          # Auth-guard middleware (Supabase SSR pattern)
│   ├── app/
│   │   ├── page.tsx                      # Root redirect → /seats
│   │   ├── login/page.tsx                # Magic link sign-in form
│   │   ├── seats/page.tsx                # Seat map (Server Component, force-dynamic)
│   │   ├── checkout/[seatId]/
│   │   │   ├── page.tsx                  # Server shell — awaits params Promise
│   │   │   └── CheckoutClient.tsx        # Stripe Elements payment form
│   │   ├── success/
│   │   │   ├── page.tsx                  # Confirmation view (polls webhook result)
│   │   │   └── SuccessPoller.tsx         # Client poller → router.refresh() on confirm
│   │   ├── auth/callback/route.ts        # PKCE code exchange → session cookies on redirect
│   │   └── api/
│   │       ├── reserve/route.ts          # Atomic hold + Stripe PaymentIntent creation
│   │       ├── webhook/route.ts          # Stripe event handler — source of truth
│   │       ├── reservation-status/       # Polling endpoint used by SuccessPoller
│   │       ├── cron/release-holds/       # Stale hold cleanup (daily cron fallback)
│   │       └── auth/signout/route.ts     # Server-side sign-out + redirect
│   ├── components/
│   │   ├── SeatCard.tsx                  # Venue-style seat button (compact, status-aware)
│   │   └── SeatsRefresh.tsx              # Client component: router.refresh() every 60 s
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                 # Browser Supabase client
│   │   │   ├── server.ts                 # Server Supabase client (reads cookies)
│   │   │   └── service.ts                # Service-role client (bypasses RLS)
│   │   └── stripe.ts                     # Stripe SDK singleton
│   └── types/database.ts                 # Seat, Reservation type definitions
├── supabase/
│   ├── migrations/
│   │   ├── 20260616000000_init_schema.sql  # Tables, RLS policies, unique index
│   │   └── 20260617000000_add_seats.sql    # Rows B–E (27 seats)
│   └── seed.sql                          # Full 30-seat seed for fresh installs
├── docs/
│   └── adr/                              # Architecture Decision Records (0001–0004)
├── scripts/
│   └── setup-supabase.ps1               # Automated Supabase project + schema setup
├── src/tests/
│   ├── api.reserve.test.ts               # 7 tests: auth, hold, race condition, rollback
│   ├── api.webhook.test.ts               # 7 tests: signature, idempotency, release
│   └── api.cron.test.ts                  # 7 tests: auth, release count, error handling
├── .env.example                          # Required environment variable template
├── vercel.json                           # Cron job schedule
└── next.config.ts
```

---

## Local Development

### Prerequisites

| Tool | Version | Link |
|------|---------|------|
| Node.js | 18+ | https://nodejs.org |
| Stripe CLI | latest | https://docs.stripe.com/stripe-cli |
| Supabase account | free tier | https://supabase.com |
| Stripe account | test mode | https://stripe.com |

### 1 — Clone and install

```bash
git clone https://github.com/tannv-sa/-seat-reservation.git
cd seat-reservation
npm install
```

### 2 — Set up Supabase

**Option A — automated (PowerShell):**
```powershell
.\scripts\setup-supabase.ps1 -Token "sbp_your_personal_access_token"
```

**Option B — manual:**

1. Create a new project at [supabase.com](https://supabase.com/dashboard)
2. Go to **SQL Editor** and run in order:
   ```
   supabase/migrations/20260616000000_init_schema.sql
   supabase/migrations/20260617000000_add_seats.sql
   ```
3. Go to **Authentication → URL Configuration:**
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/**`
4. Go to **Authentication → Sessions:**
   - JWT expiry: `7776000` (90 days)
   - Enable refresh token rotation

### 3 — Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role secret |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys → Publishable key |
| `STRIPE_WEBHOOK_SECRET` | Generated by `stripe listen` (step 5) |
| `CRON_SECRET` | Any random string (e.g. `openssl rand -hex 32`) |

### 4 — Start the dev server

```bash
npm run dev
```

App runs at `http://localhost:3000`.

### 5 — Forward Stripe webhooks

In a second terminal:
```bash
stripe listen --forward-to localhost:3000/api/webhook
```

Copy the `whsec_...` value printed by the CLI into `.env.local` as `STRIPE_WEBHOOK_SECRET`, then restart the dev server.

### 6 — Test the full flow

1. Open `http://localhost:3000` → redirected to `/login`
2. Enter your email → click **Send magic link**
3. Open the email link → redirected to `/seats`
4. Click any green seat → redirected to checkout
5. Complete payment with a Stripe test card:

| Scenario | Card number | Expected result |
|----------|-------------|-----------------|
| Payment succeeds | `4242 4242 4242 4242` | Seat turns red (Reserved) |
| Payment declined | `4000 0000 0000 0002` | Seat returns to green (Available) |
| Authentication required | `4000 0025 0000 3155` | 3DS challenge shown |

Use any future expiry date and any 3-digit CVC.

---

## Running Tests

```bash
npm test
```

```
✓ api.reserve.test.ts  (7 tests)   — auth guard, atomic hold, race condition, rollback
✓ api.webhook.test.ts  (7 tests)   — signature verification, idempotency, seat release
✓ api.cron.test.ts     (7 tests)   — cron secret auth, release count, DB error handling

Test Files  3 passed
     Tests  21 passed
```

---

## Production Deployment

### 1 — Connect to Vercel

1. Push the repository to GitHub
2. Import the repo in [Vercel Dashboard](https://vercel.com/new)
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: `seat-reservation`

### 2 — Environment variables

Add the following in **Vercel → Project → Settings → Environment Variables** (scope: Production):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `STRIPE_SECRET_KEY` | `sk_test_...` (or `sk_live_...` for production) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` (or `pk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe webhook endpoint |
| `CRON_SECRET` | Same random string used in `vercel.json` Authorization header |

### 3 — Supabase production settings

In **Supabase → Authentication → URL Configuration**, add your Vercel domain:

- Site URL: `https://your-app.vercel.app`
- Redirect URLs:
  ```
  https://your-app.vercel.app/**
  http://localhost:3000/**
  ```

### 4 — Stripe webhook endpoint

In [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/test/webhooks), create an endpoint:

- **URL:** `https://your-app.vercel.app/api/webhook`
- **Events to listen to:**
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `payment_intent.canceled`

Copy the signing secret (`whsec_...`) into the `STRIPE_WEBHOOK_SECRET` environment variable.

### 5 — Seed the database

Run this SQL in **Supabase → SQL Editor** if the database is empty:

```sql
INSERT INTO seats (label) VALUES
  ('A1'),('A2'),('A3'),('A4'),('A5'),('A6'),
  ('B1'),('B2'),('B3'),('B4'),('B5'),('B6'),
  ('C1'),('C2'),('C3'),('C4'),('C5'),('C6'),
  ('D1'),('D2'),('D3'),('D4'),('D5'),('D6'),
  ('E1'),('E2'),('E3'),('E4'),('E5'),('E6');
```

### 6 — Cron job

`vercel.json` schedules `/api/cron/release-holds` to run daily at midnight UTC. Vercel automatically passes an `Authorization: Bearer <CRON_SECRET>` header; the route rejects any other caller with 401.

> **Note:** Vercel Hobby plan supports daily cron only (`0 0 * * *`). Expired holds are reclaimed inline on the next reservation request so no seat is permanently stuck between cron runs.

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/reserve` | User session | Atomically hold a seat + create Stripe PaymentIntent |
| `POST` | `/api/webhook` | Stripe signature | Confirm or release reservation on payment event |
| `GET` | `/api/reservation-status` | User session | Poll reservation status by `payment_intent` ID |
| `GET` | `/api/cron/release-holds` | `CRON_SECRET` | Release all seats whose hold has expired |
| `GET` | `/api/auth/signout` | User session | Sign out and redirect to `/login` |
| `GET` | `/auth/callback` | — | Exchange PKCE code for session cookies |

---

## Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| No real-time seat updates | Other users' actions visible only on next refresh | Auto-refresh every 60 s |
| Daily cron on Hobby plan | Stale `held` rows linger in DB until midnight | Inline reclaim on next reservation attempt |
| No hold countdown timer | User unaware of remaining hold time | "Held for 10 minutes" note on checkout page |
| No MFA | Lower auth assurance | HttpOnly cookies + refresh token rotation |
| No rate limiting | Reservation API can be called rapidly | Acceptable for assessment scope |
| No confirmation email | User has no receipt | Stripe sends its own receipt in test mode |
