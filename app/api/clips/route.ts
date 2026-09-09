import { NextRequest, NextResponse } from "next/server";
import { getClips, ClipFilterOptions } from "@/lib/db/clipService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const options: ClipFilterOptions = {
      gameSlug: searchParams.get("game") || undefined,
      folder: searchParams.get("folder") || undefined,
      tagName: searchParams.get("tag") || undefined,
      search: searchParams.get("q") || undefined,
      isFavorite: searchParams.get("favorite") === "true" ? true : undefined,
      isTrash: searchParams.get("trash") === "true",
      duration: (searchParams.get("duration") as any) || "all",
      resolution: (searchParams.get("resolution") as any) || "all",
      fps: (searchParams.get("fps") as any) || "all",
      sortBy: (searchParams.get("sortBy") as any) || "newest",
    };

    const clips = await getClips(options);
    return NextResponse.json({ success: true, clips });
  } catch (err: any) {
    console.error("Failed to fetch clips:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch clips" },
      { status: 500 }
    );
  }
}
