import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

/**
 * Generates an ultra-fast, web-optimized 1080p H.264 proxy with +faststart
 * (relocating the MOOV atom to the very front for 0ms seek times in browsers).
 * Original master files in /data/storage/originals/ remain 100% immutable and read-only.
 */
export function generatePreviewProxy(
  videoPath: string,
  outputPath: string,
  options: {
    maxHeight?: number;
    fps?: number;
  } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const maxHeight = options.maxHeight || 1080;

    // Faststart ensures the MOOV atom index is written at byte 0 of the MP4
    // so clients can begin playback immediately without downloading the whole file.
    const outputOptions = [
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-vf", `scale=-2:'min(${maxHeight},ih)'`,
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
    ];

    ffmpeg(videoPath)
      .outputOptions(outputOptions)
      .output(outputPath)
      .on("end", () => {
        resolve();
      })
      .on("error", (err) => {
        reject(new Error(`Preview proxy generation failed: ${err.message}`));
      })
      .run();
  });
}
