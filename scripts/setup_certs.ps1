# MIC DROP — generate HTTPS certs so the PHONE MIC works.
# (getUserMedia needs a secure context; http://LAN-IP is not secure.)
#
# Uses mkcert if installed (no browser warnings); otherwise falls back to a
# self-signed cert via Python (you just tap "Advanced -> Proceed" once per device,
# which still gives a secure context for the mic).
# After this, run scripts\run_show.ps1 (it auto-detects the certs and serves HTTPS).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$certs = Join-Path $root "server\certs"
$py = Join-Path $root "server\.venv\Scripts\python.exe"
New-Item -ItemType Directory -Force -Path $certs | Out-Null

$lan = & $py -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0]); s.close()"

if (Get-Command mkcert -ErrorAction SilentlyContinue) {
  Write-Host "Using mkcert (trusted, no warnings)."
  mkcert -install
  Push-Location $certs
  mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1 $lan
  Pop-Location
  Write-Host "PHONE step: install the mkcert root CA on each phone (mkcert -CAROOT) to avoid warnings."
} else {
  Write-Host "mkcert not found; generating a self-signed cert with Python."
  & $py (Join-Path $root "server\make_cert.py")
  Write-Host ""
  Write-Host "Certs ready for localhost, 127.0.0.1, $lan."
  Write-Host "ACCEPT THE CERT ONCE PER DEVICE:"
  Write-Host "  - Laptop: open https://127.0.0.1:8000/health, click Advanced -> Proceed."
  Write-Host "  - Phone:  scan the lobby QR, tap Advanced/Show details -> Proceed, then Allow mic."
}
Write-Host "Done. Now run scripts\run_show.ps1 (serves HTTPS automatically)."
