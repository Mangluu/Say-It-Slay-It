# MIC DROP — showcase launcher (Windows / PowerShell)
# Prereqs (one time):
#   ollama pull qwen2.5:1.5b-instruct
#   py -3.11 -m venv server\.venv ; server\.venv\Scripts\pip install -r server\requirements.txt
#   server\.venv\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
#   npm --prefix client install
# Phone VOICE (optional): run scripts\setup_certs.ps1 first to enable HTTPS (the mic needs it).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$py = Join-Path $root "server\.venv\Scripts\python.exe"
$key = Join-Path $root "server\certs\key.pem"
$crt = Join-Path $root "server\certs\cert.pem"
$https = (Test-Path $key) -and (Test-Path $crt)

$uv = @("-m", "uvicorn", "app.main:app", "--app-dir", (Join-Path $root "server"), "--host", "0.0.0.0", "--port", "8000")
if ($https) { $uv += @("--ssl-keyfile", $key, "--ssl-certfile", $crt) }
Write-Host ("Starting backend on " + $(if ($https) { "https" } else { "http" }) + "://0.0.0.0:8000 ...")
Start-Process -FilePath $py -ArgumentList $uv

# tell the client which scheme/host to use for API + WS (phone mic needs https)
$env:VITE_API = if ($https) { "https://127.0.0.1:8000" } else { "http://127.0.0.1:8000" }
Write-Host "Starting client (Vite) on :5173 ... (VITE_API=$($env:VITE_API))"
Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm", "--prefix", (Join-Path $root "client"), "run", "dev")

Start-Sleep -Seconds 5
Start-Process "http://localhost:5173"
Write-Host "Open the game (F11 = fullscreen). VERSUS (PHONES) shows the join QR codes."
Write-Host "Safe mode: set MICDROP_SPRITES=0 to disable image gen; the curated pool covers forging if Ollama is down."
