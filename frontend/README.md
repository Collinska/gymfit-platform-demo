# GYMFIT Frontend

Next.js operational platform for the GYMFIT monorepo.

## Service Boundary

This frontend lives at `gymfit-platform/frontend` and is separate from the Python sync worker in `gymfit-platform/sync-worker`.

## Structure

- `app/` contains App Router routes, layouts, and route handlers.
- `components/` contains reusable layout, UI, and operations-specific components.
- `lib/` contains shared utilities and Supabase client factories.
- `hooks/` contains client-side behavior such as future realtime subscriptions.
- `services/` contains the data-access layer used by pages.
- `types/` contains shared domain and database types.
- `styles/` contains global Tailwind styles and design tokens.

## Development

```powershell
cd "C:\Users\HP\Documents\New project\gymfit-platform\frontend"
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` before wiring live Supabase queries.
