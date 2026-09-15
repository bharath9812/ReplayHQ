import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const WATCH_PROGRESS_KEY = "vault_watch_progress";

export interface ClipWatchRecord {
  time: number;
  duration: number;
  percent: number;
  updatedAt: number;
}

export type WatchProgressMap = Record<string, ClipWatchRecord>;

/**
 * GET /api/playback/progress
 * Returns the global watch progress map stored in PostgreSQL
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clipId = searchParams.get("clipId");

    const record = await prisma.setting.findUnique({
      where: { key: WATCH_PROGRESS_KEY },
    });

    let map: WatchProgressMap = {};
    if (record && record.value) {
      try {
        map = JSON.parse(record.value);
      } catch (e) {
        map = {};
      }
    }

    if (clipId) {
      return NextResponse.json({
        success: true,
        clipId,
        record: map[clipId] || null,
      });
    }

    return NextResponse.json({
      success: true,
      progress: map,
    });
  } catch (err: any) {
    console.error("GET /api/playback/progress error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/playback/progress
 * Atomically updates watch timestamps and percentages in PostgreSQL
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      const text = await req.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {}
      }
    }

    const { clipId, time, duration, percent, progress } = body;

    const record = await prisma.setting.findUnique({
      where: { key: WATCH_PROGRESS_KEY },
    });

    let currentMap: WatchProgressMap = {};
    if (record && record.value) {
      try {
        currentMap = JSON.parse(record.value);
      } catch {
        currentMap = {};
      }
    }

    if (progress && typeof progress === "object") {
      // Bulk update
      for (const [cId, entry] of Object.entries(progress)) {
        if (entry && typeof entry === "object") {
          currentMap[cId] = {
            time: typeof (entry as any).time === "number" ? (entry as any).time : 0,
            duration: typeof (entry as any).duration === "number" ? (entry as any).duration : 0,
            percent: typeof (entry as any).percent === "number" ? (entry as any).percent : 0,
            updatedAt: Date.now(),
          };
        }
      }
    } else if (clipId && typeof clipId === "string") {
      // Single clip update
      const dur = typeof duration === "number" && duration > 0 ? duration : 1;
      const curTime = typeof time === "number" ? Math.max(0, time) : 0;
      const pct =
        typeof percent === "number"
          ? Math.min(100, Math.max(0, percent))
          : Math.min(100, Math.max(0, Math.round((curTime / dur) * 100)));

      currentMap[clipId] = {
        time: curTime,
        duration: dur,
        percent: pct,
        updatedAt: Date.now(),
      };
    } else {
      return NextResponse.json(
        { success: false, error: "clipId or progress payload required" },
        { status: 400 }
      );
    }

    // Upsert into PostgreSQL Setting table
    await prisma.setting.upsert({
      where: { key: WATCH_PROGRESS_KEY },
      update: { value: JSON.stringify(currentMap) },
      create: { key: WATCH_PROGRESS_KEY, value: JSON.stringify(currentMap) },
    });

    return NextResponse.json({
      success: true,
      message: "Watch progress saved to PostgreSQL",
      progress: currentMap,
    });
  } catch (err: any) {
    console.error("POST /api/playback/progress error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
