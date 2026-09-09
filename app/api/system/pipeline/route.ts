import { NextResponse } from "next/server";
import fs from "fs";
import prisma from "@/lib/db/prisma";
import { generatePoster, generateStoryboard } from "@/lib/media/thumbnails";
import { getThumbnailPath, getStoryboardImagePath, getStoryboardVttPath } from "@/lib/vaultStorage/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const activeTasks = await prisma.clip.findMany({
      where: {
        status: {
          in: ["PENDING", "UPLOADING", "ANALYZING", "GENERATING_PREVIEWS"],
        },
      },
      include: {
        game: {
          select: { name: true, accentColor: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const recentTasks = await prisma.clip.findMany({
      where: {
        status: {
          in: ["READY", "FAILED"],
        },
      },
      include: {
        game: {
          select: { name: true, accentColor: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    });

    const formattedActive = activeTasks.map((c) => ({
      id: c.id,
      title: c.title,
      originalFilename: c.originalFilename,
      status: c.status,
      errorMessage: c.errorMessage,
      fileSize: Number(c.fileSize),
      duration: c.duration,
      width: c.width,
      height: c.height,
      fps: c.fps,
      codec: c.codec,
      gameName: c.game?.name || "Uncategorized",
      gameColor: c.game?.accentColor || "#007AFF",
      updatedAt: c.updatedAt.toISOString(),
      hasThumbnail: !!c.storageThumbnail && fs.existsSync(c.storageThumbnail),
      hasStoryboard: !!c.storageStoryboard && fs.existsSync(c.storageStoryboard),
    }));

    const formattedRecent = recentTasks.map((c) => ({
      id: c.id,
      title: c.title,
      originalFilename: c.originalFilename,
      status: c.status,
      errorMessage: c.errorMessage,
      fileSize: Number(c.fileSize),
      duration: c.duration,
      width: c.width,
      height: c.height,
      fps: c.fps,
      codec: c.codec,
      gameName: c.game?.name || "Uncategorized",
      gameColor: c.game?.accentColor || "#007AFF",
      updatedAt: c.updatedAt.toISOString(),
      hasThumbnail: !!c.storageThumbnail && fs.existsSync(c.storageThumbnail),
      hasStoryboard: !!c.storageStoryboard && fs.existsSync(c.storageStoryboard),
    }));

    return NextResponse.json({
      success: true,
      active: formattedActive,
      recent: formattedRecent,
      counts: {
        active: formattedActive.length,
        recent: formattedRecent.length,
      },
    });
  } catch (err: any) {
    console.error("Error fetching pipeline:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, clipId } = body;

    if (action === "reprocess") {
      if (!clipId) {
        return NextResponse.json({ success: false, error: "Missing clipId" }, { status: 400 });
      }

      const clip = await prisma.clip.findUnique({ where: { id: clipId } });
      if (!clip) {
        return NextResponse.json({ success: false, error: "Clip not found" }, { status: 404 });
      }

      if (!fs.existsSync(clip.storageOriginal)) {
        return NextResponse.json({ success: false, error: "Original file missing on disk" }, { status: 400 });
      }

      // Mark clip as generating previews
      await prisma.clip.update({
        where: { id: clipId },
        data: { status: "GENERATING_PREVIEWS" },
      });

      const thumbPath = getThumbnailPath(clipId);
      const spritePath = getStoryboardImagePath(clipId);
      const vttPath = getStoryboardVttPath(clipId);

      try {
        const posterTime = Math.max(1.8, Math.min(10.0, (clip.duration || 10) * 0.2));
        await generatePoster(clip.storageOriginal, thumbPath, posterTime);
      } catch (err: any) {
        console.warn(`Poster generation warning for clip ${clipId}:`, err.message);
      }

      try {
        await generateStoryboard(clip.storageOriginal, spritePath, vttPath, clipId, clip.duration);
      } catch (err: any) {
        console.warn(`Storyboard generation warning for clip ${clipId}:`, err.message);
      }

      const updated = await prisma.clip.update({
        where: { id: clipId },
        data: {
          status: "READY",
          storageThumbnail: fs.existsSync(thumbPath) ? thumbPath : clip.storageThumbnail,
          storageStoryboard: fs.existsSync(spritePath) ? spritePath : clip.storageStoryboard,
          storageStoryboardVtt: fs.existsSync(vttPath) ? vttPath : clip.storageStoryboardVtt,
          errorMessage: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Clip '${clip.title}' reprocessed successfully`,
        clip: updated,
      });
    }

    if (action === "regenerate_all_thumbnails") {
      const allClips = await prisma.clip.findMany({
        where: { isTrash: false },
      });

      let updatedCount = 0;
      for (const c of allClips) {
        if (c.storageOriginal && fs.existsSync(c.storageOriginal)) {
          const thumbPath = getThumbnailPath(c.id);
          try {
            const posterTime = Math.max(1.8, Math.min(10.0, (c.duration || 10) * 0.2));
            await generatePoster(c.storageOriginal, thumbPath, posterTime);
            await prisma.clip.update({
              where: { id: c.id },
              data: {
                storageThumbnail: thumbPath,
                updatedAt: new Date(),
              },
            });
            updatedCount++;
          } catch (e: any) {
            console.error(`Error regenerating thumbnail for clip ${c.id}:`, e.message);
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Regenerated Ultra HD thumbnails for ${updatedCount} clips`,
        count: updatedCount,
      });
    }

    if (action === "reprocess_all_missing") {
      const allClips = await prisma.clip.findMany({
        where: { isTrash: false },
      });

      let queued = 0;
      for (const c of allClips) {
        const hasThumb = c.storageThumbnail && fs.existsSync(c.storageThumbnail);
        const hasStory = c.storageStoryboard && fs.existsSync(c.storageStoryboard);

        if ((!hasThumb || !hasStory) && fs.existsSync(c.storageOriginal)) {
          const thumbPath = getThumbnailPath(c.id);
          const spritePath = getStoryboardImagePath(c.id);
          const vttPath = getStoryboardVttPath(c.id);

          try {
            if (!hasThumb) {
              const posterTime = Math.max(1.8, Math.min(10.0, (c.duration || 10) * 0.2));
              await generatePoster(c.storageOriginal, thumbPath, posterTime);
            }
            if (!hasStory) {
              await generateStoryboard(c.storageOriginal, spritePath, vttPath, c.id, c.duration);
            }

            await prisma.clip.update({
              where: { id: c.id },
              data: {
                storageThumbnail: fs.existsSync(thumbPath) ? thumbPath : c.storageThumbnail,
                storageStoryboard: fs.existsSync(spritePath) ? spritePath : c.storageStoryboard,
                storageStoryboardVtt: fs.existsSync(vttPath) ? vttPath : c.storageStoryboardVtt,
                status: "READY",
              },
            });
            queued++;
          } catch (e: any) {
            console.error(`Error generating for clip ${c.id}:`, e.message);
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Reprocessed ${queued} clips with missing previews`,
        count: queued,
      });
    }

    if (action === "cancel") {
      if (!clipId) {
        return NextResponse.json({ success: false, error: "Missing clipId" }, { status: 400 });
      }

      await prisma.clip.update({
        where: { id: clipId },
        data: {
          status: "FAILED",
          errorMessage: "Manually cancelled by operator",
        },
      });

      return NextResponse.json({ success: true, message: "Task cancelled" });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("Pipeline action error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
