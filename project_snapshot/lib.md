# frontend/lib/ — all files

---

## frontend/lib/cn.ts

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## frontend/lib/env.ts

```typescript
type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export function getPublicEnv(): PublicEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return { supabaseUrl, supabaseAnonKey };
}
```

---

## frontend/lib/supabase.ts

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

---

## frontend/lib/supabase/browser.ts

```typescript
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
```

---

## frontend/lib/supabase/server.ts

```typescript
import { cookies } from "next/headers";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot always write cookies. Middleware can refresh sessions.
          }
        });
      },
    },
  });
}
```
