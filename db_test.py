import os
from dotenv import load_dotenv
import psycopg2

load_dotenv()

print("Connecting to Supabase...")

conn = psycopg2.connect(
    host=os.getenv("SUPABASE_DB_HOST"),
    database=os.getenv("SUPABASE_DB_NAME"),
    user=os.getenv("SUPABASE_DB_USER"),
    password=os.getenv("SUPABASE_DB_PASSWORD"),
    port=5432
)

cur = conn.cursor()
cur.execute("SELECT NOW();")

result = cur.fetchone()

print("Connection successful!")
print("DB Time:", result)

conn.close()