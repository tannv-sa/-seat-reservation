# ADR-0002: Chiến lược xác thực người dùng (90-day session)

- **Trạng thái:** Accepted
- **Ngày:** 2026-06-16
- **Người quyết định:** Engineering Team

---

## Bối cảnh

Hệ thống yêu cầu người dùng đăng nhập với session kéo dài 90 ngày. Cần quyết định:
1. Cơ chế xác thực (OAuth, magic link, password-based)
2. Cách quản lý session và token expiry
3. Bảo mật cookie và CSRF

---

## Các lựa chọn đã cân nhắc

### Option A: Supabase Auth với magic link / OAuth (được chọn)
### Option B: Custom JWT với bcrypt password
### Option C: NextAuth.js (Auth.js)

---

## Quyết định

**Chọn Supabase Auth với Email Magic Link làm phương thức chính, hỗ trợ thêm Google OAuth.**

Cấu hình session:
```
JWT expiry: 7776000 giây (90 ngày)
Refresh token rotation: bật
Cookie: HttpOnly, Secure, SameSite=Lax
```

---

## Lý do

### Tại sao Magic Link thay vì Password?
- Không cần lưu password hash — giảm attack surface (không có password DB để leak)
- Trải nghiệm người dùng tốt hơn — không cần nhớ mật khẩu
- Phù hợp với hệ thống đặt chỗ công khai, người dùng không thường xuyên

### Tại sao Supabase Auth thay vì tự implement?
- 90-day JWT expiry cấu hình một dòng trong Supabase dashboard
- Refresh token rotation tự động — nếu token bị đánh cắp, rotation vô hiệu hóa token cũ
- Không phải viết middleware xác thực, session store, hay token revocation logic
- **Đánh đổi:** Không kiểm soát token storage backend; phụ thuộc Supabase revoke API khi cần force logout

### Tại sao không dùng NextAuth.js?
- NextAuth cần cấu hình adapter cho DB, providers, callbacks — nhiều hơn cần thiết
- Supabase Auth tích hợp tốt hơn với Supabase DB (RLS policies dùng `auth.uid()` trực tiếp)
- Thêm một dependency không cần thiết khi đã có Supabase

### Bảo mật session 90 ngày
Session dài tăng nguy cơ nếu token bị lộ. Biện pháp giảm thiểu:
- HttpOnly cookie — JavaScript client không đọc được token
- Secure flag — chỉ gửi qua HTTPS
- Refresh token rotation — mỗi lần dùng refresh token thì invalidate token cũ
- Supabase cho phép revoke session từ server khi cần (e.g. user đổi email)

---

## Hệ quả

**Tích cực:**
- Không lưu password — không có password breach risk
- Refresh token rotation giảm thiểu impact của token theft
- RLS policies trong PostgreSQL dùng `auth.uid()` — enforce security ở tầng DB

**Tiêu cực / Rủi ro:**
- Magic link phụ thuộc email delivery — nếu email delay, UX bị ảnh hưởng
- 90-day session: nếu thiết bị bị mất, attacker có window lớn (giảm thiểu bằng server-side revoke)
- Chưa có MFA — acceptable cho scope hiện tại, nên thêm sau

**Cần làm thêm (ngoài scope assessment):**
- Rate limit magic link requests để chống spam
- Audit log cho login/logout events
- Email notification khi có login từ thiết bị mới
