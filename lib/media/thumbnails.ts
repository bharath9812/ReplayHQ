import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

function formatVttTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/**
 * Generates an ultra-high-definition WebP poster image for the video (Retina & 4K ready)
 */
export function generatePoster(
  videoPath: string,
  outputPath: string,
  timestampSeconds: number = 2
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Clean existing file to ensure full overwrite
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch {}
    }

    // High-Fidelity Encoder Options:
    // 1. -c:v libwebp at quality 92 (Previous bug: -q:v 2 set quality to 2% out of 100 in libwebp!)
    // 2. -compression_level 4 (optimal balance between encode speed and byte efficiency)
    // 3. -preset picture (optimizes WebP for crisp sharp edges, UI text, and game textures)
    // 4. -vf scale=min(2560\,iw):-2:flags=lanczos
    //    - Preserves native resolution up to 2560px wide (QHD) so cards look razor-sharp on 4K & Retina monitors
    //    - Uses Lanczos resampling filter for sharp clarity without blur
    //    - Keeps even dimensions (-2)
    ffmpeg(videoPath)
      .seekInput(Math.max(0, timestampSeconds))
      .frames(1)
      .outputOptions([
        "-c:v", "libwebp",
        "-quality", "90",
        "-compression_level", "2",
        "-preset", "picture",
        "-vf", "scale=min(2560\\,iw):-2:flags=bicubic",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => {
        console.warn("High-res libwebp poster generation fallback:", err.message);
        // Fallback without special presets if codec flags differ
        ffmpeg(videoPath)
          .seekInput(Math.max(0, timestampSeconds))
          .frames(1)
          .outputOptions([
            "-quality", "92",
            "-vf", "scale=min(1920\\,iw):-2",
          ])
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err2) => reject(new Error(`Poster generation failed: ${err2.message}`)))
          .run();
      })
      .run();
  });
}

/**
 * Generates a high-definition tiled WebP sprite sheet and corresponding WebVTT file for timeline hover-scrubbing
 */
export function generateStoryboard(
  videoPath: string,
  spriteOutputPath: string,
  vttOutputPath: string,
  clipId: string,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(spriteOutputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // High-Definition Retina-Ready Storyboard Tiles (320x180 per keyframe tile)
    const frameWidth = 320;
    const frameHeight = 180;
    const targetFrames = 100;
    const interval = Math.max(0.5, Math.round((duration / targetFrames) * 10) / 10);
    const totalFrames = Math.min(100, Math.max(1, Math.floor(duration / Math.max(0.1, interval))));

    const cols = 10;
    const rows = Math.ceil(totalFrames / cols);

    // Filter: extract at fps=1/interval, scale cleanly with fast bicubic filter, tile cols x rows
    const filter = `fps=1/${interval},scale=${frameWidth}:${frameHeight}:flags=bicubic,tile=${cols}x${rows}`;

    const command = ffmpeg(videoPath);

    // For videos longer than 60s, skip decoding non-keyframes to speed up generation 20x-50x
    if (duration > 60) {
      command.inputOptions(["-skip_frame", "nokey"]);
    }

    command
      .outputOptions([
        "-vf", filter,
        "-c:v", "libwebp",
        "-quality", "75",
        "-compression_level", "2",
        "-frames:v", "1"
      ])
      .output(spriteOutputPath)
      .on("end", () => {
        // Generate WebVTT
        let vtt = "WEBVTT\n\n";

        for (let i = 0; i < totalFrames; i++) {
          const startSec = i * interval;
          const endSec = Math.min(duration, (i + 1) * interval);
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = col * frameWidth;
          const y = row * frameHeight;

          vtt += `${formatVttTimestamp(startSec)} --> ${formatVttTimestamp(endSec)}\n`;
          vtt += `/api/clips/${clipId}/storyboard#xywh=${x},${y},${frameWidth},${frameHeight}\n\n`;
        }

        fs.writeFileSync(vttOutputPath, vtt, "utf-8");
        resolve();
      })
      .on("error", (err) => {
        // Fallback: If tile filter fails, generate a single high-definition frame
        console.warn(`Storyboard generation warning: ${err.message}, fallback high-res poster`);
        generatePoster(videoPath, spriteOutputPath, Math.min(2, duration / 2))
          .then(() => {
            const vtt = `WEBVTT\n\n00:00:00.000 --> ${formatVttTimestamp(duration)}\n/api/clips/${clipId}/storyboard#xywh=0,0,${frameWidth},${frameHeight}\n`;
            fs.writeFileSync(vttOutputPath, vtt, "utf-8");
            resolve();
          })
          .catch(reject);
      })
      .run();
  });
}
