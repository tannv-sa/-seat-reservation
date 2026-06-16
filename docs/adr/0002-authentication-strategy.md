# ADR-0002: Authentication Strategy (90-day session)

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Engineering Team

---

## Context

The system requires users to log in with a session lasting 90 days. Key decisions needed:
1. Authentication mechanism (OAuth, magic link, password-based)
2. Session and token expiry management
3. Cookie security and CSRF protection

---

## Options Considered

### Option A: Supabase Auth with magic link / OAuth (chosen)
### Option B: Custom JWT with bcrypt password
### Option C: NextAuth.js (Auth.js)

---

## Decision

**Choose Supabase Auth with Email Magic Link as the primary method.**

Session configuration:
```
JWT expiry: 7,776,000 seconds (90 days)
Refresh token rotation: enabled
Cookie: HttpOnly, Secure, SameSite=Lax
```

---

## Rationale

### Why Magic Link instead of Password?
- No password hash to store — reduces attack surface (no password DB to leak)
- Better user experience — no passwords to remember
- Appropriate for a public booking platform where users log in infrequently

### Why Supabase Auth instead of a custom implementation?
- 90-day JWT expiry is a single config value in the Supabase dashboard
- Automatic refresh token rotation — if a token is stolen, rotation invalidates the old token
- No need to write auth middleware, session store, or token revocation logic
- **Trade-off:** No control over the token storage backend; dependent on Supabase's revoke API for force logout

### Why not NextAuth.js?
- NextAuth requires configuring a DB adapter, providers, and callbacks — more than needed here
- Supabase Auth integrates more naturally with Supabase DB (RLS policies use `auth.uid()` directly)
- An unnecessary extra dependency when Supabase already covers this

### Security of a 90-day session
Long sessions increase risk if a token is compromised. Mitigations:
- HttpOnly cookie — JavaScript cannot read the token
- Secure flag — only sent over HTTPS
- Refresh token rotation — each use of the refresh token invalidates the previous one
- Supabase supports server-side session revocation (e.g. when a user changes their email)

---

## Consequences

**Positive:**
- No stored passwords — no password breach risk
- Refresh token rotation limits the impact of token theft
- RLS policies in PostgreSQL use `auth.uid()` — security enforced at the DB layer

**Negative / Risks:**
- Magic link depends on email delivery — delays in email affect UX
- 90-day session: if a device is lost, an attacker has a large window (mitigated by server-side revoke)
- No MFA — acceptable for the current scope, should be added later

**Out of scope (future work):**
- Rate limiting magic link requests to prevent spam
- Audit log for login/logout events
- Email notification on login from a new device
