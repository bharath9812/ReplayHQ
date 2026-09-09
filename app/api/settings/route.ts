import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (key) {
      const setting = await prisma.setting.findUnique({
        where: { key },
      });
      return NextResponse.json({
        success: true,
        key,
        value: setting ? setting.value : null,
      });
    }

    const allSettings = await prisma.setting.findMany();
    const settingsMap: Record<string, string> = {};
    for (const s of allSettings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({
      success: true,
      settings: settingsMap,
    });
  } catch (err: any) {
    console.error("GET /api/settings error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

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
    const { key, value, settings } = body;

    if (settings && typeof settings === "object") {
      const entries = Object.entries(settings);
      for (const [k, v] of entries) {
        if (typeof k === "string" && typeof v === "string") {
          await prisma.setting.upsert({
            where: { key: k },
            update: { value: v },
            create: { key: k, value: v },
          });
        }
      }
      return NextResponse.json({ success: true, message: "Settings saved" });
    }

    if (!key || typeof key !== "string") {
      return NextResponse.json({ success: false, error: "Setting 'key' is required" }, { status: 400 });
    }

    const valStr = value !== undefined && value !== null ? String(value) : "";
    const saved = await prisma.setting.upsert({
      where: { key },
      update: { value: valStr },
      create: { key, value: valStr },
    });

    return NextResponse.json({ success: true, setting: saved });
  } catch (err: any) {
    console.error("POST /api/settings error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
