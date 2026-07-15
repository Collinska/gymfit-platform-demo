# GYMFIT Sync Worker

Python worker for syncing FusionERP membership sales into Supabase.

## Windows PowerShell Setup

Run these commands from `gymfit-platform\sync_worker`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and fill in the ERP and Supabase values.

Start the worker:

```powershell
python sync_worker.py
```

## Required Supabase Variables

- `SUPABASE_DB_HOST`
- `SUPABASE_DB_PASSWORD`

Optional Supabase defaults:

- `SUPABASE_DB_PORT=5432`
- `SUPABASE_DB_NAME=postgres`
- `SUPABASE_DB_USER=postgres`

Use individual connection parameters instead of a database URL so special characters in passwords do not need URL encoding.

## Test Connection

```powershell
python test_db.py
```
