"""ERP write-back service — FastAPI app exposing /erp/members, /erp/deposits, /erp/sales."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import members, deposits, sales, products, erp_members, print_receipt, reports, email, wrap, staff

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

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


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
