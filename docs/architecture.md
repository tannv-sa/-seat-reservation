# Architecture Diagrams

---

## 1. System Overview

High-level view of all services and how they connect.

```mermaid
graph TB
    subgraph Browser["Browser (Client)"]
        UI["Next.js React UI<br/>SeatCard · CheckoutClient<br/>SeatsRefresh · SuccessPoller"]
        StripeJS["Stripe.js<br/>(payment form)"]
    end

    subgraph Vercel["Vercel (Edge + Serverless)"]
        MW["proxy.ts<br/>Auth Middleware"]
        SC["Server Components<br/>seats/page · success/page"]
        AR["API Routes"]
        CRON["Vercel Cron<br/>0 0 * * *"]

        subgraph AR["API Routes"]
            RESERVE["/api/reserve<br/>Atomic hold +<br/>PaymentIntent"]
            WEBHOOK["/api/webhook<br/>Stripe events<br/>(source of truth)"]
            STATUS["/api/reservation-status<br/>Poll confirmation"]
            CRONR["/api/cron/release-holds<br/>Release stale holds"]
            SIGNOUT["/api/auth/signout"]
            CALLBACK["/auth/callback<br/>PKCE exchange"]
        end
    end

    subgraph Supabase["Supabase (Managed)"]
        SBAUTH["Auth Service<br/>Magic Link · PKCE · JWT"]
        DB[("PostgreSQL<br/>seats · reservations<br/>RLS policies")]
    end

    subgraph Stripe["Stripe (Managed)"]
        STRIPAPI["Stripe API<br/>PaymentIntent"]
        STRIPHOOK["Stripe Webhooks<br/>payment_intent.*"]
        STRIPMAIL["Stripe Email<br/>Receipt"]
    end

    EMAIL["Email Provider<br/>(magic link delivery)"]

    %% Browser ↔ Vercel
    UI -->|"page navigation"| MW
    MW -->|"authenticated"| SC
    MW -->|"unauthenticated → /login"| UI
    UI -->|"POST /api/reserve"| RESERVE
    UI -->|"GET /api/reservation-status"| STATUS
    StripeJS -->|"confirmPayment()"| STRIPAPI

    %% Vercel ↔ Supabase
    SC -->|"SELECT seats, reservations"| DB
    RESERVE -->|"UPDATE seats (atomic hold)"| DB
    RESERVE -->|"INSERT reservations"| DB
    WEBHOOK -->|"UPDATE reservations + seats"| DB
    CRONR -->|"UPDATE seats (release expired)"| DB
    CALLBACK -->|"exchangeCodeForSession()"| SBAUTH
    MW -->|"getUser()"| SBAUTH
    SIGNOUT -->|"signOut()"| SBAUTH

    %% Vercel ↔ Stripe
    RESERVE -->|"paymentIntents.create()"| STRIPAPI
    STRIPHOOK -->|"POST signature-verified"| WEBHOOK
    STRIPAPI -->|"client_secret → UI"| UI

    %% Supabase ↔ Browser
    SBAUTH -->|"magic link email"| EMAIL
    EMAIL -->|"user clicks link"| CALLBACK
    SBAUTH -->|"session cookies"| UI

    %% Cron trigger
    CRON -->|"Authorization: Bearer CRON_SECRET"| CRONR

    %% Stripe email
    STRIPAPI -->|"payment receipt"| STRIPMAIL

    style Browser fill:#dbeafe,stroke:#3b82f6
    style Vercel fill:#f0fdf4,stroke:#22c55e
    style Supabase fill:#fef3c7,stroke:#f59e0b
    style Stripe fill:#fdf2f8,stroke:#a855f7
```

---

## 2. Seat Reservation Flow

End-to-end flow from seat selection to confirmed reservation.

```mermaid
sequenceDiagram
    actor User
    participant UI as Browser (Next.js)
    participant Reserve as /api/reserve
    participant DB as Supabase DB
    participant Stripe as Stripe API
    participant Webhook as /api/webhook

    User->>UI: Click available seat
    UI->>Reserve: POST /api/reserve { seatId }

    Reserve->>DB: SELECT reservations WHERE user_id=X AND status='confirmed'
    DB-->>Reserve: null (no existing reservation)

    Note over Reserve,DB: Atomic hold — single UPDATE, PostgreSQL serialises concurrent writers
    Reserve->>DB: UPDATE seats SET status='held', held_until=now+10m<br/>WHERE id=seatId AND (status='available'<br/>OR (status='held' AND held_until < now))
    DB-->>Reserve: seat row (or null if already taken)

    alt Seat taken
        Reserve-->>UI: 409 { error: "seat just taken" }
        UI-->>User: Error — choose another seat
    else Hold succeeded
        Reserve->>Stripe: paymentIntents.create({ amount, metadata: { seatId, userId } })
        Stripe-->>Reserve: { id, client_secret }
        Reserve->>DB: INSERT reservations { seat_id, user_id, payment_intent_id, status:'pending' }
        Reserve-->>UI: 200 { clientSecret, seatLabel }

        UI->>UI: Load Stripe Elements (checkout form)
        User->>UI: Enter card details → Submit

        UI->>Stripe: confirmPayment(clientSecret)

        alt Payment succeeded
            Stripe->>Webhook: POST payment_intent.succeeded (signed)
            Webhook->>Webhook: Verify Stripe signature
            Webhook->>DB: SELECT reservations WHERE payment_intent_id=X
            Webhook->>DB: UPDATE reservations SET status='confirmed'<br/>UPDATE seats SET status='reserved', held_by=null
            Webhook-->>Stripe: 200 { received: true }
            Stripe->>UI: Redirect to /success?payment_intent=X
            UI->>UI: Poll /api/reservation-status
            UI-->>User: Booking confirmed 🎉
        else Payment failed / canceled
            Stripe->>Webhook: POST payment_intent.payment_failed
            Webhook->>DB: UPDATE reservations SET status='cancelled'<br/>UPDATE seats SET status='available'
            UI-->>User: Payment failed — seat released
        end
    end
```

---

## 3. Magic Link Authentication Flow

PKCE-based magic link flow from login to session.

```mermaid
sequenceDiagram
    actor User
    participant Browser as Browser
    participant Login as /login (Client)
    participant Callback as /auth/callback (Route Handler)
    participant SupaAuth as Supabase Auth
    participant Email as Email Provider
    participant MW as proxy.ts (Middleware)

    User->>Login: Enter email → Send magic link

    Login->>SupaAuth: signInWithOtp(email,<br/>emailRedirectTo: /auth/callback?next=/seats)
    Note over Login,SupaAuth: Supabase generates code_verifier,<br/>stores in cookie, sends code_challenge to server
    SupaAuth->>Email: Send magic link email
    SupaAuth-->>Login: OK (email sent)
    Login-->>User: "Check your email"

    User->>Email: Open email → Click magic link
    Email->>Callback: GET /auth/callback?code=XXX&next=/seats

    Note over Callback,SupaAuth: PKCE exchange — code + verifier → session tokens
    Callback->>SupaAuth: exchangeCodeForSession(code)<br/>(reads code_verifier from request cookies)
    SupaAuth-->>Callback: { access_token, refresh_token }

    Note over Callback: Cookies set directly on NextResponse.redirect()<br/>so middleware sees the session on the very next request
    Callback-->>Browser: 302 → /seats<br/>Set-Cookie: sb-access-token, sb-refresh-token

    Browser->>MW: GET /seats (with session cookies)
    MW->>SupaAuth: getUser() — validates JWT
    SupaAuth-->>MW: { user }
    MW-->>Browser: Allow — render /seats

    Note over Browser,SupaAuth: Refresh token rotation: each use issues a new refresh token<br/>and invalidates the previous one (90-day rolling session)
```

---

## 4. Expired Hold Reclaim Strategy

How expired holds are recovered — two complementary mechanisms.

```mermaid
flowchart TD
    A([User clicks a seat]) --> B["POST /api/reserve"]
    B --> C["Atomic UPDATE seats<br/>WHERE status = 'available'<br/>OR status = 'held' AND held_until &lt; NOW()"]
    C --> E{Rows returned?}

    E -->|"1 row — hold acquired"| F["Create Stripe PaymentIntent<br/>INSERT reservation status=pending"]
    E -->|"0 rows — seat unavailable"| G["409 Seat just taken"]

    F --> P([Proceed to checkout])
    G --> R([User picks another seat])

    subgraph Cron["Cron fallback — daily at midnight UTC"]
        H([Vercel Cron]) --> I["/api/cron/release-holds"]
        I --> J["UPDATE seats SET status = available<br/>WHERE status = held AND held_until &lt; NOW()"]
        J --> K["UPDATE reservations SET status = cancelled<br/>WHERE seat_id IN released seats"]
        K --> L([Seats available again])
    end

    subgraph UILayer["UI normalisation — no DB write"]
        M([Seats page renders]) --> N{"seat.status = held<br/>AND held_until &lt; NOW?"}
        N -->|yes| O["Display as Available<br/>SeatCard shows green"]
        N -->|no| Q["Display as On Hold<br/>SeatCard shows yellow"]
    end

    style C fill:#dbeafe,stroke:#3b82f6
    style F fill:#bbf7d0,stroke:#16a34a
    style G fill:#fee2e2,stroke:#dc2626
    style J fill:#bbf7d0,stroke:#16a34a
    style O fill:#bbf7d0,stroke:#16a34a
```

---

## 5. Database Schema

```mermaid
erDiagram
    SEATS {
        uuid id PK
        text label "A1 … E6"
        text status "available | held | reserved"
        uuid held_by FK "→ auth.users(id)"
        timestamptz held_until
    }

    RESERVATIONS {
        uuid id PK
        uuid seat_id FK "→ seats(id)"
        uuid user_id FK "→ auth.users(id)"
        text payment_intent_id UK "Stripe PI id"
        text status "pending | confirmed | cancelled"
        timestamptz created_at
    }

    AUTH_USERS {
        uuid id PK
        text email
    }

    AUTH_USERS ||--o{ SEATS : "holds"
    AUTH_USERS ||--o{ RESERVATIONS : "owns"
    SEATS ||--o{ RESERVATIONS : "has"
```

**Concurrency safety:**
- `UPDATE seats … WHERE status='available' OR (status='held' AND held_until < now)` — atomic; PostgreSQL row-level lock ensures exactly one writer wins
- `CREATE UNIQUE INDEX one_confirmed_per_seat ON reservations (seat_id) WHERE (status = 'confirmed')` — DB-level backstop preventing double-confirmed reservations even if application logic has a bug

---

## 6. Security Boundaries

```mermaid
flowchart LR
    subgraph Public["Public (no auth)"]
        A["/login"]
        B["/auth/callback"]
    end

    subgraph Protected["Protected (user session required)"]
        C["/seats"]
        D["/checkout/[seatId]"]
        E["/success"]
        F["/api/reserve"]
        G["/api/reservation-status"]
        H["/api/auth/signout"]
    end

    subgraph ServiceOnly["Service role only (bypasses RLS)"]
        I["/api/webhook<br/>Stripe signature required"]
        J["/api/cron/release-holds<br/>CRON_SECRET required"]
    end

    subgraph DB["Supabase RLS Policies"]
        K["seats: SELECT → anon<br/>seats: UPDATE → service_role only"]
        L["reservations: SELECT → own rows only<br/>reservations: ALL → service_role only"]
    end

    MW(["proxy.ts middleware<br/>getUser() on every request"])

    MW -->|"user = null"| A
    MW -->|"user present"| Protected
    I --- K
    J --- K
    F --- L

    style Public fill:#fef9c3,stroke:#ca8a04
    style Protected fill:#dcfce7,stroke:#16a34a
    style ServiceOnly fill:#fee2e2,stroke:#dc2626
    style DB fill:#ede9fe,stroke:#7c3aed
```
