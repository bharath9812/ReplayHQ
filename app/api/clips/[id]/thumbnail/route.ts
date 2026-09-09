import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import fs from "fs";
import { generatePoster } from "@/lib/media/thumbnails";
import { getThumbnailPath } from "@/lib/vaultStorage/paths";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clip = await prisma.clip.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        storageThumbnail: true,
        storageOriginal: true,
        duration: true,
      },
    });

    if (!clip) {
      return new NextResponse("Clip not found", { status: 404 });
    }

    const force = req.nextUrl.searchParams.get("force") === "true";
    const thumbPath = clip.storageThumbnail || getThumbnailPath(clip.id);
    let needsGen = !fs.existsSync(thumbPath) || force;

    // Automatic Quality Upgrade:
    // Old thumbnails created with the -q:v 2 bug have file sizes < 120KB and look muddy/pixelated.
    // If original master exists and current thumbnail is low quality (< 120KB), automatically regenerate Ultra HD poster!
    if (!needsGen && fs.existsSync(thumbPath) && clip.storageOriginal && fs.existsSync(clip.storageOriginal)) {
      try {
        const s = fs.statSync(thumbPath);
        if (s.size < 120000) {
          needsGen = true;
        }
      } catch {}
    }

    if (needsGen && clip.storageOriginal && fs.existsSync(clip.storageOriginal)) {
      try {
        const posterTime = Math.max(1.8, Math.min(10.0, (clip.duration || 10) * 0.2));
        await generatePoster(clip.storageOriginal, thumbPath, posterTime);
        if (!clip.storageThumbnail || clip.storageThumbnail !== thumbPath) {
          await prisma.clip.update({
            where: { id: clip.id },
            data: { storageThumbnail: thumbPath },
          });
        }
      } catch (genErr: any) {
        console.warn(`On-demand poster generation warning for ${clip.id}:`, genErr.message);
      }
    }

    if (!fs.existsSync(thumbPath)) {
      return new NextResponse("Thumbnail not found", { status: 404 });
    }

    const stat = fs.statSync(thumbPath);
    const etag = `"${params.id}-${stat.mtimeMs}"`;
    const lastModified = stat.mtime.toUTCString();

    const clientEtag = req.headers.get("if-none-match");
    if (!force && clientEtag && clientEtag === etag) {
      return new NextResponse(null, { status: 304 });
    }

    const imageBuffer = fs.readFileSync(thumbPath);

    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/webp",
        "ETag": etag,
        "Last-Modified": lastModified,
        "Cache-Control": "no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    return new NextResponse(`Error: ${err.message}`, { status: 500 });
  }
}
