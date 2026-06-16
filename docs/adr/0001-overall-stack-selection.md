# ADR-0001: Overall Technology Stack Selection

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Engineering Team

---

## Context

We need to build a small public seat reservation platform within approximately 2 hours, covering:
- User authentication with a 90-day session
- Display and reservation of seats
- Integrated payment flow
- Seat confirmation upon successful payment

Primary constraint: limited time, so the goal is to demonstrate clear engineering thinking rather than build a complete production system.

---

## Options Considered

### Option A: Next.js + Supabase + Stripe (chosen)
### Option B: Next.js + Self-hosted PostgreSQL + Stripe
### Option C: NestJS + PostgreSQL + Stripe

---

## Decision

**Choose Option A: Next.js 16 (App Router) + Supabase + Stripe Test Mode, deployed on Vercel.**

---

## Rationale

### Why Next.js App Router?
- Full-stack TypeScript in a single repo — eliminates overhead of managing two separate projects
- App Router enables Server Components (seat status rendered server-side, no client round-trip)
- API Routes handle Stripe webhooks without a separate server
- Large community, good documentation, well-suited to a time-constrained assessment

### Why Supabase instead of self-hosted PostgreSQL?
- Auth with JWT + 90-day session is one config line in the dashboard — no need to implement refresh token logic manually
- Row Level Security (RLS) enforces data access rules at the DB layer
- Real-time subscriptions available if live seat status updates are needed
- Free tier is sufficient for an assessment
- **Accepted trade-off:** Vendor lock-in with Supabase. Migration to self-hosted PostgreSQL is feasible later since Supabase uses standard PostgreSQL — only the Auth and Storage layers would need replacing.

### Why Stripe Test Mode?
- The API and webhook flow are identical to production — this is the most important point
- Allows a full payment + webhook demo without real money
- Official TypeScript SDK, fully type-safe
- `stripe listen --forward-to localhost:3000/api/webhook` for local webhook testing

### Why not Option B (Self-hosted)?
- Implementing auth from scratch (session management, secure cookies, 90-day expiry, refresh tokens) would take an extra 1–2 hours
- No meaningful additional value for the assessment's goals

### Why not Option C (NestJS)?
- Over-engineered for a small platform with a 2-hour time budget
- NestJS boilerplate (module, controller, service, DTO, decorators) consumes too much setup time
- Splitting frontend and backend adds deployment complexity without clear benefit at this scale

---

## Consequences

**Positive:**
- Fast to ship; focus stays on business logic
- Auth, DB, and deployment are all managed — minimal operational overhead
- End-to-end TypeScript across the full stack

**Negative / Risks:**
- Dependency on 3 vendors (Vercel, Supabase, Stripe) — single point of failure if one goes down
- Supabase free tier: 500 MB DB, 2 GB bandwidth — not suitable for high production traffic
- Harder to debug when failures occur in a managed service layer

**Architectural decisions influenced by this ADR:**
- [ADR-0002](0002-authentication-strategy.md) — Authentication strategy
- [ADR-0003](0003-concurrency-seat-reservation.md) — Concurrency handling
- [ADR-0004](0004-payment-webhook-vs-redirect.md) — Payment confirmation strategy
