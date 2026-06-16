# ADR-0003: Concurrency Handling for Seat Reservation (Race Condition)

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Engineering Team

---

## Context

This is the most important technical problem in a seat reservation system: multiple users can select the same available seat at the same time. Without proper handling, the same seat could be booked by more than one person.

**The dangerous flow (race condition):**
```
User A: reads seat #1 → status "available"
User B: reads seat #1 → status "available"
User A: updates → "reserved"
User B: updates → "reserved"  ← DOUBLE BOOKING
```

---

## Options Considered

### Option A: Optimistic locking with atomic UPDATE (chosen)
### Option B: Pessimistic locking (SELECT FOR UPDATE)
### Option C: Application-level lock (Redis / in-memory)
### Option D: Queue-based serialization

---

## Decision

**Choose Option A: Atomic UPDATE with `WHERE status = 'available'` condition + seat hold mechanism + DB unique constraint as a backstop.**

### Schema

```sql
CREATE TABLE seats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'available',  -- available | held | reserved
  held_by     UUID REFERENCES auth.users(id),
  held_until  TIMESTAMPTZ,
  CONSTRAINT valid_status CHECK (status IN ('available', 'held', 'reserved'))
);

CREATE TABLE reservations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id            UUID NOT NULL REFERENCES seats(id),
  user_id            UUID NOT NULL REFERENCES auth.users(id),
  payment_intent_id  TEXT UNIQUE,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | cancelled
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_res_status CHECK (status IN ('pending', 'confirmed', 'cancelled'))
);

-- Partial unique index — must use CREATE UNIQUE INDEX separately;
-- PostgreSQL does not support WHERE in table-level CONSTRAINT.
CREATE UNIQUE INDEX one_confirmed_per_seat ON reservations (seat_id) WHERE (status = 'confirmed');
```

### Atomic seat hold logic

```sql
-- Step 1: Atomic hold — succeeds only if the seat is available OR its hold has expired
UPDATE seats
SET
  status     = 'held',
  held_by    = $user_id,
  held_until = NOW() + INTERVAL '10 minutes'
WHERE id = $seat_id
  AND (status = 'available' OR (status = 'held' AND held_until < NOW()))
RETURNING *;

-- If 0 rows returned → seat is taken → return 409 to the user
```

---

## Rationale

### Why Optimistic Locking (Option A)?
- **Atomic at the DB layer** — `WHERE status = 'available'` and the UPDATE are a single operation; PostgreSQL guarantees a single winner
- Does not hold a lock during the payment flow (other seats are not blocked)
- Simple, no extra infrastructure (no Redis, no queue)
- Appropriate for low-to-medium concurrency (a small venue, not 10,000 concert tickets)

### Why not Pessimistic Locking (Option B)?
- `SELECT FOR UPDATE` holds a DB-level lock for the entire transaction
- If the transaction is long-lived (user is entering card details), other requests are blocked
- Risk of deadlock if lock ordering is not carefully managed
- Overkill for this use case

### Why not Redis Lock (Option C)?
- Adds an infrastructure dependency (Redis server)
- Distributed locking is complex (Redlock algorithm, TTL, network partition handling)
- If Redis goes down, all reservations are blocked
- Unnecessary when PostgreSQL can handle atomic operations natively

### Why not Queue (Option D)?
- A queue serialises all requests — very low throughput
- Adds complexity (BullMQ, worker process, retry logic)
- Appropriate for millions of concurrent users, not for a small venue

### Seat Hold Mechanism (10 minutes)
When a user selects a seat but has not yet paid, the seat is temporarily held:
- Hold duration: 10 minutes (sufficient to complete payment)
- Expired holds are reclaimed **inline** on the next reservation attempt via the same atomic UPDATE condition (`status = 'held' AND held_until < NOW()`), so no seat is stuck regardless of cron schedule
- A Vercel Cron job (`/api/cron/release-holds`) also runs daily to clean up any remaining stale holds in the DB — on Vercel Hobby plan only daily crons are supported

### DB Unique Constraint as backstop
```sql
CREATE UNIQUE INDEX one_confirmed_per_seat ON reservations (seat_id) WHERE (status = 'confirmed');
```
Even if there is an application-layer bug, the DB constraint guarantees that no two confirmed reservations can ever exist for the same seat.

---

## Consequences

**Positive:**
- Double booking is impossible — enforced by both application logic and DB constraint
- No additional infrastructure required
- Easy to test (race conditions can be simulated with concurrent requests)

**Negative / Risks:**
- The second user receives a "seat just taken" error and must choose another — not a seamless UX
- The 10-minute hold could be abused (a user holding seats without paying) — acceptable for a small venue
- Cron job runs at most once per day on Hobby plan; expired holds are reclaimed inline on the next request so there is no user-visible impact

**Out of scope (future work):**
- Real-time UI updates when a seat is held or released (Supabase Realtime)
- Countdown timer in the UI showing remaining hold time
- Rate limiting the reservation API to prevent abuse
