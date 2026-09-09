import path from "path";
import { STORAGE_ROOT, STORAGE_DIRS, ensureStorageDirectories } from "./config";

ensureStorageDirectories();

export function getOriginalPath(gameFolder: string, clipId: string, ext: string): string {
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  const dir = path.join(STORAGE_DIRS.ORIGINALS, gameFolder || "uncategorized");
  return path.join(dir, `${clipId}${safeExt}`);
}

export function getThumbnailPath(clipId: string): string {
  return path.join(STORAGE_DIRS.THUMBNAILS, `${clipId}.webp`);
}

export function getStoryboardImagePath(clipId: string): string {
  return path.join(STORAGE_DIRS.STORYBOARDS, `${clipId}_sprite.webp`);
}

export function getStoryboardVttPath(clipId: string): string {
  return path.join(STORAGE_DIRS.STORYBOARDS, `${clipId}.vtt`);
}

export function getPreviewVideoPath(clipId: string): string {
  return path.join(STORAGE_DIRS.PREVIEWS, `${clipId}_1080p.mp4`);
}

export function getHighlightPath(highlightId: string): string {
  return path.join(STORAGE_DIRS.CLIPS, `${highlightId}.mp4`);
}

export function getTempUploadPath(uploadId: string): string {
  return path.join(STORAGE_DIRS.TEMP, `${uploadId}.part`);
}

/**
 * Ensures a target path is contained within the root storage directory
 */
export function isSafeStoragePath(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(STORAGE_ROOT);
}
