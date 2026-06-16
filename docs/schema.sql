-- ============================================================
-- Seat Reservation Platform — Database Schema
-- Run in Supabase SQL Editor
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

-- Partial unique index: ensures no two confirmed reservations exist for the same seat.
-- Uses CREATE UNIQUE INDEX instead of inline CONSTRAINT because PostgreSQL does not
-- support WHERE clauses in table-level constraints.
CREATE UNIQUE INDEX one_confirmed_per_seat ON reservations (seat_id) WHERE (status = 'confirmed');

-- Seed: 5 rows x 6 seats = 30 seats
INSERT INTO seats (label) VALUES
  ('A1'), ('A2'), ('A3'), ('A4'), ('A5'), ('A6'),
  ('B1'), ('B2'), ('B3'), ('B4'), ('B5'), ('B6'),
  ('C1'), ('C2'), ('C3'), ('C4'), ('C5'), ('C6'),
  ('D1'), ('D2'), ('D3'), ('D4'), ('D5'), ('D6'),
  ('E1'), ('E2'), ('E3'), ('E4'), ('E5'), ('E6');

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Anyone can read the seat list (public)
CREATE POLICY "seats_read_all"
  ON seats FOR SELECT
  USING (true);

-- Only the service role (server) can UPDATE seats — prevents direct browser calls
CREATE POLICY "seats_update_service"
  ON seats FOR UPDATE
  USING (auth.role() = 'service_role');

-- Users can only read their own reservations
CREATE POLICY "reservations_read_own"
  ON reservations FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service role can INSERT/UPDATE reservations
CREATE POLICY "reservations_write_service"
  ON reservations FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Helper function: release expired holds (used by cron job)
-- ============================================================

CREATE OR REPLACE FUNCTION release_expired_holds()
RETURNS TABLE(released_seat_id UUID, released_label TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE seats
  SET status = 'available', held_by = NULL, held_until = NULL
  WHERE status = 'held'
    AND held_until < NOW()
  RETURNING id, label;
END;
$$;
