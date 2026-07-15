from __future__ import annotations

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


ENV_PATH = Path(__file__).resolve().parent / ".env"


def main() -> None:
    load_dotenv(dotenv_path=ENV_PATH, override=True)

    conn_params = {
        "host": os.getenv("SUPABASE_DB_HOST"),
        "port": int(os.getenv("SUPABASE_DB_PORT", "5432")),
        "dbname": os.getenv("SUPABASE_DB_NAME", "postgres"),
        "user": os.getenv("SUPABASE_DB_USER", "postgres"),
        "password": os.getenv("SUPABASE_DB_PASSWORD"),
    }

    try:
        with psycopg2.connect(**conn_params) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name
                    """
                )
                tables = [row[0] for row in cur.fetchall()]

        print("Connection OK")
        print("Public tables:")
        for table in tables:
            print(f"- {table}")
    except Exception as exc:
        print(f"Connection failed: {exc}")


if __name__ == "__main__":
    main()
