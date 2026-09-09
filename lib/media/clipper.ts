import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

/**
 * Creates an instantaneous, lossless highlight cut without re-encoding (-c copy)
 */
export function extractLosslessClip(
  sourcePath: string,
  outputPath: string,
  startTimeSec: number,
  endTimeSec: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const duration = Math.max(0.1, endTimeSec - startTimeSec);

    ffmpeg(sourcePath)
      .seekInput(Math.max(0, startTimeSec))
      .duration(duration)
      .outputOptions([
        "-c copy",           // Zero re-encoding for 100% original quality
        "-avoid_negative_ts make_zero",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`Lossless clip extraction failed: ${err.message}`)))
      .run();
  });
}

/**
 * Grabs a pristine uncompressed 4K full-resolution frame snapshot at timestamp
 */
export function captureFrameSnapshot(
  sourcePath: string,
  outputPath: string,
  timestampSec: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    ffmpeg(sourcePath)
      .seekInput(Math.max(0, timestampSec))
      .frames(1)
      .outputOptions([
        "-q:v 1", // Highest quality
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`Frame capture failed: ${err.message}`)))
      .run();
  });
}
