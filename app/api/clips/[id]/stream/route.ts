import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import fs from "fs";
import { Readable } from "stream";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clip = await prisma.clip.findUnique({
      where: { id: params.id },
      select: {
        storageOriginal: true,
        storagePreview: true,
        originalFilename: true,
        codec: true,
      },
    });

    if (!clip) {
      return new NextResponse("Clip not found", { status: 404 });
    }

    // Determine target stream file: Prefer proxy if available and original is heavy HEVC, or original directly
    let targetPath = clip.storageOriginal;
    if (clip.storagePreview && fs.existsSync(clip.storagePreview)) {
      targetPath = clip.storagePreview;
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return new NextResponse("Video file not found on disk", { status: 404 });
    }

    const stat = fs.statSync(targetPath);
    const fileSize = stat.size;
    const range = req.headers.get("range");

    let mimeType = "video/mp4";
    if (targetPath.endsWith(".webm")) mimeType = "video/webm";
    else if (targetPath.endsWith(".mov")) mimeType = "video/quicktime";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] && parts[1].trim() !== ""
        ? Math.min(parseInt(parts[1], 10), fileSize - 1)
        : fileSize - 1;

      if (start >= fileSize || end < start) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(targetPath, { start, end });
      const webStream = Readable.toWeb(fileStream);

      return new Response(webStream as any, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": mimeType,
          "Cache-Control": "private, max-age=86400",
        },
      });
    } else {
      const fileStream = fs.createReadStream(targetPath);
      const webStream = Readable.toWeb(fileStream);

      return new Response(webStream as any, {
        status: 200,
        headers: {
          "Content-Length": fileSize.toString(),
          "Content-Type": mimeType,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
  } catch (err: any) {
    console.error("Stream handler error:", err);
    return new NextResponse(`Streaming error: ${err.message}`, { status: 500 });
  }
}
