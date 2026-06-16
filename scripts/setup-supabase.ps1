# ============================================================
# setup-supabase.ps1
# Script tự động setup Supabase cloud project qua CLI + Management API
# Chạy: .\scripts\setup-supabase.ps1 -Token "sbp_xxx" -OrgId "yyy" (optional)
# ============================================================

param(
  [Parameter(Mandatory=$true)]
  [string]$Token,

  [string]$OrgId = "",
  [string]$ProjectName = "seat-reservation",
  [string]$DbPassword = "",
  [string]$Region = "ap-southeast-1"
)

$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

# ── 1. Login ────────────────────────────────────────────────
Write-Host "`n[1/6] Đang login Supabase CLI..." -ForegroundColor Cyan
supabase login --token $Token
if ($LASTEXITCODE -ne 0) { Write-Error "Login thất bại"; exit 1 }

# ── 2. Lấy org-id nếu chưa có ──────────────────────────────
if (-not $OrgId) {
  Write-Host "`n[2/6] Lấy danh sách organizations..." -ForegroundColor Cyan
  $orgs = supabase orgs list --output json 2>&1 | ConvertFrom-Json
  if ($orgs.Count -eq 0) { Write-Error "Không tìm thấy org. Hãy tạo account tại supabase.com trước."; exit 1 }
  $OrgId = $orgs[0].id
  Write-Host "    → Dùng org: $($orgs[0].name) ($OrgId)"
}

# ── 3. Tạo project ──────────────────────────────────────────
Write-Host "`n[3/6] Tạo Supabase project '$ProjectName'..." -ForegroundColor Cyan

if (-not $DbPassword) {
  # Sinh password ngẫu nhiên 24 ký tự
  $DbPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
}

$projectOutput = supabase projects create $ProjectName `
  --org-id $OrgId `
  --db-password $DbPassword `
  --region $Region `
  --output json 2>&1

if ($LASTEXITCODE -ne 0) {
  # Project có thể đã tồn tại — lấy project ref từ list
  Write-Host "    → Project đã tồn tại hoặc lỗi. Lấy từ danh sách..." -ForegroundColor Yellow
  $projects = supabase projects list --output json 2>&1 | ConvertFrom-Json
  $project = $projects | Where-Object { $_.name -eq $ProjectName } | Select-Object -First 1
  if (-not $project) { $project = $projects[0] }
} else {
  $project = $projectOutput | ConvertFrom-Json
}

$ProjectRef = $project.id
Write-Host "    → Project ref: $ProjectRef"

# Chờ project ready (thường 30-60 giây)
Write-Host "    → Chờ project khởi tạo xong..." -ForegroundColor Yellow
Start-Sleep -Seconds 45

# ── 4. Link và push migration ────────────────────────────────
Write-Host "`n[4/6] Link project và push migration..." -ForegroundColor Cyan
supabase link --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { Write-Error "Link thất bại"; exit 1 }

supabase db push --yes
if ($LASTEXITCODE -ne 0) { Write-Error "db push thất bại"; exit 1 }
Write-Host "    → Migration và seed đã push thành công"

# ── 5. Cấu hình Auth qua Management API ─────────────────────
Write-Host "`n[5/6] Cấu hình Auth (JWT 90 ngày, Magic Link)..." -ForegroundColor Cyan

$authConfig = @{
  jwt_exp                      = 7776000       # 90 ngày
  mailer_autoconfirm           = $true         # không cần confirm email (magic link)
  enable_signup                = $true
  site_url                     = "http://localhost:3000"
  uri_allow_list               = "http://localhost:3000/**"
  smtp_admin_email             = "noreply@localhost"
} | ConvertTo-Json

$headers = @{
  Authorization  = "Bearer $Token"
  "Content-Type" = "application/json"
}

$response = Invoke-RestMethod `
  -Uri "https://api.supabase.com/v1/projects/$ProjectRef/config/auth" `
  -Method PATCH `
  -Headers $headers `
  -Body $authConfig `
  -ErrorAction SilentlyContinue

if ($response) {
  Write-Host "    → Auth config đã cập nhật: JWT expiry = 7776000s (90 ngày)"
} else {
  Write-Host "    → Auth config: thử lại từ dashboard nếu cần" -ForegroundColor Yellow
}

# ── 6. Lấy credentials và ghi .env.local ────────────────────
Write-Host "`n[6/6] Lấy API keys và cập nhật .env.local..." -ForegroundColor Cyan

$apiKeys = Invoke-RestMethod `
  -Uri "https://api.supabase.com/v1/projects/$ProjectRef/api-keys" `
  -Method GET `
  -Headers $headers

$anonKey    = ($apiKeys | Where-Object { $_.name -eq "anon"         }).api_key
$serviceKey = ($apiKeys | Where-Object { $_.name -eq "service_role" }).api_key
$projectUrl = "https://$ProjectRef.supabase.co"

# Đọc và cập nhật .env.local
$envPath = Join-Path $PSScriptRoot "..\\.env.local"
$envContent = Get-Content $envPath -Raw

$envContent = $envContent -replace "NEXT_PUBLIC_SUPABASE_URL=.*",      "NEXT_PUBLIC_SUPABASE_URL=$projectUrl"
$envContent = $envContent -replace "NEXT_PUBLIC_SUPABASE_ANON_KEY=.*", "NEXT_PUBLIC_SUPABASE_ANON_KEY=$anonKey"
$envContent = $envContent -replace "SUPABASE_SERVICE_ROLE_KEY=.*",     "SUPABASE_SERVICE_ROLE_KEY=$serviceKey"

Set-Content $envPath $envContent -Encoding utf8
Write-Host "    → .env.local đã được cập nhật"

# ── Tổng kết ─────────────────────────────────────────────────
Write-Host "`n✅ Supabase setup hoàn tất!" -ForegroundColor Green
Write-Host "   Project URL : $projectUrl"
Write-Host "   Project ref : $ProjectRef"
Write-Host "   Studio URL  : https://supabase.com/dashboard/project/$ProjectRef"
Write-Host ""
Write-Host "📌 Bước tiếp theo:"
Write-Host "   1. Chạy: npm run dev"
Write-Host "   2. Chạy: stripe login && stripe listen --forward-to localhost:3000/api/webhook"
Write-Host "   3. Sao chép STRIPE_WEBHOOK_SECRET vào .env.local"
