# Chạy script này với quyền Administrator:
# Click phải vào file → "Run with PowerShell" → chọn Yes khi UAC hỏi

$certSrc = "$env:USERPROFILE\.mitmproxy\mitmproxy-ca-cert.cer"
$ffDir = "$env:ProgramFiles\Mozilla Firefox"
$certDest = "$ffDir\mitmproxy-ca-cert.cer"
$distDir = "$ffDir\distribution"

if (-not (Test-Path $certSrc)) {
    Write-Host "[!] Cert chưa có tại $certSrc"
    Write-Host "    Hãy chạy 'mitmdump --listen-port 8080' một lần rồi Ctrl+C"
    pause; exit 1
}

New-Item -ItemType Directory -Force $distDir | Out-Null
Copy-Item $certSrc $certDest -Force

$policies = '{"policies":{"Certificates":{"Install":["mitmproxy-ca-cert.cer"]}}}'
Set-Content -Path "$distDir\policies.json" -Value $policies -Encoding utf8

Write-Host "[OK] Cert đã cài vào Firefox."
Write-Host "     Khởi động lại Firefox — cert sẽ được trust tự động."
pause
