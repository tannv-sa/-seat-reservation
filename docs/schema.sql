-- ============================================================
-- Seat Reservation Platform — Database Schema
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- Bảng ghế ngồi
CREATE TABLE seats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'available',
  held_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  held_until  TIMESTAMPTZ,
  CONSTRAINT valid_status CHECK (status IN ('available', 'held', 'reserved'))
);

-- Bảng đặt chỗ
CREATE TABLE reservations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id            UUID NOT NULL REFERENCES seats(id),
  user_id            UUID NOT NULL REFERENCES auth.users(id),
  payment_intent_id  TEXT UNIQUE,
  status             TEXT NOT NULL DEFAULT 'pending',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_res_status CHECK (status IN ('pending', 'confirmed', 'cancelled'))
);

-- Partial unique index: không bao giờ có 2 confirmed reservation cho cùng một ghế
-- Dùng CREATE UNIQUE INDEX thay vì inline CONSTRAINT vì PostgreSQL không hỗ trợ WHERE trong table constraint
CREATE UNIQUE INDEX one_confirmed_per_seat ON reservations (seat_id) WHERE (status = 'confirmed');

-- Seed 3 ghế ban đầu
INSERT INTO seats (label) VALUES ('A1'), ('A2'), ('A3');

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Mọi người đều đọc được danh sách ghế (public)
CREATE POLICY "seats_read_all"
  ON seats FOR SELECT
  USING (true);

-- Chỉ service role (server) được UPDATE ghế — không cho browser client gọi trực tiếp
CREATE POLICY "seats_update_service"
  ON seats FOR UPDATE
  USING (auth.role() = 'service_role');

-- User chỉ đọc được reservation của chính mình
CREATE POLICY "reservations_read_own"
  ON reservations FOR SELECT
  USING (auth.uid() = user_id);

-- Chỉ service role được INSERT/UPDATE reservations
CREATE POLICY "reservations_write_service"
  ON reservations FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Helper function: release expired holds (dùng cho cron)
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
