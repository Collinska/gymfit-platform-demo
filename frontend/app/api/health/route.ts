import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "gymfit-ops-platform",
    checkedAt: new Date().toISOString(),
  });
}
