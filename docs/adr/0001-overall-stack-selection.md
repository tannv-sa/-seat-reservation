# ADR-0001: Lựa chọn Technology Stack tổng thể

- **Trạng thái:** Accepted
- **Ngày:** 2026-06-16
- **Người quyết định:** Engineering Team

---

## Bối cảnh

Cần xây dựng một nền tảng đặt chỗ ngồi công khai nhỏ trong khoảng 2 giờ, bao gồm:
- Xác thực người dùng với session 90 ngày
- Hiển thị và đặt 3 ghế ngồi
- Luồng thanh toán tích hợp
- Xử lý đặt chỗ sau khi thanh toán thành công

Ràng buộc chính: thời gian hạn chế, cần demo được tư duy kỹ thuật rõ ràng hơn là xây dựng hệ thống hoàn chỉnh.

---

## Các lựa chọn đã cân nhắc

### Option A: Next.js + Supabase + Stripe (được chọn)
### Option B: Next.js + Self-hosted PostgreSQL + Stripe
### Option C: NestJS + PostgreSQL + Stripe

---

## Quyết định

**Chọn Option A: Next.js 14 (App Router) + Supabase + Stripe Test Mode, deploy trên Vercel.**

---

## Lý do

### Tại sao Next.js 14 App Router?
- Full-stack TypeScript trong một repo duy nhất — giảm overhead quản lý hai project riêng biệt
- App Router cho phép Server Components (render seat status phía server, không cần client round-trip)
- API Routes xử lý webhook Stripe mà không cần server riêng
- Cộng đồng lớn, tài liệu tốt, phù hợp với bài assessment có giới hạn thời gian

### Tại sao Supabase thay vì tự host PostgreSQL?
- Auth với JWT + session 90 ngày cấu hình sẵn, không cần tự implement refresh token logic
- Row Level Security (RLS) cho phép enforce quyền truy cập dữ liệu trực tiếp ở tầng DB
- Real-time subscription nếu cần cập nhật trạng thái ghế live
- Free tier đủ dùng cho assessment
- **Đánh đổi chấp nhận được:** Vendor lock-in với Supabase. Migration sang self-hosted PostgreSQL sau này khả thi vì Supabase dùng PostgreSQL tiêu chuẩn — chỉ cần thay thế Auth và Storage layer.

### Tại sao Stripe Test Mode?
- API và webhook flow giống hệt production — đây là điểm quan trọng nhất
- Cho phép demo toàn bộ luồng payment + webhook mà không cần tiền thật
- SDK TypeScript chính thức, type-safe
- `stripe listen --forward-to localhost:3000/api/webhook` để test webhook locally

### Tại sao không chọn Option B (Self-hosted)?
- Tự implement auth (session management, secure cookie, 90-day expiry, refresh) tốn thêm 1-2 giờ
- Không có giá trị gia tăng đáng kể cho mục tiêu của bài assessment

### Tại sao không chọn Option C (NestJS)?
- Over-engineered cho 3 ghế với 2 giờ thời gian
- Boilerplate NestJS (module, controller, service, DTO, decorator) chiếm quá nhiều thời gian setup
- Tách frontend/backend làm phức tạp thêm deployment mà không mang lại lợi ích rõ ràng ở quy mô này

---

## Hệ quả

**Tích cực:**
- Triển khai nhanh, focus vào logic nghiệp vụ quan trọng
- Auth, DB, và deployment đều managed — giảm operational overhead
- Toàn bộ stack TypeScript end-to-end

**Tiêu cực / Rủi ro:**
- Phụ thuộc 3 vendor (Vercel, Supabase, Stripe) — single point of failure nếu một bên down
- Supabase free tier: 500MB DB, 2GB bandwidth — không phù hợp production traffic lớn
- Khó debug hơn khi lỗi xảy ra ở tầng managed service

**Quyết định kỹ thuật bị ảnh hưởng bởi ADR này:**
- [ADR-0002](0002-authentication-strategy.md) — Auth strategy
- [ADR-0003](0003-concurrency-seat-reservation.md) — Xử lý đồng thời
- [ADR-0004](0004-payment-webhook-vs-redirect.md) — Payment confirmation strategy
