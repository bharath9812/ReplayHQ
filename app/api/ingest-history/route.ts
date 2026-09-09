import { NextRequest, NextResponse } from "next/server";
import { STORAGE_ROOT, ensureStorageDirectories } from "@/lib/storage/config";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

function getHistoryFilePath(): string {
  ensureStorageDirectories();
  return path.join(STORAGE_ROOT, "derived", "ingest_history.json");
}

export interface IngestHistoryRecord {
  id: string;
  filename: string;
  fileSize: number;
  uploadDurationSeconds: number;
  processingDurationSeconds: number;
  totalDurationSeconds: number;
  averageSpeedBytesPerSec: number;
  peakSpeedBytesPerSec: number;
  sha256?: string;
  status: "completed" | "duplicate" | "error";
  errorMessage?: string;
  completedAt: string;
}

function readHistoryFromFile(): IngestHistoryRecord[] {
  try {
    const filePath = getHistoryFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("[Ingest History] Failed to read history file:", err);
    return [];
  }
}

function writeHistoryToFile(records: IngestHistoryRecord[]): boolean {
  try {
    const filePath = getHistoryFilePath();
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(records, null, 2), "utf-8");
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error("[Ingest History] Failed to write history file:", err);
    return false;
  }
}

function appendHistoryRecord(record: IngestHistoryRecord): boolean {
  try {
    const records = readHistoryFromFile();
    const filtered = records.filter((r) => r.id !== record.id);
    const updated = [record, ...filtered].slice(0, 100);
    return writeHistoryToFile(updated);
  } catch (err) {
    console.error("[Ingest History] Failed to append history record:", err);
    return false;
  }
}

// GET: Retrieve persistent ingest history
export async function GET() {
  const records = readHistoryFromFile();
  return NextResponse.json({ success: true, records }, { headers: NO_CACHE_HEADERS });
}

// POST: Add or update an ingest history record
export async function POST(req: NextRequest) {
  try {
    const record: IngestHistoryRecord = await req.json();
    if (!record || !record.id || !record.filename) {
      return NextResponse.json(
        { success: false, error: "Invalid record data: id and filename required" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    appendHistoryRecord(record);

    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to save history" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

// DELETE: Clear all history or delete a single entry by ?id=...
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get("id");

    if (targetId) {
      const records = readHistoryFromFile();
      const updated = records.filter((r) => r.id !== targetId);
      writeHistoryToFile(updated);
      return NextResponse.json({ success: true, count: updated.length }, { headers: NO_CACHE_HEADERS });
    }

    // Clear all history
    writeHistoryToFile([]);
    return NextResponse.json({ success: true, message: "Ingest history cleared" }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to clear history" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
