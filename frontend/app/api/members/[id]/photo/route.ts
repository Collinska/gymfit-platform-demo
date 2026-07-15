import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const BUCKET = "member-photos";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB pre-compression

// Resolve a member from the URL segment, which may be an erp_customer_id or the
// internal numeric id. Try erp_customer_id FIRST — ERP ids can be all-numeric
// (e.g. "00246"), which a /^\d+$/ check would wrongly treat as an internal id.
async function resolveMember(rawId: string): Promise<number | undefined> {
  const id = decodeURIComponent(rawId);

  const byErp = await supabaseAdmin
    .from("gym_members").select("id").eq("erp_customer_id", id).limit(1);
  if (byErp.data?.[0]?.id != null) return byErp.data[0].id as number;

  if (/^\d+$/.test(id)) {
    const byId = await supabaseAdmin
      .from("gym_members").select("id").eq("id", id).limit(1);
    if (byId.data?.[0]?.id != null) return byId.data[0].id as number;
  }
  return undefined;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const memberId = await resolveMember(params.id);
    if (!memberId) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No photo provided" }, { status: 422 });
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG or PNG images are allowed" }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 413 });
    }

    // Compress: resize to max 500px (keep aspect), JPEG quality ~80.
    const input = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(input)
      .rotate() // respect EXIF orientation
      .resize(500, 500, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const path = `${memberId}/photo.jpg`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
    if (upErr) throw upErr;

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    // Cache-bust so the <img> refreshes after re-upload.
    const photoUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: updErr } = await supabaseAdmin
      .from("gym_members")
      .update({ photo_url: photoUrl })
      .eq("id", memberId);
    if (updErr) throw updErr;

    return NextResponse.json({ photo_url: photoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const memberId = await resolveMember(params.id);
    if (!memberId) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    await supabaseAdmin.storage.from(BUCKET).remove([`${memberId}/photo.jpg`]);
    const { error } = await supabaseAdmin
      .from("gym_members")
      .update({ photo_url: null })
      .eq("id", memberId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
