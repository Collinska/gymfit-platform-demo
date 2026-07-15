"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
