# MIC DROP — generate locally-trusted HTTPS certs so the PHONE MIC works.
# (getUserMedia needs a secure context; http://LAN-IP is not secure.)
#
# Prereq: mkcert  ->  winget install FiloSottile.mkcert   (or scoop/choco install mkcert)
# After running this, run scripts/run_show.ps1 (it auto-detects the certs and serves HTTPS),
# then install the mkcert root CA on each PHONE (see the printed CAROOT path) and trust it,
# or the phone will refuse the mic. Touch control works without any of this.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$certs = Join-Path $root "server\certs"
$py = Join-Path $root "server\.venv\Scripts\python.exe"
New-Item -ItemType Directory -Force -Path $certs | Out-Null

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  Write-Host "mkcert not found. Install it then re-run:"
  Write-Host "    winget install FiloSottile.mkcert"
  exit 1
}

$lan = & $py -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0]); s.close()"
Write-Host "LAN IP: $lan"

mkcert -install
Push-Location $certs
mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1 $lan
Pop-Location

Write-Host ""
Write-Host "Certs written to $certs (localhost, 127.0.0.1, $lan)."
Write-Host "Now run scripts\run_show.ps1 (it will serve HTTPS automatically)."
Write-Host "PHONE step (one time): copy the root CA to each phone and trust it."
mkcert -CAROOT
