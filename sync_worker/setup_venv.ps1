Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot

python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt

if (-not (Test-Path -LiteralPath ".\.env")) {
    Copy-Item -LiteralPath ".\.env.example" -Destination ".\.env"
    Write-Host "Created .env from .env.example. Edit .env before running the worker."
}

Write-Host "Setup complete. Run: python sync_worker.py"
