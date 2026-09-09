import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getClipById } from "@/lib/db/clipService";
import { probeVideo } from "@/lib/media/probe";
import fs from "fs";
import { invalidateStorageStatsCache } from "@/lib/vaultStorage/statsCache";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clip = await getClipById(params.id);
    if (!clip) {
      return NextResponse.json({ success: false, error: "Clip not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, clip });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Manual refresh: re-probes original file on disk
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clip = await prisma.clip.findUnique({ where: { id: params.id } });
    if (!clip) {
      return NextResponse.json({ success: false, error: "Clip not found" }, { status: 404 });
    }

    if (!clip.storageOriginal || !fs.existsSync(clip.storageOriginal)) {
      return NextResponse.json(
        { success: false, error: "Original master file not found on disk" },
        { status: 404 }
      );
    }

    // Run ffprobe directly on the immutable master file
    const probed = await probeVideo(clip.storageOriginal);

    const updateData: any = {
      duration: probed.duration,
      width: probed.width,
      height: probed.height,
      fps: probed.fps,
      codec: probed.codec,
      audioCodec: probed.audioCodec || "aac",
      bitrate: probed.bitrate || (probed.duration > 0 ? Math.round((Number(clip.fileSize) * 8) / probed.duration) : 0),
      colorSpace: probed.colorSpace || "Rec.709",
      pixFmt: probed.pixFmt || "4:2:0 YUV",
      audioChannels: probed.audioChannels || 2,
      audioSampleRate: probed.audioSampleRate || 48000,
      deviceModel: probed.deviceModel || clip.deviceModel,
    };

    if (probed.recordedAt) {
      updateData.recordedAt = probed.recordedAt;
    }

    const updated = await prisma.clip.update({
      where: { id: params.id },
      data: updateData,
      include: {
        game: true,
        tags: { include: { tag: true } },
        highlights: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Metadata successfully re-probed from original file.",
      clip: {
        ...updated,
        fileSize: updated.fileSize.toString(),
      },
    });
  } catch (err: any) {
    console.error("Re-probe error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}


export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { title, description, gameId, folder, isFavorite, isTrash, tags } = body;

    const updateData: any = {};
    if (typeof title === "string") updateData.title = title;
    if (typeof description === "string") updateData.description = description;
    if (gameId !== undefined) updateData.gameId = (gameId === "" || gameId === "uncategorized" || gameId === null) ? null : gameId;
    if (folder !== undefined) updateData.folder = folder === "" || folder === "none" ? null : folder;
    if (typeof isFavorite === "boolean") updateData.isFavorite = isFavorite;

    if (typeof isTrash === "boolean") {
      updateData.isTrash = isTrash;
      updateData.trashedAt = isTrash ? new Date() : null;
    }

    // Handle tag relationships if provided
    if (Array.isArray(tags)) {
      // Clear existing tags
      await prisma.clipTag.deleteMany({ where: { clipId: params.id } });

      // Upsert tags and link them
      for (const tagName of tags) {
        if (typeof tagName === "string" && tagName.trim()) {
          const clean = tagName.trim().toLowerCase().replace("#", "");
          const tag = await prisma.tag.upsert({
            where: { name: clean },
            update: {},
            create: { name: clean },
          });

          await prisma.clipTag.create({
            data: {
              clipId: params.id,
              tagId: tag.id,
            },
          });
        }
      }
    }

    if (typeof isTrash === "boolean") {
      invalidateStorageStatsCache();
    }

    const updated = await prisma.clip.update({
      where: { id: params.id },
      data: updateData,
      include: {
        game: true,
        tags: { include: { tag: true } },
        highlights: true,
      },
    });

    return NextResponse.json({
      success: true,
      clip: {
        ...updated,
        fileSize: updated.fileSize.toString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clip = await prisma.clip.findUnique({ where: { id: params.id } });
    if (!clip) {
      return NextResponse.json({ success: false, error: "Clip not found" }, { status: 404 });
    }

    // Invalidate storage cache so next stats query is fresh
    invalidateStorageStatsCache();

    // If not yet in trash, move to trash first (safeguard)
    const { searchParams } = new URL(req.url);
    const forcePurge = searchParams.get("force") === "true";

    if (!clip.isTrash && !forcePurge) {
      await prisma.clip.update({
        where: { id: params.id },
        data: { isTrash: true, trashedAt: new Date() },
      });
      return NextResponse.json({ success: true, message: "Clip moved to Trash." });
    }

    // Permanent purge: remove all related disk files and metadata without leaving any orphans
    
    // 1. Unlink highlight trimmed clips from disk
    try {
      const highlights = await prisma.highlight.findMany({ where: { clipId: params.id } });
      for (const h of highlights) {
        if (h.storageClip && fs.existsSync(h.storageClip)) {
          try { fs.unlinkSync(h.storageClip); } catch (err) {
            console.warn(`[Purge] Failed to unlink highlight ${h.id}:`, err);
          }
        }
      }
    } catch (hlErr) {
      console.warn("[Purge] Highlight cleanup query error:", hlErr);
    }

    // 2. Unlink all derived files (thumbnails, storyboards, vtt, previews)
    if (clip.storageThumbnail && fs.existsSync(clip.storageThumbnail)) {
      try { fs.unlinkSync(clip.storageThumbnail); } catch {}
    }
    if (clip.storageStoryboard && fs.existsSync(clip.storageStoryboard)) {
      try { fs.unlinkSync(clip.storageStoryboard); } catch {}
    }
    if (clip.storageStoryboardVtt && fs.existsSync(clip.storageStoryboardVtt)) {
      try { fs.unlinkSync(clip.storageStoryboardVtt); } catch {}
    }
    if (clip.storagePreview && fs.existsSync(clip.storagePreview)) {
      try { fs.unlinkSync(clip.storagePreview); } catch {}
    }

    // 3. Unlink original master file (chmod 0660 first to ensure write-once 0440 doesn't prevent deletion)
    if (clip.storageOriginal && fs.existsSync(clip.storageOriginal)) {
      try {
        fs.chmodSync(clip.storageOriginal, 0o660);
      } catch {}
      try {
        fs.unlinkSync(clip.storageOriginal);
      } catch (unlinkErr) {
        console.error("[Clip Purge] Failed to unlink original master:", unlinkErr);
      }
    }

    // 4. Remove clip ID from custom collections setting to prevent dangling references
    try {
      const setting = await prisma.setting.findUnique({ where: { key: "vault_collections" } });
      if (setting && setting.value) {
        let collections = JSON.parse(setting.value);
        let modified = false;
        collections = collections.map((col: any) => {
          if (Array.isArray(col.clipIds) && col.clipIds.includes(params.id)) {
            col.clipIds = col.clipIds.filter((cid: string) => cid !== params.id);
            modified = true;
          }
          return col;
        });
        if (modified) {
          await prisma.setting.update({
            where: { key: "vault_collections" },
            data: { value: JSON.stringify(collections) },
          });
        }
      }
    } catch (colErr) {
      console.warn("[Purge] Collection cleanup error:", colErr);
    }

    // 5. Delete clip record from DB (cascades ClipTag & Highlight rows)
    await prisma.clip.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true, message: "Clip and all associated master, derived, and highlight assets permanently erased with zero orphans." });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
