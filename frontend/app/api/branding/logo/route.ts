import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { requireModule } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const BUCKET = "branding";
const PATH = "logo.png";
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const gate = await requireModule("settings");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const form = await request.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No logo provided" }, { status: 422 });
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      return NextResponse.json({ error: "Only PNG or JPEG images are allowed" }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 413 });
    }

    // Resize to max 400px wide, keep aspect. Output PNG to preserve transparency.
    const input = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(input)
      .resize({ width: 400, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(PATH, compressed, { upsert: true, contentType: "image/png" });
    if (upErr) throw upErr;

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(PATH);
    const logoUrl = `${pub.publicUrl}?v=${Date.now()}`; // cache-bust

    const { error: updErr } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key: "biz_logo_url", value: logoUrl }, { onConflict: "key" });
    if (updErr) throw updErr;

    return NextResponse.json({ logo_url: logoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const gate = await requireModule("settings");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    await supabaseAdmin.storage.from(BUCKET).remove([PATH]);
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key: "biz_logo_url", value: "" }, { onConflict: "key" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
