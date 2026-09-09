import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { captureFrameSnapshot } from "@/lib/media/clipper";
import { STORAGE_DIRS } from "@/lib/storage/config";
import path from "path";
import fs from "fs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const timestamp = Math.max(0, Number(searchParams.get("time")) || 0);

    const clip = await prisma.clip.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, storageOriginal: true },
    });

    if (!clip || !clip.storageOriginal || !fs.existsSync(clip.storageOriginal)) {
      return new NextResponse("Original clip not found", { status: 404 });
    }

    const tempSnapshot = path.join(STORAGE_DIRS.TEMP, `snap_${clip.id}_${Math.round(timestamp * 100)}.png`);
    await captureFrameSnapshot(clip.storageOriginal, tempSnapshot, timestamp);

    if (!fs.existsSync(tempSnapshot)) {
      return new NextResponse("Failed to capture frame", { status: 500 });
    }

    const fileBuffer = fs.readFileSync(tempSnapshot);
    // Cleanup temporary file asynchronously
    try { fs.unlinkSync(tempSnapshot); } catch {}

    const cleanTitle = clip.title.replace(/[^a-zA-Z0-9_-]/g, "_");
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${cleanTitle}_frame_${Math.round(timestamp)}s.png"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    return new NextResponse(`Snapshot error: ${err.message}`, { status: 500 });
  }
}
