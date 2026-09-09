import { NextResponse } from "next/server";
import os from "os";
import fs from "fs";
import prisma from "@/lib/db/prisma";
import { getStorageStats } from "@/lib/vaultStorage/statsCache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Host Hardware Telemetry
    const cpus = os.cpus() || [];
    const cpuModel = cpus[0]?.model || "Intel Host Processor";
    const cpuCores = cpus.length || 4;
    const loadAvg = os.loadavg(); // [1m, 5m, 15m]
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

    // 2. Centralized Real Linux Storage Stats & Database Counts
    const [storageStats, totalTrash, favoriteClips, statusGroups, lastScanSetting, activeClips] = await Promise.all([
      getStorageStats(),
      prisma.clip.count({ where: { isTrash: true } }),
      prisma.clip.count({ where: { isFavorite: true, isTrash: false } }),
      prisma.clip.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.setting.findUnique({ where: { key: "last_integrity_scan" } }).catch(() => null),
      prisma.clip.findMany({
        where: { isTrash: false },
        select: { duration: true },
      }),
    ]);

    let totalDurationSec = 0;
    for (const c of activeClips) {
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
        poolTotalBytes: storageStats.poolTotalBytes,
        poolUsedBytes: storageStats.poolUsedBytes,
        poolFreeBytes: storageStats.poolAvailableBytes, // Guaranteed 100% consistent available space across all components
        poolAvailableBytes: storageStats.poolAvailableBytes,
        poolUsedPercent: storageStats.poolUsedPercent,
        rawUsedPercent: storageStats.rawUsedPercent,
        originalsBytes: storageStats.originalsBytes,
        derivedBytes: storageStats.derivedBytes,
        thumbnailsBytes: storageStats.thumbnailsBytes,
        storyboardsBytes: storageStats.storyboardsBytes,
        previewsBytes: storageStats.previewsBytes,
        trimmedClipsBytes: storageStats.trimmedClipsBytes,
        appStorageBytes: storageStats.appStorageBytes,
        otherHostBytes: storageStats.otherHostBytes,
        immutableOriginalsProtected: true,
        lastIntegrityScan: lastScanSetting?.value || null,
      },
      pipeline: {
        totalClips: storageStats.totalClips,
        trashClips: totalTrash,
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
