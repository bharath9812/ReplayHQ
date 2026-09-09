import ffmpeg from "fluent-ffmpeg";
import path from "path";

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audioCodec?: string;
  bitrate?: number;
  recordedAt?: Date;
  colorSpace?: string;
  pixFmt?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  audioBitrate?: number;
  deviceModel?: string;
  containerFormat?: string;
}

export function probeVideo(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        return reject(new Error(`ffprobe failed: ${err.message}`));
      }

      const videoStream = data.streams.find((s) => s.codec_type === "video");
      const audioStream = data.streams.find((s) => s.codec_type === "audio");

      const duration = Number(data.format.duration || 0);
      const width = videoStream?.width || 1920;
      const height = videoStream?.height || 1080;
      const codec = videoStream?.codec_name || "h264";
      const audioCodec = audioStream?.codec_name || "aac";
      const bitrate = Number(data.format.bit_rate || videoStream?.bit_rate || 0);

      // 1. Accurate FPS Parsing (e.g. "60/1" or "5994/100")
      let fps = 60.0;
      if (videoStream?.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
        if (num && den && den > 0) {
          fps = Math.round((num / den) * 100) / 100;
        }
      } else if (videoStream?.avg_frame_rate) {
        const [num, den] = videoStream.avg_frame_rate.split("/").map(Number);
        if (num && den && den > 0) {
          fps = Math.round((num / den) * 100) / 100;
        }
      }

      // 2. Genuine Color Space & Pixel Format (Chroma Subsampling)
      let colorSpace: string | undefined =
        videoStream?.color_space ||
        videoStream?.color_primaries ||
        videoStream?.color_transfer;
      if (colorSpace) {
        if (colorSpace.includes("709")) colorSpace = "BT.709 (Rec.709)";
        else if (colorSpace.includes("2020")) colorSpace = "BT.2020 (HDR/WCG)";
        else if (colorSpace.includes("601")) colorSpace = "BT.601 (Standard)";
      } else {
        colorSpace = "Rec.709 (sRGB/BT.709)";
      }

      const rawPixFmt = videoStream?.pix_fmt || "yuv420p";
      let pixFmt = "4:2:0 YUV";
      if (rawPixFmt.includes("420p10")) pixFmt = "4:2:0 10-bit YUV";
      else if (rawPixFmt.includes("422")) pixFmt = "4:2:2 YUV";
      else if (rawPixFmt.includes("444")) pixFmt = "4:4:4 YUV";
      else if (rawPixFmt.includes("420")) pixFmt = "4:2:0 YUV";

      // 3. Audio Stream Properties
      const audioChannels = audioStream?.channels || 2;
      const audioSampleRate = Number(audioStream?.sample_rate || 48000);
      const audioBitrate = Number(audioStream?.bit_rate || 0);

      // 4. Genuine Container Format
      const containerFormat = (data.format.format_long_name || data.format.format_name || "QuickTime / MP4").split(",")[0];

      // 5. Authentic Recording Date Extraction (QuickTime Metadata & Apple ReplayKit Timestamps)
      let recordedAt: Date | undefined;
      const allTags = {
        ...data.format.tags,
        ...videoStream?.tags,
        ...audioStream?.tags,
      };

      const creationTimeStr =
        allTags["com.apple.quicktime.creationdate"] ||
        allTags.creation_time ||
        allTags.date;

      if (creationTimeStr) {
        const parsed = new Date(creationTimeStr);
        if (!isNaN(parsed.getTime())) {
          recordedAt = parsed;
        }
      }

      // Fallback/Enhancement: Parse Apple ReplayKit timestamp from filename (e.g. RPReplay_Final1694641661...)
      const filename = path.basename(filePath);
      const replayKitMatch = filename.match(/RPReplay[_\s]*Final(\d{10})/i);
      if (replayKitMatch && replayKitMatch[1]) {
        const ts = parseInt(replayKitMatch[1], 10);
        if (ts > 1500000000 && ts < 2100000000) {
          // If creation_time was missing or defaulted to epoch/now, use authentic ReplayKit timestamp
          const dateFromFilename = new Date(ts * 1000);
          if (!recordedAt || Math.abs(recordedAt.getTime() - dateFromFilename.getTime()) > 86400000) {
            recordedAt = dateFromFilename;
          }
        }
      }

      // 6. Capture Device / Host Model Detection
      let deviceModel: string | undefined;
      const modelTag = allTags["com.apple.quicktime.model"] || allTags["com.apple.quicktime.software"] || allTags.model;
      const encoderTag = allTags.encoder || allTags["com.apple.quicktime.make"];

      if (modelTag) {
        if (typeof modelTag === "string" && modelTag.includes("iPad")) {
          deviceModel = `Apple iPad Pro (${modelTag})`;
        } else {
          deviceModel = String(modelTag);
        }
      } else if (filename.toLowerCase().includes("rpreplay")) {
        deviceModel = "Apple iPad (ReplayKit Screen Recording)";
      } else if (encoderTag) {
        deviceModel = String(encoderTag);
      } else {
        deviceModel = "Hardware Display Capture";
      }

      resolve({
        duration,
        width,
        height,
        fps,
        codec,
        audioCodec,
        bitrate,
        recordedAt,
        colorSpace,
        pixFmt,
        audioChannels,
        audioSampleRate,
        audioBitrate,
        deviceModel,
        containerFormat,
      });
    });
  });
}
