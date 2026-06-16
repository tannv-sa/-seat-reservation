-- ============================================================
-- Migration: init schema
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
CREATE UNIQUE INDEX one_confirmed_per_seat ON reservations (seat_id) WHERE (status = 'confirmed');

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Ai cũng đọc được danh sách ghế
CREATE POLICY "seats_read_all"
  ON seats FOR SELECT
  USING (true);

-- Chỉ service role được UPDATE ghế (server-side API route)
CREATE POLICY "seats_update_service"
  ON seats FOR UPDATE
  USING (auth.role() = 'service_role');

-- User chỉ đọc reservation của chính mình
CREATE POLICY "reservations_read_own"
  ON reservations FOR SELECT
  USING (auth.uid() = user_id);

-- Chỉ service role được ghi reservations
CREATE POLICY "reservations_write_service"
  ON reservations FOR ALL
  USING (auth.role() = 'service_role');
