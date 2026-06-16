# Architecture Decision Records (ADR)

This directory contains the key architectural decisions for the seat reservation platform.

## Format

Each ADR follows this structure:
- **Context** — the problem to be solved
- **Options considered** — alternatives with trade-offs
- **Decision** — the chosen approach
- **Rationale** — why this option, why not the others
- **Consequences** — positives, negatives, risks

## Index

| # | Title | Status |
|---|-------|--------|
| [ADR-0001](0001-overall-stack-selection.md) | Overall Technology Stack Selection | Accepted |
| [ADR-0002](0002-authentication-strategy.md) | Authentication Strategy (90-day session) | Accepted |
| [ADR-0003](0003-concurrency-seat-reservation.md) | Concurrency Handling for Seat Reservation (Race Condition) | Accepted |
| [ADR-0004](0004-payment-webhook-vs-redirect.md) | Payment Confirmation: Webhook vs. Redirect | Accepted |

## Core Decisions (summary)

```
Stack:   Next.js 16 + Supabase + Stripe + Vercel
Auth:    Supabase Auth, magic link, JWT 90 days, refresh token rotation
DB:      Atomic UPDATE to prevent race conditions + DB unique constraint as backstop
Payment: Stripe Webhook is the source of truth, not the browser redirect
```
