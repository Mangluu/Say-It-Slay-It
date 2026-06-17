# MIC DROP — showcase launcher (Windows / PowerShell)
# Prereqs (one time):
#   - Ollama running, model pulled:   ollama pull qwen2.5:3b-instruct
#   - Server venv built:              py -3.11 -m venv server\.venv ; server\.venv\Scripts\pip install -r server\requirements.txt
#   - Client deps:                    npm --prefix client install
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$py = Join-Path $root "server\.venv\Scripts\python.exe"

Write-Host "Starting MIC DROP backend (FastAPI + Ollama + SD-Turbo) on :8000 ..."
Start-Process -FilePath $py -ArgumentList @(
  "-m", "uvicorn", "app.main:app", "--app-dir", (Join-Path $root "server"),
  "--host", "0.0.0.0", "--port", "8000"
)

Write-Host "Starting MIC DROP client (Vite) on :5173 ..."
Start-Process -FilePath "cmd.exe" -ArgumentList @(
  "/c", "npm", "--prefix", (Join-Path $root "client"), "run", "dev"
)

Start-Sleep -Seconds 5
Write-Host "Opening the game in your browser (use F11 for fullscreen kiosk)."
Start-Process "http://localhost:5173"
Write-Host "Safe mode: set MICDROP_SPRITES=0 to disable image gen; the curated pool covers forging if Ollama is down."
