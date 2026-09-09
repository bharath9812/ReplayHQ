import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import fs from "fs";
import { generateStoryboard } from "@/lib/media/thumbnails";
import { getStoryboardImagePath, getStoryboardVttPath } from "@/lib/storage/paths";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const isVtt = searchParams.get("vtt") === "true";
    const forceRefresh = searchParams.get("refresh") === "true";

    const clip = await prisma.clip.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        duration: true,
        storageOriginal: true,
        storageStoryboard: true,
        storageStoryboardVtt: true,
      },
    });

    if (!clip) {
      return new NextResponse("Clip not found", { status: 404 });
    }

    const spritePath = clip.storageStoryboard || getStoryboardImagePath(clip.id);
    const vttPath = clip.storageStoryboardVtt || getStoryboardVttPath(clip.id);

    const spriteMissing = !fs.existsSync(spritePath);
    const vttMissing = !fs.existsSync(vttPath);

    // On-demand generation if missing or requested
    if (forceRefresh || spriteMissing || vttMissing) {
      if (clip.storageOriginal && fs.existsSync(clip.storageOriginal)) {
        try {
          await generateStoryboard(
            clip.storageOriginal,
            spritePath,
            vttPath,
            clip.id,
            clip.duration || 10
          );

          await prisma.clip.update({
            where: { id: clip.id },
            data: {
              storageStoryboard: spritePath,
              storageStoryboardVtt: vttPath,
            },
          });
        } catch (genErr: any) {
          console.warn("Failed on-demand storyboard generation:", genErr.message);
        }
      }
    }

    if (isVtt) {
      if (!fs.existsSync(vttPath)) {
        return new NextResponse("Storyboard VTT not found", { status: 404 });
      }

      const vttContent = fs.readFileSync(vttPath, "utf-8");
      return new NextResponse(vttContent, {
        headers: {
          "Content-Type": "text/vtt; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } else {
      if (!fs.existsSync(spritePath)) {
        return new NextResponse("Storyboard image not found", { status: 404 });
      }

      const imgBuffer = fs.readFileSync(spritePath);
      return new NextResponse(imgBuffer, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }
  } catch (err: any) {
    return new NextResponse(`Error: ${err.message}`, { status: 500 });
  }
}
