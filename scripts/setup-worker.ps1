# Bootstrap worker trên laptop cá nhân (Windows / PowerShell)
# Dùng: pwsh ./scripts/setup-worker.ps1
# Chạy ở thư mục gốc repo, sau khi đã tạo root .env

$ErrorActionPreference = 'Stop'

# Về thư mục gốc repo (script nằm trong scripts/)
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== Setup worker laptop ==" -ForegroundColor Cyan

# 1. Kiểm tra root .env tồn tại + đủ biến bắt buộc
if (-not (Test-Path ".env")) {
    Write-Host "THIEU root .env — tao file .env o thu muc goc truoc (xem docs/worker-laptop-setup.md)" -ForegroundColor Red
    exit 1
}

$envText = Get-Content ".env" -Raw
$required = @('REDIS_URL', 'MONGODB_URI', 'SESSION_ENCRYPT_KEY', 'OPENAI_API_KEY')
$missing = @()
foreach ($key in $required) {
    # khop dong "KEY=<gia tri khac rong>", bo qua dong comment
    if ($envText -notmatch "(?m)^\s*$key\s*=\s*\S") { $missing += $key }
}
if ($missing.Count -gt 0) {
    Write-Host "THIEU bien trong .env: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

# Canh bao neu REDIS_URL tro ve localhost (sai — phai la URL public Railway)
if ($envText -match "(?m)^\s*REDIS_URL\s*=.*(localhost|127\.0\.0\.1)") {
    Write-Host "CANH BAO: REDIS_URL dang tro localhost. Worker phai dung REDIS_URL PUBLIC cua Railway (*.proxy.rlwy.net)." -ForegroundColor Yellow
}

Write-Host "[OK] .env du 4 bien bat buoc" -ForegroundColor Green

# 2. Cai dependencies
Write-Host "Cai dependencies (pnpm install)..." -ForegroundColor Cyan
pnpm install

# 3. Cai Chromium cho Playwright
Write-Host "Cai Chromium cho Playwright..." -ForegroundColor Cyan
pnpm exec playwright install chromium

Write-Host ""
Write-Host "Xong setup. Chay thu foreground de xem log:" -ForegroundColor Green
Write-Host "  pnpm worker" -ForegroundColor White
Write-Host ""
Write-Host "Chay 24/7 bang PM2:" -ForegroundColor Green
Write-Host "  npm i -g pm2 pm2-windows-startup; pm2-startup install" -ForegroundColor White
Write-Host "  pm2 start 'pnpm worker' --name fb-worker; pm2 save" -ForegroundColor White
