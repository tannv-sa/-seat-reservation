# Seat Reservation Platform

Ứng dụng đặt chỗ ngồi công khai — bài test kỹ thuật Senior/Lead Engineer.

**Stack:** Next.js 16 · Supabase (Auth + PostgreSQL) · Stripe · Vercel

---

## Tính năng

- Đăng nhập qua Magic Link (không cần mật khẩu), session 90 ngày
- Hiển thị 3 ghế với trạng thái thực (available / held / reserved)
- Đặt ghế với atomic locking — ngăn double booking
- Luồng thanh toán qua Stripe test mode
- Xác nhận đặt chỗ qua Stripe Webhook — không phụ thuộc browser redirect
- Ghế hết hạn hold tự động được giải phóng mỗi phút (Vercel Cron)

---

## Cài đặt local

### Yêu cầu

- Node.js 18+
- Tài khoản [Supabase](https://supabase.com) (free tier)
- Tài khoản [Stripe](https://stripe.com) (test mode)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)

### Các bước

**1. Clone và cài dependencies**

```bash
git clone <repo-url>
cd seat-reservation
npm install
```

**2. Tạo Supabase project và chạy schema**

- Vào [supabase.com](https://supabase.com) → New project
- SQL Editor → chạy nội dung file `docs/schema.sql`
- Auth → Settings: JWT expiry = `7776000` (90 ngày), bật Magic Link
- Auth → URL Configuration: Site URL = `http://localhost:3000`

**3. Cấu hình environment**

```bash
cp .env.example .env.local
# Điền SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE keys
```

**4. Chạy app và Stripe webhook**

```bash
# Terminal 1
npm run dev

# Terminal 2
stripe listen --forward-to localhost:3000/api/webhook
# Sao chép STRIPE_WEBHOOK_SECRET từ output vào .env.local
```

**5. Test thanh toán**

Thẻ Stripe test: `4242 4242 4242 4242` · Ngày: `12/28` · CVC: `123`

---

## Cấu trúc dự án

```
src/
├── app/
│   ├── login/page.tsx              # Magic link login
│   ├── seats/page.tsx              # Danh sách ghế (Server Component)
│   ├── checkout/[seatId]/          # Stripe payment form
│   ├── success/page.tsx            # Xác nhận sau thanh toán
│   └── api/
│       ├── reserve/route.ts        # Atomic seat hold + PaymentIntent
│       ├── webhook/route.ts        # Stripe webhook handler (source of truth)
│       ├── reservation-status/     # Poll endpoint cho success page
│       └── cron/release-holds/     # Giải phóng ghế hết hạn hold
├── components/SeatCard.tsx
├── lib/supabase/{client,server,service}.ts
├── lib/stripe.ts
├── middleware.ts                    # Auth guard
└── types/database.ts
```

---

## Quyết định kỹ thuật

Xem [docs/adr/](../docs/adr/) để hiểu chi tiết các quyết định kiến trúc.

**Hai điểm quan trọng nhất:**

**Webhook > Redirect:** Stripe Webhook là source of truth để xác nhận đặt chỗ. Browser redirect chỉ là UX — nếu dùng redirect làm trigger, mọi network failure hay browser crash sẽ gây ghost payment (tiền thu mà ghế không được đặt).

**Atomic SQL UPDATE:** `UPDATE seats WHERE status='available'` là một DB operation duy nhất — không có khoảng thời gian cho race condition. Đơn giản hơn Redis lock, không cần thêm infrastructure.

---

## Deploy lên Vercel

```bash
vercel --prod
# Thêm tất cả env vars trên Vercel dashboard
# Thêm webhook URL trên Stripe: https://your-app.vercel.app/api/webhook
```

---

## Những gì chưa làm (ngoài scope)

- Rate limiting, MFA, audit log
- Real-time seat update (Supabase Realtime)
- Countdown timer cho seat hold
- Email xác nhận

---

## Development server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
