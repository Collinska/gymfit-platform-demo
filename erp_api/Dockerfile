# erp_api — DEMO environment (Render).
#
# Docker, not a native buildpack, deliberately: pyodbc is a C extension that
# needs the unixODBC runtime (libodbc.so.2) to even IMPORT — not just to
# connect — and it's imported unconditionally at module load in several
# files (db.py, routers/members.py, ...), regardless of DEMO_MODE. Render's
# native Python runtime has no supported way to apt-get install that; a
# Dockerfile gives full control and is portable to any other host if needed.
#
# Build context is erp_api/ itself (see render.yaml's dockerContext) — this
# only works because erp_api no longer depends on anything outside its own
# directory (see gym_db.py; previously several files reached into
# sync_worker/config.py via a relative sys.path hack).

FROM python:3.12-slim

# unixodbc-dev is needed at build time to compile pyodbc's C extension;
# unixodbc (the runtime library, libodbc.so.2) is needed after that too,
# since pyodbc dynamically loads it on every import, not just on connect.
RUN apt-get update && apt-get install -y --no-install-recommends \
        unixodbc unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render injects $PORT at runtime; 8000 is only a local-run fallback.
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
