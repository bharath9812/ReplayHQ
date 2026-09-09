import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { extractLosslessClip } from "@/lib/media/clipper";
import { getHighlightPath } from "@/lib/storage/paths";
import fs from "fs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clip = await prisma.clip.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, storageOriginal: true, duration: true },
    });

    if (!clip || !clip.storageOriginal || !fs.existsSync(clip.storageOriginal)) {
      return NextResponse.json({ success: false, error: "Source clip not found" }, { status: 404 });
    }

    const body = await req.json();
    const startTime = Math.max(0, Number(body.startTime) || 0);
    const endTime = Math.min(clip.duration, Number(body.endTime) || clip.duration);

    if (endTime <= startTime) {
      return NextResponse.json(
        { success: false, error: "End time must be greater than start time" },
        { status: 400 }
      );
    }

    const title = body.title?.trim() || `${clip.title} (Highlight ${Math.round(startTime)}s-${Math.round(endTime)}s)`;

    // Create DB record first to get highlight ID
    const highlight = await prisma.highlight.create({
      data: {
        clipId: clip.id,
        title,
        startTime,
        endTime,
      },
    });

    const highlightPath = getHighlightPath(highlight.id);

    // Extract lossless clip using ffmpeg -c copy (sub-second execution)
    await extractLosslessClip(clip.storageOriginal, highlightPath, startTime, endTime);

    // Update with file path
    const updated = await prisma.highlight.update({
      where: { id: highlight.id },
      data: { storageClip: highlightPath },
    });

    return NextResponse.json({
      success: true,
      highlight: updated,
      downloadUrl: `/api/clips/${clip.id}/highlight?highlightId=${highlight.id}&download=true`,
    });
  } catch (err: any) {
    console.error("Highlight extraction error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const highlightId = searchParams.get("highlightId");

    if (!highlightId) {
      const highlights = await prisma.highlight.findMany({
        where: { clipId: params.id },
        orderBy: { startTime: "asc" },
      });
      return NextResponse.json({ success: true, highlights });
    }

    const highlight = await prisma.highlight.findUnique({
      where: { id: highlightId },
    });

    if (!highlight || !highlight.storageClip || !fs.existsSync(highlight.storageClip)) {
      return new NextResponse("Highlight file not found", { status: 404 });
    }

    const fileStream = fs.createReadStream(highlight.storageClip);
    const stat = fs.statSync(highlight.storageClip);

    return new Response(fileStream as any, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": stat.size.toString(),
        "Content-Disposition": `attachment; filename="${highlight.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4"`,
      },
    });
  } catch (err: any) {
    return new NextResponse(`Error: ${err.message}`, { status: 500 });
  }
}
