-- ============================================================
-- Migration: init schema
-- ============================================================

-- Seats table
CREATE TABLE seats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'available',
  held_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  held_until  TIMESTAMPTZ,
  CONSTRAINT valid_status CHECK (status IN ('available', 'held', 'reserved'))
);

-- Reservations table
CREATE TABLE reservations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id            UUID NOT NULL REFERENCES seats(id),
  user_id            UUID NOT NULL REFERENCES auth.users(id),
  payment_intent_id  TEXT UNIQUE,
  status             TEXT NOT NULL DEFAULT 'pending',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_res_status CHECK (status IN ('pending', 'confirmed', 'cancelled'))
);

-- Partial unique index: ensures no two confirmed reservations exist for the same seat
CREATE UNIQUE INDEX one_confirmed_per_seat ON reservations (seat_id) WHERE (status = 'confirmed');

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Anyone can read the seat list
CREATE POLICY "seats_read_all"
  ON seats FOR SELECT
  USING (true);

-- Only the service role can UPDATE seats (server-side API routes only)
CREATE POLICY "seats_update_service"
  ON seats FOR UPDATE
  USING (auth.role() = 'service_role');

-- Users can only read their own reservations
CREATE POLICY "reservations_read_own"
  ON reservations FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service role can write reservations
CREATE POLICY "reservations_write_service"
  ON reservations FOR ALL
  USING (auth.role() = 'service_role');
