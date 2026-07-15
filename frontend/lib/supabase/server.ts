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
