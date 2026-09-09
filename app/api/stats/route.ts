import { NextResponse } from "next/server";
import { getVaultStats } from "@/lib/db/clipService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getVaultStats();
    return NextResponse.json({ success: true, stats });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
