# ADR-0003: Xử lý đồng thời khi đặt ghế (Race Condition)

- **Trạng thái:** Accepted
- **Ngày:** 2026-06-16
- **Người quyết định:** Engineering Team

---

## Bối cảnh

Đây là vấn đề kỹ thuật quan trọng nhất của hệ thống đặt chỗ: nhiều người dùng có thể chọn cùng một ghế trống cùng lúc. Nếu không xử lý đúng, cùng một ghế có thể được đặt bởi nhiều người.

**Luồng nguy hiểm (race condition):**
```
User A: đọc ghế #1 → trạng thái "available"
User B: đọc ghế #1 → trạng thái "available"
User A: cập nhật → "reserved"
User B: cập nhật → "reserved"  ← DOUBLE BOOKING
```

---

## Các lựa chọn đã cân nhắc

### Option A: Optimistic Locking với atomic UPDATE (được chọn)
### Option B: Pessimistic Locking (SELECT FOR UPDATE)
### Option C: Application-level lock (Redis / in-memory)
### Option D: Queue-based serialization

---

## Quyết định

**Chọn Option A: Atomic UPDATE với điều kiện `WHERE status = 'available'` + seat hold mechanism + DB unique constraint làm backstop.**

### Schema

```sql
CREATE TABLE seats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,            -- 'A1', 'A2', 'A3'
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
  status             TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | cancelled
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_res_status CHECK (status IN ('pending', 'confirmed', 'cancelled'))
);

-- Partial unique index — phải dùng CREATE UNIQUE INDEX riêng, không thể inline WHERE trong table constraint
CREATE UNIQUE INDEX one_confirmed_per_seat ON reservations (seat_id) WHERE (status = 'confirmed');
```

### Logic đặt ghế (atomic)

```sql
-- Bước 1: Atomic hold — chỉ thành công nếu ghế đang available
UPDATE seats
SET
  status     = 'held',
  held_by    = $user_id,
  held_until = NOW() + INTERVAL '10 minutes'
WHERE id = $seat_id
  AND status = 'available'
RETURNING *;

-- Nếu 0 rows trả về → ghế đã bị lấy → báo lỗi cho user
```

---

## Lý do

### Tại sao Optimistic Locking (Option A)?
- **Atomic ở tầng DB** — `WHERE status = 'available'` và UPDATE là một operation duy nhất, PostgreSQL đảm bảo serializable
- Không giữ lock trong suốt quá trình thanh toán (không block các ghế khác)
- Đơn giản, không cần infrastructure thêm (Redis, queue)
- Phù hợp với low-to-medium concurrency (3 ghế, không phải 10,000 vé concert)

### Tại sao không dùng Pessimistic Locking (Option B)?
- `SELECT FOR UPDATE` giữ lock trong DB transaction
- Nếu transaction kéo dài (user đang nhập thẻ), các request khác bị block
- Dễ gây deadlock nếu không cẩn thận với thứ tự lock
- Over-kill cho use case này

### Tại sao không dùng Redis Lock (Option C)?
- Thêm một infrastructure dependency (Redis server)
- Distributed lock phức tạp hơn (Redlock algorithm, TTL, network partition)
- Nếu Redis down, toàn bộ đặt chỗ bị block
- Không cần thiết khi PostgreSQL đã có thể xử lý atomic operations

### Tại sao không dùng Queue (Option D)?
- Queue serializes tất cả requests — throughput rất thấp
- Thêm độ phức tạp (BullMQ, worker process, retry logic)
- Phù hợp khi có millions of concurrent users, không phải 3 ghế

### Seat Hold Mechanism (10 phút)
Khi user chọn ghế nhưng chưa thanh toán, ghế cần được "giữ" tạm thời:
- Hold duration: 10 phút (đủ để hoàn thành thanh toán)
- Release expired holds: Vercel Cron chạy mỗi phút

```typescript
// /api/cron/release-holds — chạy mỗi phút qua Vercel Cron
await db.query(`
  UPDATE seats
  SET status = 'available', held_by = NULL, held_until = NULL
  WHERE status = 'held' AND held_until < NOW()
`);
```

### DB Unique Constraint làm backstop
```sql
CONSTRAINT one_active_reservation_per_seat
  UNIQUE (seat_id) WHERE (status = 'confirmed')
```
Dù có bug ở application layer, DB constraint đảm bảo không bao giờ có 2 confirmed reservation cho cùng một ghế.

---

## Hệ quả

**Tích cực:**
- Không thể double-book — đảm bảo bởi cả application logic lẫn DB constraint
- Không cần thêm infrastructure
- Dễ test (có thể simulate race condition bằng concurrent requests)

**Tiêu cực / Rủi ro:**
- User thứ hai nhận error "Ghế đã được chọn" phải refresh và chọn lại — UX không mượt
- Seat hold 10 phút có thể bị lạm dụng (user hold nhiều ghế rồi không thanh toán) — acceptable cho 3 ghế
- Vercel Cron có độ chính xác ~1 phút — một số ghế bị hold lâu hơn 10 phút một chút

**Cần làm thêm (ngoài scope assessment):**
- Real-time UI update khi ghế bị hold/released (Supabase Realtime)
- Countdown timer trên UI cho user biết còn bao nhiêu thời gian giữ ghế
- Rate limit API đặt ghế để chống abuse
