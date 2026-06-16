# Architecture Decision Records (ADR)

Thư mục này chứa các quyết định kiến trúc quan trọng của hệ thống đặt chỗ ngồi.

## Format

Mỗi ADR theo cấu trúc:
- **Bối cảnh** — vấn đề cần giải quyết
- **Các lựa chọn đã cân nhắc** — options với trade-off
- **Quyết định** — lựa chọn cuối cùng
- **Lý do** — tại sao chọn, tại sao không chọn cái khác
- **Hệ quả** — tích cực, tiêu cực, rủi ro

## Danh sách ADR

| # | Tiêu đề | Trạng thái |
|---|---------|------------|
| [ADR-0001](0001-overall-stack-selection.md) | Lựa chọn Technology Stack tổng thể | Accepted |
| [ADR-0002](0002-authentication-strategy.md) | Chiến lược xác thực người dùng (90-day session) | Accepted |
| [ADR-0003](0003-concurrency-seat-reservation.md) | Xử lý đồng thời khi đặt ghế (Race Condition) | Accepted |
| [ADR-0004](0004-payment-webhook-vs-redirect.md) | Xác nhận đặt chỗ qua Webhook vs. Redirect | Accepted |

## Quyết định cốt lõi (tóm tắt)

```
Stack:   Next.js 16 + Supabase + Stripe + Vercel
Auth:    Supabase Auth, magic link, JWT 90 ngày, refresh token rotation
DB:      Atomic UPDATE để tránh race condition + DB unique constraint backstop
Payment: Stripe Webhook là source of truth, không phải browser redirect
```
