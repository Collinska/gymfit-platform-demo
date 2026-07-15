# frontend/app/api/members/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function cleanSearch(value: string) {
  return value.replaceAll(",", " ").trim();
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = cleanSearch(searchParams.get("search") ?? "");
  const status = searchParams.get("status");
  const plan = searchParams.get("plan");
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = supabaseAdmin.from("v_member_status").select("*", { count: "exact" });

    if (search) {
      const pattern = `%${search}%`;
      query = query.or(
        [
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          `erp_customer_id.ilike.${pattern}`,
          `mobile.ilike.${pattern}`,
          `card_id.ilike.${pattern}`,
        ].join(","),
      );
    }

    if (status) query = query.eq("display_status", status);
    if (plan) query = query.eq("plan_name", plan);

    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], count: count ?? 0, page, limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```
