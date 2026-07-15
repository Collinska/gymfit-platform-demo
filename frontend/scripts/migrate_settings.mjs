/**
 * Run once to create platform_settings table and seed initial row.
 * Usage: node scripts/migrate_settings.mjs
 */
import { createClient } from '@supabase/supabase-js'

// Secrets must come only from the environment — never hardcode the service_role key.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// Try inserting — if table doesn't exist this will fail with a clear message
const { error } = await admin.from('platform_settings').upsert([
  {
    key: 'pos_enforce_stock_check',
    value: true,
    description: 'When enabled, POS blocks sale of items with zero or no stock at the warehouse',
  },
], { onConflict: 'key' })

if (error) {
  if (error.code === '42P01') {
    console.error('Table does not exist. Create it in Supabase SQL Editor:\n')
    console.log(`
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);
    `)
  } else {
    console.error('Error:', error)
  }
  process.exit(1)
}

console.log('platform_settings seeded successfully.')
