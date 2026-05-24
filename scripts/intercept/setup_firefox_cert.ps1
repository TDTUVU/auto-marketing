# Tự động cài mitmproxy CA cert vào Firefox profile
# Chạy: powershell -ExecutionPolicy Bypass -File setup_firefox_cert.ps1

$ErrorActionPreference = "Stop"

# 1. Tìm mitmproxy cert
$certPath = "$env:USERPROFILE\.mitmproxy\mitmproxy-ca-cert.cer"
if (-not (Test-Path $certPath)) {
    Write-Host "[!] Chưa tìm thấy cert tại $certPath"
    Write-Host "    Hãy chạy 'mitmdump' một lần để tạo cert, rồi chạy lại script này."
    exit 1
}

# 2. Tìm Firefox profile
$profilesDir = "$env:APPDATA\Mozilla\Firefox\Profiles"
if (-not (Test-Path $profilesDir)) {
    Write-Host "[!] Firefox chưa được mở lần nào. Hãy mở Firefox một lần rồi đóng lại."
    exit 1
}

$profiles = Get-ChildItem $profilesDir -Directory
if ($profiles.Count -eq 0) {
    Write-Host "[!] Không tìm thấy Firefox profile."
    exit 1
}

# Dùng profile đầu tiên (hoặc default-release nếu có)
$profile = $profiles | Where-Object { $_.Name -like "*default-release*" } | Select-Object -First 1
if (-not $profile) { $profile = $profiles[0] }

Write-Host "[+] Dùng profile: $($profile.Name)"

# 3. Dùng certutil.exe để import cert
$certutilPath = (Get-Command certutil.exe -ErrorAction SilentlyContinue).Source
if (-not $certutilPath) {
    Write-Host "[!] Không tìm thấy certutil.exe. Cài cert thủ công theo README.md"
    exit 1
}

$dbPath = $profile.FullName
& certutil.exe -A -n "mitmproxy" -t "CT,," -i $certPath -d "sql:$dbPath" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "[✓] Cert đã được cài vào Firefox profile thành công!"
    Write-Host "    Khởi động lại Firefox nếu đang mở."
} else {
    Write-Host "[!] certutil thất bại. Thử cài thủ công:"
    Write-Host "    1. Mở Firefox → about:preferences#privacy"
    Write-Host "    2. Scroll xuống → View Certificates → Import"
    Write-Host "    3. Chọn file: $certPath"
    Write-Host "    4. Tick 'Trust this CA to identify websites'"
}
