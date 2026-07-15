"""GET /erp/products — list all active menu items with tax info."""

from __future__ import annotations

import logging
from collections import defaultdict

import pyodbc
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import erp_conn

log = logging.getLogger("erp_api.products")
router = APIRouter(prefix="/erp/products", tags=["products"])


class ProductItem(BaseModel):
    product_id:      str
    display_name:    str
    product_name:    str
    rate:            float
    mrp:             float
    tax_id:          int
    tax_value:       float
    tax_name:        str
    include_in_rate: bool
    ask_price:       bool
    is_stock_item:   bool   # ItemType 164 = physical stocked good; else service/membership


class Menu(BaseModel):
    menu_id:   int
    menu_name: str
    items:     list[ProductItem]


class ProductsResponse(BaseModel):
    menus: list[Menu]


@router.get("/stock-levels")
def get_stock_levels(warehouse_id: int = 10, location_id: int = 15):
    """Live on-hand quantity for every stocked good (ItemType=164), summed
    across batch/lot rows, at the given warehouse/location. Powers the POS
    stock badges. One round-trip; always reflects the live ERP."""
    sql = """
        SELECT s.ProductID, SUM(s.Quantity) AS Qty
        FROM Stock s
        JOIN ProductMaster pm ON pm.ProductID = s.ProductID
        WHERE s.WarehouseID = ?
          AND s.LocationID  = ?
          AND pm.ItemType   = 164
        GROUP BY s.ProductID
    """
    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql, warehouse_id, location_id)
            rows = cur.fetchall()
    except pyodbc.Error as exc:
        log.error("ERP DB error fetching stock levels: %s", exc)
        raise HTTPException(status_code=500, detail=f"ERP database error: {exc}") from exc

    stock = {str(pid).strip(): float(qty or 0) for pid, qty in rows}
    return {"stock": stock}


@router.get("/{product_id}/stock")
def get_product_stock(
    product_id: str,
    warehouse_id: int = 10,
    location_id:  int = 15,
):
    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            # Stock holds multiple batch/lot rows per product — SUM them.
            cur.execute(
                """
                SELECT SUM(Quantity) FROM Stock
                 WHERE ProductID   = ?
                   AND WarehouseID = ?
                   AND LocationID  = ?
                """,
                product_id, warehouse_id, location_id,
            )
            row = cur.fetchone()
    except pyodbc.Error as exc:
        log.error("ERP DB error fetching stock for %s: %s", product_id, exc)
        raise HTTPException(status_code=500, detail=f"ERP database error: {exc}") from exc

    qty = float(row[0]) if row and row[0] is not None else 0.0
    return {"product_id": product_id, "quantity": qty}


@router.get("", response_model=ProductsResponse)
def list_products() -> ProductsResponse:
    sql = """
        SELECT
            rmc.MenuID, rmm.MenuName,
            rmc.ProductID, rmc.DisplayName,
            pm.ProductName, pm.MaxRetailPrice,
            rmc.Rate, rmc.TaxID, rmc.AskPrice,
            tm.TaxValue, tm.IncludeInRate, tm.TaxName,
            pm.ItemType
        FROM RestMenuChild rmc
        JOIN RestMenuMaster rmm ON rmm.MenuID = rmc.MenuID
        JOIN ProductMaster pm   ON pm.ProductID = rmc.ProductID
        LEFT JOIN TaxMaster tm  ON tm.TaxID = rmc.TaxID
        WHERE rmm.IsActive = 1
        ORDER BY rmc.MenuID, rmc.MenuItemPosition
    """
    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql)
            rows = cur.fetchall()
    except pyodbc.Error as exc:
        log.error("ERP DB error fetching products: %s", exc)
        raise HTTPException(status_code=500, detail=f"ERP database error: {exc}") from exc

    # Group by menu
    menu_names: dict[int, str] = {}
    menu_items: dict[int, list[ProductItem]] = defaultdict(list)

    for row in rows:
        (
            menu_id, menu_name,
            product_id, display_name,
            product_name, mrp,
            rate, tax_id, ask_price,
            tax_value, include_in_rate, tax_name,
            item_type,
        ) = row

        menu_names[menu_id] = menu_name
        menu_items[menu_id].append(ProductItem(
            product_id=str(product_id).strip(),
            display_name=str(display_name or product_name or "").strip(),
            product_name=str(product_name or "").strip(),
            rate=float(rate or 0),
            mrp=float(mrp or 0),
            tax_id=int(tax_id or 0),
            tax_value=float(tax_value or 0),
            tax_name=str(tax_name or "").strip(),
            include_in_rate=bool(include_in_rate),
            ask_price=bool(ask_price),
            is_stock_item=(int(item_type or 0) == 164),
        ))

    menus = [
        Menu(menu_id=mid, menu_name=menu_names[mid], items=menu_items[mid])
        for mid in menu_names
    ]
    return ProductsResponse(menus=menus)
