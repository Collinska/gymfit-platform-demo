"""ERP write-back service — FastAPI app exposing /erp/members, /erp/deposits, /erp/sales."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from demo_guard import demo_status
from routers import members, deposits, sales, products, erp_members, print_receipt, reports, email, wrap, staff, contracts

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = FastAPI(
    title="GymFit ERP Write-back API",
    description="Writes new members, deposits, and membership sales directly into the SQL Server ERP.",
    version="1.0.0",
)

# Local dev origins always allowed; FRONTEND_URL adds the deployed frontend
# (Vercel demo domain, etc.) per-deployment via env var instead of editing
# this file for demo vs production. Comma-separated for more than one.
_cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
_frontend_url = os.getenv("FRONTEND_URL", "")
if _frontend_url:
    _cors_origins += [u.strip() for u in _frontend_url.split(",") if u.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def demo_expiry_gate(request: Request, call_next):
    # No-op for production (no is_demo row there) or once cached (checked at
    # most once per ~60s, see demo_guard.py). /health stays reachable for
    # infra monitoring regardless of demo state.
    if request.url.path != "/health":
        _, expired = demo_status()
        if expired:
            return JSONResponse(
                status_code=403,
                content={"error": "Demo period has ended — contact Fitness Mania to continue."},
            )
    return await call_next(request)

app.include_router(members.router)
app.include_router(deposits.router)
app.include_router(sales.router)
app.include_router(products.router)
# Search must be registered before the {customer_id} wildcard route
app.include_router(erp_members.router)
app.include_router(print_receipt.router)
app.include_router(reports.router)
app.include_router(email.router)
app.include_router(wrap.router)
app.include_router(staff.router)
app.include_router(contracts.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
