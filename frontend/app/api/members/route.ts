import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createERPMember } from "@/lib/erp-client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { first_name, last_name, mobile, email, card_id } = body;

    if (!first_name) {
      return NextResponse.json({ error: "first_name is required" }, { status: 422 });
    }

    // 1. Create in ERP FIRST. gym_members.erp_customer_id is NOT NULL, and in this
    //    prepaid-wallet gym a member must have an ERP account (they deposit into it),
    //    so we need the ERP id before inserting. Doing ERP-first also prevents
    //    orphaned Supabase rows with no matching ERP customer.
    let erp;
    try {
      erp = await createERPMember({ first_name, last_name, mobile, email, card_id });
    } catch (erpErr) {
      const msg = erpErr instanceof Error ? erpErr.message : "ERP member create failed";
      console.error("ERP member create failed:", msg);
      return NextResponse.json({ error: `ERP member create failed: ${msg}` }, { status: 502 });
    }

    // 2. Insert into Supabase with the ERP identifiers already populated.
    const { data: member, error: insertError } = await supabaseAdmin
      .from("gym_members")
      .insert({
        first_name,
        last_name,
        mobile,
        email,
        card_id: card_id || null,
        erp_customer_id: erp.customer_id,
        erp_account_id: erp.account_id,
        is_active: true,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Member create error:", JSON.stringify(insertError));
      return NextResponse.json({ error: insertError.message ?? "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ data: member, erp_sync: true, erp_sync_error: null }, { status: 201 });
  } catch (error) {
    console.error("Member create error:", JSON.stringify(error));
    const message =
      error instanceof Error
        ? error.message
        : (error as { message?: string })?.message ?? "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
