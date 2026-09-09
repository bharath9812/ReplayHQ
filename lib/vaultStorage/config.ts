import path from "path";
import fs from "fs";

export const STORAGE_ROOT = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : path.resolve(process.cwd(), "storage");

export const STORAGE_DIRS = {
  ORIGINALS: path.join(STORAGE_ROOT, "originals"),
  DERIVED: path.join(STORAGE_ROOT, "derived"),
  THUMBNAILS: path.join(STORAGE_ROOT, "derived", "thumbnails"),
  STORYBOARDS: path.join(STORAGE_ROOT, "derived", "storyboards"),
  PREVIEWS: path.join(STORAGE_ROOT, "derived", "previews"),
  CLIPS: path.join(STORAGE_ROOT, "derived", "clips"),
  TEMP: path.join(STORAGE_ROOT, "temp"),
};

export function ensureStorageDirectories(): void {
  for (const dir of Object.values(STORAGE_DIRS)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
