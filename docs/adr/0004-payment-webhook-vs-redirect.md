# ADR-0004: Xác nhận đặt chỗ qua Webhook vs. Redirect sau thanh toán

- **Trạng thái:** Accepted
- **Ngày:** 2026-06-16
- **Người quyết định:** Engineering Team

---

## Bối cảnh

Sau khi người dùng thanh toán thành công, hệ thống cần xác nhận đặt chỗ và cập nhật trạng thái ghế từ `held` → `reserved`. Câu hỏi: *cái gì là nguồn sự thật (source of truth) để trigger hành động này?*

**Hai luồng có thể xảy ra:**

**Luồng A — Browser Redirect (không an toàn):**
```
User thanh toán → Stripe redirect về /success → App cập nhật DB → Ghế reserved
```

**Luồng B — Stripe Webhook (an toàn):**
```
User thanh toán → Stripe gọi /api/webhook → App cập nhật DB → Ghế reserved
                                                ↑
                              Browser có thể crash, mạng có thể đứt
                              Webhook vẫn chạy độc lập
```

---

## Các lựa chọn đã cân nhắc

### Option A: Chỉ dùng browser redirect (không chọn)
### Option B: Chỉ dùng Stripe Webhook (được chọn)
### Option C: Kết hợp cả hai với webhook là primary

---

## Quyết định

**Chọn Option B: Stripe Webhook là nguồn sự thật duy nhất để xác nhận reservation.**

Browser redirect về `/success` chỉ là UX — không trigger bất kỳ DB operation nào.

### Luồng hoàn chỉnh

```
1. User chọn ghế → POST /api/reserve → ghế status = 'held'
2. App tạo Stripe PaymentIntent → trả về client_secret cho frontend
3. Frontend dùng Stripe.js để xử lý thanh toán
4. Stripe xử lý payment:
   a. Thành công → Stripe POST đến /api/webhook với event 'payment_intent.succeeded'
   b. Thất bại  → Stripe POST đến /api/webhook với event 'payment_intent.payment_failed'
5. Webhook handler:
   - Verify Stripe signature (chống giả mạo)
   - Idempotency check (tránh xử lý 2 lần)
   - Cập nhật reservation status = 'confirmed', seat status = 'reserved'
6. Stripe redirect user về /success (chỉ hiển thị UI thành công)
7. /success page poll hoặc query trạng thái thực từ DB để hiển thị
```

### Webhook Handler (idempotent)

```typescript
// POST /api/webhook
export async function POST(req: Request) {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature')!;

  // Bước 1: Verify signature — từ chối nếu không phải Stripe
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;

    // Bước 2: Idempotency check — Stripe có thể gửi webhook nhiều lần
    const existing = await db.reservation.findUnique({
      where: { paymentIntentId: intent.id }
    });
    if (existing?.status === 'confirmed') {
      return new Response(null, { status: 200 }); // đã xử lý rồi, bỏ qua
    }

    // Bước 3: Cập nhật trong transaction
    await db.$transaction([
      db.reservation.update({
        where: { paymentIntentId: intent.id },
        data: { status: 'confirmed' }
      }),
      db.seat.update({
        where: { id: existing!.seatId },
        data: { status: 'reserved', heldBy: null, heldUntil: null }
      })
    ]);
  }

  if (event.type === 'payment_intent.payment_failed') {
    // Release seat hold về available
    const intent = event.data.object as Stripe.PaymentIntent;
    await releaseSeatHold(intent.id);
  }

  return new Response(null, { status: 200 });
}
```

---

## Lý do

### Tại sao không dùng browser redirect (Option A)?

**Kịch bản lỗi với redirect:**
- User thanh toán xong → mạng đứt → không bao giờ về được `/success` → ghế không được confirm
- User đóng tab ngay sau khi Stripe confirm nhưng trước khi redirect
- Browser crash sau payment
- User giả mạo request đến `/success` mà không thực sự trả tiền

Tất cả những kịch bản này đều gây ra "ghost payment" — Stripe đã thu tiền nhưng ghế không được đặt. Đây là lỗi nghiêm trọng nhất trong hệ thống payment.

### Tại sao Webhook là đúng?

- Webhook chạy server-to-server (Stripe → App) — không phụ thuộc browser của user
- Stripe retry webhook nếu server trả về lỗi (retry với exponential backoff)
- Stripe signature verification đảm bảo request thực sự đến từ Stripe
- Đây là pattern chuẩn của mọi payment integration production

### Tại sao cần Idempotency?

Stripe có thể gửi cùng một webhook event nhiều lần (network retry, delivery guarantee). Nếu không có idempotency check, một payment có thể trigger confirm reservation 2 lần → có thể gây lỗi DB constraint hoặc unexpected behavior.

### Tại sao không kết hợp cả hai (Option C)?

- Thêm logic phức tạp không cần thiết
- Redirect chạy trước webhook trong nhiều trường hợp → race condition giữa hai nơi cập nhật DB
- Một source of truth đơn giản hơn, ít bug hơn

---

## Hệ quả

**Tích cực:**
- Không bao giờ có ghost payment (tiền thu mà ghế không được đặt)
- Hệ thống resilient với network failure, browser crash
- Stripe retry đảm bảo webhook được xử lý cuối cùng (eventual consistency)
- Audit trail đầy đủ từ Stripe dashboard

**Tiêu cực / Rủi ro:**
- Cần public HTTPS endpoint cho webhook — dùng ngrok hoặc Vercel khi development
- Độ trễ giữa payment và confirmation (webhook delivery có thể mất vài giây)
- `/success` page cần poll DB hoặc dùng Supabase Realtime để hiển thị trạng thái chính xác, không chỉ dựa vào Stripe redirect params
- Cần lưu `STRIPE_WEBHOOK_SECRET` an toàn trong environment variables

**Cần làm thêm (ngoài scope assessment):**
- Logging tất cả webhook events vào bảng `webhook_events` để debug
- Alerting nếu webhook liên tục thất bại (e.g. Sentry, Datadog)
- Dead letter queue cho webhook events không xử lý được sau N lần retry
