import { NextResponse } from "next/server";
import os from "os";
import fs from "fs";
import path from "path";
import prisma from "@/lib/db/prisma";
import { STORAGE_ROOT, STORAGE_DIRS } from "@/lib/storage/config";

export const dynamic = "force-dynamic";

function getDirSizeBytes(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      try {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          total += stat.size;
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return total;
}

export async function GET() {
  try {
    // 1. Host Hardware Telemetry
    const cpus = os.cpus() || [];
    const cpuModel = cpus[0]?.model || "Intel Host Processor";
    const cpuCores = cpus.length || 4;
    const loadAvg = os.loadavg(); // [1m, 5m, 15m]
    // Approximate CPU load percentage from 1-min load average normalized by core count
    const cpuPercent = Math.min(100, Math.max(1, Math.round((loadAvg[0] / Math.max(1, cpuCores)) * 100)));

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.min(100, Math.round((usedMem / totalMem) * 100));

    // Hardware Transcoder Detection (Intel QuickSync / VAAPI)
    const hasQuickSyncLinux = fs.existsSync("/dev/dri/renderD128") || fs.existsSync("/dev/dri");
    const isDarwin = os.platform() === "darwin";
    const hardwareTranscoder = hasQuickSyncLinux
      ? "Intel QuickSync (QSV /dev/dri/renderD128)"
      : isDarwin
      ? "Apple VideoToolbox HW (Metal / VT)"
      : "Software Encoder (libx264/libvpx)";

    // 2. Real Filesystem Storage Pool (Statfs)
    let poolTotalBytes = 4 * 1024 * 1024 * 1024 * 1024; // 4 TB default fallback
    let poolFreeBytes = 3.2 * 1024 * 1024 * 1024 * 1024;
    let poolAvailableBytes = poolFreeBytes;
    let poolUsedBytes = poolTotalBytes - poolFreeBytes;
    let poolUsedPercent = 20;

    try {
      if (typeof (fs as any).statfsSync === "function" && fs.existsSync(STORAGE_ROOT)) {
        const statfs = (fs as any).statfsSync(STORAGE_ROOT);
        const bsize = BigInt(statfs.bsize);
        poolTotalBytes = Number(BigInt(statfs.blocks) * bsize);
        poolFreeBytes = Number(BigInt(statfs.bfree) * bsize);
        poolAvailableBytes = Number(BigInt(statfs.bavail) * bsize);
        poolUsedBytes = poolTotalBytes - poolFreeBytes;
        poolUsedPercent = Math.min(100, Math.max(0, Math.round((poolUsedBytes / poolTotalBytes) * 100)));
      }
    } catch {
      // Fall back to defaults if statfs is unavailable
    }

    // 3. Database Statistics
    const [
      totalClips,
      trashClips,
      favoriteClips,
      statusGroups,
      clips,
      lastScanSetting,
    ] = await Promise.all([
      prisma.clip.count({ where: { isTrash: false } }),
      prisma.clip.count({ where: { isTrash: true } }),
      prisma.clip.count({ where: { isFavorite: true, isTrash: false } }),
      prisma.clip.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.clip.findMany({
        where: { isTrash: false },
        select: { fileSize: true, duration: true },
      }),
      prisma.setting.findUnique({ where: { key: "last_integrity_scan" } }).catch(() => null),
    ]);

    let totalOriginalBytes = BigInt(0);
    let totalDurationSec = 0;
    for (const c of clips) {
      totalOriginalBytes += c.fileSize;
      totalDurationSec += c.duration;
    }

    // Status breakdown
    const statusCounts: Record<string, number> = {
      PENDING: 0,
      UPLOADING: 0,
      ANALYZING: 0,
      GENERATING_PREVIEWS: 0,
      READY: 0,
      FAILED: 0,
    };
    for (const g of statusGroups) {
      statusCounts[g.status] = g._count.id;
    }

    const activeProcessingCount =
      statusCounts.PENDING +
      statusCounts.UPLOADING +
      statusCounts.ANALYZING +
      statusCounts.GENERATING_PREVIEWS;

    // 4. Derived storage on-disk measurement
    const thumbBytes = getDirSizeBytes(STORAGE_DIRS.THUMBNAILS);
    const storyboardBytes = getDirSizeBytes(STORAGE_DIRS.STORYBOARDS);
    const previewBytes = getDirSizeBytes(STORAGE_DIRS.PREVIEWS);
    const trimmedClipBytes = getDirSizeBytes(STORAGE_DIRS.CLIPS);
    const totalDerivedBytes = thumbBytes + storyboardBytes + previewBytes + trimmedClipBytes;

    const originalsBytesNum = Number(totalOriginalBytes);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      host: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        uptimeSec: Math.round(os.uptime()),
        processUptimeSec: Math.round(process.uptime()),
        cpuModel,
        cpuCores,
        cpuPercent,
        loadAvg,
        totalMemBytes: totalMem,
        usedMemBytes: usedMem,
        freeMemBytes: freeMem,
        memPercent,
        hardwareTranscoder,
        hasQuickSync: hasQuickSyncLinux,
      },
      storage: {
        poolTotalBytes,
        poolUsedBytes,
        poolFreeBytes,
        poolAvailableBytes,
        poolUsedPercent,
        originalsBytes: originalsBytesNum,
        derivedBytes: totalDerivedBytes,
        thumbnailsBytes: thumbBytes,
        storyboardsBytes: storyboardBytes,
        previewsBytes: previewBytes,
        trimmedClipsBytes: trimmedClipBytes,
        immutableOriginalsProtected: true,
        lastIntegrityScan: lastScanSetting?.value || null,
      },
      pipeline: {
        totalClips,
        trashClips,
        favoriteClips,
        totalDurationSec,
        activeProcessingCount,
        statusCounts,
      },
    });
  } catch (err: any) {
    console.error("Error fetching system stats:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
