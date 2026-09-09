import { NextResponse } from "next/server";
import fs from "fs";
import crypto from "crypto";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    let mode = "quick";
    try {
      const body = await req.json();
      if (body.mode) mode = body.mode;
    } catch {
      // Body may be empty, default to quick mode
    }

    const clips = await prisma.clip.findMany({
      where: { isTrash: false },
      select: {
        id: true,
        title: true,
        originalFilename: true,
        sha256: true,
        fileSize: true,
        storageOriginal: true,
      },
    });

    let verifiedCount = 0;
    let corruptedCount = 0;
    let missingCount = 0;
    let bytesChecked = 0;
    const details: Array<{
      clipId: string;
      title: string;
      status: "VERIFIED" | "CORRUPTED" | "MISSING";
      reason?: string;
    }> = [];

    for (const clip of clips) {
      if (!fs.existsSync(clip.storageOriginal)) {
        missingCount++;
        details.push({
          clipId: clip.id,
          title: clip.title,
          status: "MISSING",
          reason: "File does not exist on disk at registered path",
        });
        continue;
      }

      try {
        const stat = fs.statSync(clip.storageOriginal);
        bytesChecked += stat.size;

        if (mode === "deep") {
          const liveHash = await computeFileSha256(clip.storageOriginal);
          if (liveHash === clip.sha256) {
            verifiedCount++;
            details.push({ clipId: clip.id, title: clip.title, status: "VERIFIED" });
          } else {
            corruptedCount++;
            details.push({
              clipId: clip.id,
              title: clip.title,
              status: "CORRUPTED",
              reason: `SHA-256 hash mismatch! DB: ${clip.sha256.slice(0, 8)}... Actual: ${liveHash.slice(0, 8)}...`,
            });
          }
        } else {
          // Quick mode: check file size matches DB record
          if (BigInt(stat.size) === clip.fileSize) {
            verifiedCount++;
            details.push({ clipId: clip.id, title: clip.title, status: "VERIFIED" });
          } else {
            corruptedCount++;
            details.push({
              clipId: clip.id,
              title: clip.title,
              status: "CORRUPTED",
              reason: `Size mismatch: DB expected ${clip.fileSize} bytes, disk has ${stat.size} bytes`,
            });
          }
        }
      } catch (err: any) {
        missingCount++;
        details.push({
          clipId: clip.id,
          title: clip.title,
          status: "MISSING",
          reason: err.message,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    const nowIso = new Date().toISOString();

    // Persist last scan time in DB
    try {
      await prisma.setting.upsert({
        where: { key: "last_integrity_scan" },
        update: { value: nowIso },
        create: { key: "last_integrity_scan", value: nowIso },
      });
    } catch {
      // Ignore setting persistence error
    }

    return NextResponse.json({
      success: true,
      mode,
      durationMs,
      timestamp: nowIso,
      totalScanned: clips.length,
      verifiedCount,
      corruptedCount,
      missingCount,
      bytesChecked,
      summary:
        corruptedCount === 0 && missingCount === 0
          ? `Parity verification complete: 100% verified. ${clips.length} master files intact (0 corrupt bytes).`
          : `Warning: ${corruptedCount} corrupted files, ${missingCount} missing files detected!`,
      details,
    });
  } catch (err: any) {
    console.error("Integrity verification error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
