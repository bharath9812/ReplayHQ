import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { classifyClip } from "@/lib/media/classifier";
import { probeVideo } from "@/lib/media/probe";
import { generatePoster, generateStoryboard } from "@/lib/media/thumbnails";
import { getOriginalPath, getThumbnailPath, getStoryboardImagePath, getStoryboardVttPath } from "@/lib/storage/paths";
import { STORAGE_DIRS, ensureStorageDirectories } from "@/lib/storage/config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPLETE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

function getSanitizedPartPath(fingerprint: string): string {
  const safeName = fingerprint.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
  return path.join(STORAGE_DIRS.TEMP, `${safeName}.part`);
}

// Compute streaming sha256 without loading multi-gigabyte file into memory
async function calculateFileSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  await pipeline(stream, hash);
  return hash.digest("hex");
}

export async function POST(req: NextRequest) {
  ensureStorageDirectories();

  try {
    const body = await req.json();
    const {
      fingerprint,
      uploadId,
      filename,
      totalSize,
      title,
      description,
      gameId: manualGameId,
      folder: manualFolder,
      collectionIds: manualCollectionIds = [],
      isFavorite: manualIsFavorite = false,
      tags: manualTags = [],
    } = body;

    if (!fingerprint || !filename || !totalSize) {
      return NextResponse.json(
        { success: false, error: "Missing required complete parameters: fingerprint, filename, totalSize" },
        { status: 400, headers: COMPLETE_HEADERS }
      );
    }

    const partPath = getSanitizedPartPath(fingerprint);

    if (!partPath || !fs.existsSync(partPath)) {
      return NextResponse.json(
        { success: false, error: "Uploaded part file not found on server disk" },
        { status: 404, headers: COMPLETE_HEADERS }
      );
    }

    const stat = fs.statSync(partPath);
    if (stat.size !== totalSize) {
      return NextResponse.json(
        {
          success: false,
          error: `File size mismatch: expected ${totalSize} bytes, but found ${stat.size} bytes on disk.`,
          expectedSize: totalSize,
          actualSize: stat.size,
        },
        { status: 400, headers: COMPLETE_HEADERS }
      );
    }

    // 1. Calculate SHA-256 Checksum
    const sha256 = await calculateFileSha256(partPath);

    // 2. Deduplication check
    const existing = await prisma.clip.findUnique({
      where: { sha256 },
      include: { game: true },
    });

    if (existing) {
      try {
        fs.unlinkSync(partPath);
      } catch {}
      return NextResponse.json(
        {
          success: true,
          message: "File already safely archived in GameVault",
          clip: { ...existing, fileSize: existing.fileSize.toString() },
          isDuplicate: true,
        },
        { status: 200, headers: COMPLETE_HEADERS }
      );
    }

    // 3. Classify game & folder
    const classification = await classifyClip(filename);
    const finalGameId = manualGameId || classification.gameId;

    let targetFolder = classification.gameFolder;
    if (manualGameId) {
      const g = await prisma.game.findUnique({ where: { id: manualGameId } });
      if (g) targetFolder = g.folderName || g.slug;
    }

    // 4. Move to permanent immutable storage
    const clipId = crypto.randomUUID();
    const ext = path.extname(filename) || ".mp4";
    const originalDestPath = getOriginalPath(targetFolder, clipId, ext);

    const originalDir = path.dirname(originalDestPath);
    if (!fs.existsSync(originalDir)) {
      fs.mkdirSync(originalDir, { recursive: true });
    }

    // Atomic move from temp to originals
    fs.renameSync(partPath, originalDestPath);

    // Clean up tus metadata sidecar file (.json) if this was a tus upload
    try {
      const tusMetaPath = partPath + ".json";
      if (fs.existsSync(tusMetaPath)) {
        fs.unlinkSync(tusMetaPath);
      }
    } catch {}

    // Make original write-once & read-only (chmod 440)
    try {
      fs.chmodSync(originalDestPath, 0o440);
    } catch {}

    // 5. Extract metadata via ffprobe
    let metadata: any = {
      duration: 0,
      width: 1920,
      height: 1080,
      fps: 60.0,
      codec: "h264",
      audioCodec: "aac",
      bitrate: 0,
      recordedAt: new Date(),
      colorSpace: "Rec.709",
      pixFmt: "4:2:0 YUV",
      audioChannels: 2,
      audioSampleRate: 48000,
      deviceModel: filename.toLowerCase().includes("rpreplay")
        ? "Apple iPad (ReplayKit Screen Recording)"
        : "Direct Game Capture",
    };

    try {
      const probed = await probeVideo(originalDestPath);
      metadata = {
        duration: probed.duration,
        width: probed.width,
        height: probed.height,
        fps: probed.fps,
        codec: probed.codec,
        audioCodec: probed.audioCodec || "aac",
        bitrate: probed.bitrate || (probed.duration > 0 ? Math.round((totalSize * 8) / probed.duration) : 0),
        recordedAt: probed.recordedAt || new Date(),
        colorSpace: probed.colorSpace || "Rec.709",
        pixFmt: probed.pixFmt || "4:2:0 YUV",
        audioChannels: probed.audioChannels || 2,
        audioSampleRate: probed.audioSampleRate || 48000,
        deviceModel: probed.deviceModel || (filename.toLowerCase().includes("rpreplay")
          ? "Apple iPad (ReplayKit Screen Recording)"
          : "Direct Game Capture"),
      };
    } catch (probeErr) {
      console.warn("ffprobe warning:", probeErr);
    }

    // 6. Generate High-Res WebP Poster (avoiding initial black frames)
    const posterPath = getThumbnailPath(clipId);
    try {
      const posterTime = Math.max(1.5, Math.min(5.0, (metadata.duration || 10) * 0.2));
      await generatePoster(originalDestPath, posterPath, posterTime);
    } catch (posterErr) {
      console.warn("Poster generation warning:", posterErr);
    }

    // 7. Generate Storyboard Sprite Sheet & WebVTT
    const storyboardSpritePath = getStoryboardImagePath(clipId);
    const storyboardVttPath = getStoryboardVttPath(clipId);
    try {
      await generateStoryboard(
        originalDestPath,
        storyboardSpritePath,
        storyboardVttPath,
        clipId,
        metadata.duration || 10
      );
    } catch (storyboardErr) {
      console.warn("Storyboard generation warning:", storyboardErr);
    }

    const cleanTitle = (title ? title.trim() : "") || filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

    // 8. Insert into PostgreSQL DB
    const newClip = await prisma.clip.create({
      data: {
        id: clipId,
        title: cleanTitle,
        description: description ? description.trim() : null,
        originalFilename: filename,
        sha256,
        fileSize: BigInt(totalSize),
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        codec: metadata.codec,
        audioCodec: metadata.audioCodec,
        bitrate: metadata.bitrate,
        colorSpace: metadata.colorSpace,
        pixFmt: metadata.pixFmt,
        audioChannels: metadata.audioChannels,
        audioSampleRate: metadata.audioSampleRate,
        deviceModel: metadata.deviceModel,
        storageOriginal: originalDestPath,
        storageThumbnail: fs.existsSync(posterPath) ? posterPath : null,
        storageStoryboard: fs.existsSync(storyboardSpritePath) ? storyboardSpritePath : null,
        storageStoryboardVtt: fs.existsSync(storyboardVttPath) ? storyboardVttPath : null,
        status: "READY",
        gameId: finalGameId,
        folder: manualFolder && manualFolder.trim() ? manualFolder.trim() : null,
        isFavorite: Boolean(manualIsFavorite),
        recordedAt: metadata.recordedAt,
      },
      include: {
        game: true,
      },
    });

    // 9. Attach auto-extracted & user-selected tags
    let processedTags: string[] = [];
    if (Array.isArray(manualTags)) {
      processedTags = manualTags.map((t: string) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean);
    }
    const combinedTags = Array.from(new Set([...classification.autoTags, ...processedTags]));
    if (combinedTags.length > 0) {
      for (const t of combinedTags) {
        const tag = await prisma.tag.upsert({
          where: { name: t },
          update: {},
          create: { name: t },
        });

        await prisma.clipTag.create({
          data: {
            clipId: newClip.id,
            tagId: tag.id,
          },
        }).catch(() => {});
      }
    }

    // 10. Attach to custom collections if specified
    if (Array.isArray(manualCollectionIds) && manualCollectionIds.length > 0) {
      try {
        const setting = await prisma.setting.findUnique({
          where: { key: "vault_collections" },
        });
        if (setting && setting.value) {
          let collections = JSON.parse(setting.value);
          let modified = false;
          collections = collections.map((col: any) => {
            if (manualCollectionIds.includes(col.id) || manualCollectionIds.includes(col.slug)) {
              const set = new Set(col.clipIds || []);
              set.add(newClip.id);
              col.clipIds = Array.from(set);
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
        console.warn("Error attaching clip to collections:", colErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        clip: {
          ...newClip,
          fileSize: newClip.fileSize.toString(),
        },
      },
      { status: 200, headers: COMPLETE_HEADERS }
    );
  } catch (err: any) {
    console.error("[Upload Complete Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500, headers: COMPLETE_HEADERS }
    );
  }
}
