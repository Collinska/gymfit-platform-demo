"""FK lookup probe — run with: python debug_schema.py"""
from db import erp_conn

QUERIES = {
    "LocalityMaster first 3 rows": "SELECT TOP 3 LocalityID, LocalityName FROM LocalityMaster ORDER BY LocalityID",
    "StreetMaster first 3 rows":   "SELECT TOP 3 StreetID, StreetName FROM StreetMaster ORDER BY StreetID",
    "CityMaster first 3 rows":     "SELECT TOP 3 CityID, CityName FROM CityMaster ORDER BY CityID",
    "StateMaster first 3 rows":    "SELECT TOP 3 StateID, StateName FROM StateMaster ORDER BY StateID",
    "CountryMaster first 3 rows":  "SELECT TOP 3 CountryID, CountryName FROM CountryMaster ORDER BY CountryID",
    "LocationMaster first 5 rows": "SELECT TOP 5 LocationID, LocationName FROM LocationMaster ORDER BY LocationID",
    "PriceListMaster first 3":     "SELECT TOP 3 PriceListID, PriceListName FROM PriceListMaster ORDER BY PriceListID",
    "VATClassMaster first 3":      "SELECT TOP 3 VATClassID, VATClassName FROM VATClassMaster ORDER BY VATClassID",
    "GroupMaster ID=8":            "SELECT GroupID, GroupName FROM groupmaster WHERE GroupID = 8",
}

def run():
    with erp_conn() as conn:
        cur = conn.cursor()
        for label, sql in QUERIES.items():
            print(f"\n{'='*55}")
            print(f"  {label}")
            print(f"{'='*55}")
            try:
                cur.execute(sql)
                rows = cur.fetchall()
                cols = [d[0] for d in cur.description]
                print("  " + " | ".join(f"{c:<25}" for c in cols))
                print("  " + "-" * (28 * len(cols)))
                for row in rows:
                    print("  " + " | ".join(f"{str(v):<25}" for v in row))
                if not rows:
                    print("  (no rows)")
            except Exception as e:
                print(f"  ERROR: {e}")

if __name__ == "__main__":
    run()
