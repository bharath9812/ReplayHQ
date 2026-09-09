"use client";

import React, { useState, useRef } from "react";

export interface ClipData {
  id: string;
  title: string;
  description?: string | null;
  originalFilename: string;
  fileSize: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audioCodec?: string | null;
  bitrate?: number | null;
  colorSpace?: string | null;
  pixFmt?: string | null;
  audioChannels?: number | null;
  audioSampleRate?: number | null;
  deviceModel?: string | null;
  status: string;
  folder?: string | null;
  gameId?: string | null;
  isFavorite: boolean;
  isTrash: boolean;
  sha256?: string;
  storageOriginal?: string | null;
  storageThumbnail?: string | null;
  storageStoryboard?: string | null;
  storageStoryboardVtt?: string | null;
  game?: {
    id: string;
    name: string;
    slug: string;
    accentColor: string;
  } | null;
  tags?: Array<{ tag: { id: string; name: string; color: string } }>;
  highlights?: Array<{ id: string; title: string }>;
  recordedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface ClipCardProps {
  clip: ClipData;
  isSelected: boolean;
  isSelectMode?: boolean;
  onSelect: (clip: ClipData) => void;
  onOpenPlayer: (clip: ClipData) => void;
  onToggleFavorite: (id: string, current: boolean) => void;
  onToggleTrash: (id: string, current: boolean) => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatResolution(width: number, height: number): string {
  if (width >= 3840 || height >= 2160) return "4K UHD";
  if (width >= 2560 || height >= 1440) return "1440p";
  if (width >= 1920 || height >= 1080) return "1080p";
  return `${width}x${height}`;
}

function formatBitrate(fileSizeBytesStr: string, durationSec: number): string {
  const bytes = Number(fileSizeBytesStr) || 0;
  if (durationSec <= 0 || bytes <= 0) return "64 Mbps";
  const bits = bytes * 8;
  const mbps = (bits / durationSec) / (1024 * 1024);
  return `${mbps.toFixed(0)} Mbps`;
}

function formatFileSize(fileSizeBytesStr: string): string {
  const bytes = Number(fileSizeBytesStr) || 0;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb < 1) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${gb.toFixed(2)} GB`;
}

export function ClipCard({
  clip,
  isSelected,
  isSelectMode,
  onSelect,
  onOpenPlayer,
  onToggleFavorite,
  onToggleTrash,
}: ClipCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [thumbKey, setThumbKey] = useState<number>(() =>
    clip.updatedAt ? new Date(clip.updatedAt).getTime() : Date.now()
  );
  const [isRegeneratingThumb, setIsRegeneratingThumb] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const resText = formatResolution(clip.width, clip.height);
  const durationText = formatDuration(clip.duration);
  const sizeText = formatFileSize(clip.fileSize);
  const bitrateText = formatBitrate(clip.fileSize, clip.duration);

  const isGenerating = clip.status === "processing";

  return (
    <div
      onClick={() => onSelect(clip)}
      onDoubleClick={() => onOpenPlayer(clip)}
      onMouseEnter={() => {
        setIsHovered(true);
        if (videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setMenuOpen(false);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
      }}
      className={`group flex flex-col bg-surface-container-lowest rounded-xl overflow-hidden shadow-xl transition-all duration-150 cursor-pointer border relative select-none ${
        isSelected
          ? "ring-1 ring-primary/90 border-primary/80 bg-surface-container-low/40"
          : "border-outline-variant/30 hover:border-outline-variant/70 hover:bg-surface-container-low/30"
      }`}
    >
      {/* 16:9 Thumbnail Container */}
      <div className="relative aspect-[16/9] w-full bg-surface-container-lowest overflow-hidden">
        {/* Poster Image */}
        <img
          src={`/api/clips/${clip.id}/thumbnail?v=${thumbKey}`}
          alt={clip.title}
          className={`w-full h-full object-cover transition-transform duration-300 ${
            isHovered ? "scale-[1.02]" : "scale-100"
          }`}
          loading="lazy"
          onError={(e) => {
            // fallback if thumbnail generation pending
            (e.target as HTMLImageElement).src =
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23121316'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2387929a' font-family='sans-serif' font-size='16'%3EGame Footage%3C/text%3E%3C/svg%3E";
          }}
        />

        {/* Dynamic Video Hover Preview */}
        {isHovered && !isGenerating && (
          <video
            ref={videoRef}
            src={`/api/clips/${clip.id}/stream`}
            muted
            playsInline
            loop
            preload="none"
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
        )}

        {/* Top Left Status & Codec Badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
          {isGenerating ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-md font-label-code-sm text-label-code-sm text-tertiary border border-outline-variant/30">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
              <span>Processing...</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-lowest/85 backdrop-blur-md font-label-code-sm text-label-code-sm text-secondary border border-outline-variant/30">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              <span>Verified</span>
            </span>
          )}

          <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest/80 backdrop-blur-md font-label-code-sm text-label-code-sm text-outline border border-outline-variant/30 uppercase">
            {clip.codec || "HEVC"}
          </span>
        </div>

        {/* Top Right Checkbox / Star Indicator */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
          {/* Direct 1-Click Star Toggle Button */}
          {(clip.isFavorite || (isHovered && !isSelectMode)) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(clip.id, clip.isFavorite);
              }}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-md border ${
                clip.isFavorite
                  ? "text-amber-400 bg-black/60 border-amber-400/40 hover:bg-black/80 hover:scale-110 shadow-md"
                  : "text-zinc-300 hover:text-amber-300 bg-black/50 border-white/20 hover:bg-black/70 hover:scale-110 shadow-md"
              }`}
              title={clip.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            >
              <span className={`material-symbols-outlined text-[16px] ${clip.isFavorite ? "fill-current" : ""}`}>
                star
              </span>
            </button>
          )}

          {(isSelectMode || isSelected) && (
            <div
              className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                isSelected
                  ? "bg-primary text-on-primary font-bold"
                  : "bg-surface-container-lowest/80 border border-outline-variant text-transparent"
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">check</span>
            </div>
          )}

          {/* Direct Play Overlay Button on Hover */}
          {isHovered && !isSelectMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenPlayer(clip);
              }}
              className="w-7 h-7 rounded-full bg-surface-container/90 backdrop-blur-md flex items-center justify-center text-primary hover:scale-110 transition-transform shadow-lg border border-outline-variant/40"
              title="Open Cinema Player"
            >
              <span className="material-symbols-outlined text-[18px] ml-0.5">play_arrow</span>
            </button>
          )}
        </div>

        {/* Bottom Timecode & Technical Chips */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 z-10 pointer-events-none">
          <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-sm font-label-code-sm text-label-code-sm text-on-surface border border-outline-variant/30">
            {resText} · {Math.round(clip.fps || 60)} FPS
          </span>
          <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-sm font-label-code-sm text-label-code-sm text-primary font-medium border border-outline-variant/30">
            {durationText}
          </span>
        </div>

        {/* Watched Progress Line Indicator */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-container-highest z-10">
          <div
            className={`h-full ${
              isGenerating ? "bg-tertiary animate-pulse" : "bg-secondary"
            }`}
            style={{ width: isGenerating ? "82%" : "100%" }}
          ></div>
        </div>
      </div>

      {/* Card Content Body */}
      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-low/70 border-t border-outline-variant/20">
        <div className="flex items-start justify-between gap-space-sm">
          <div className="flex flex-col min-w-0">
            <span className="font-body-md text-body-md text-on-surface font-medium truncate">
              {clip.title}
            </span>
            <span className="font-label-code-sm text-label-code-sm text-outline truncate">
              {clip.game?.name || "Uncategorized"} · {sizeText} · {bitrateText}
            </span>
          </div>

          {/* Context Options Menu Button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="text-outline hover:text-on-surface p-0.5 rounded transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">more_vert</span>
            </button>

            {menuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-6 w-44 rounded-lg bg-surface-container-high border border-outline-variant/60 shadow-2xl p-1 z-30 flex flex-col gap-0.5 text-xs font-body-sm"
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenPlayer(clip);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-container text-on-surface transition-colors cursor-pointer text-left"
                >
                  <span className="material-symbols-outlined text-[16px] text-primary">
                    play_circle
                  </span>
                  Play &amp; Trim
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleFavorite(clip.id, clip.isFavorite);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-container text-on-surface transition-colors cursor-pointer text-left"
                >
                  <span className="material-symbols-outlined text-[16px] text-amber-400">
                    {clip.isFavorite ? "star_outline" : "star"}
                  </span>
                  {clip.isFavorite ? "Unfavorite" : "Favorite"}
                </button>
                <a
                  href={`/api/clips/${clip.id}/stream?download=true`}
                  download={clip.originalFilename}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-container text-on-surface transition-colors cursor-pointer text-left"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Download Original
                </a>
                <button
                  disabled={isRegeneratingThumb}
                  onClick={async () => {
                    setMenuOpen(false);
                    setIsRegeneratingThumb(true);
                    try {
                      await fetch(`/api/clips/${clip.id}/thumbnail?force=true`);
                      setThumbKey(Date.now());
                    } catch (err) {
                      console.error("Failed to regenerate poster:", err);
                    } finally {
                      setIsRegeneratingThumb(false);
                    }
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-container text-on-surface transition-colors cursor-pointer text-left disabled:opacity-50"
                  title="Force re-extract Ultra HD poster frame from master video"
                >
                  <span className={`material-symbols-outlined text-[16px] text-primary ${isRegeneratingThumb ? "animate-spin" : ""}`}>
                    {isRegeneratingThumb ? "progress_activity" : "high_quality"}
                  </span>
                  {isRegeneratingThumb ? "Generating HD Poster..." : "Regenerate HD Poster"}
                </button>
                <div className="h-px bg-outline-variant/40 my-0.5"></div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleTrash(clip.id, clip.isTrash);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-error-container/40 text-error transition-colors cursor-pointer text-left"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {clip.isTrash ? "restore" : "delete"}
                  </span>
                  {clip.isTrash ? "Restore from Trash" : "Move to Trash"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tag Chips */}
        <div className="flex items-center gap-1.5 pt-1 overflow-x-hidden">
          {clip.tags && clip.tags.length > 0 ? (
            clip.tags.slice(0, 3).map((item, idx) => (
              <span
                key={idx}
                className="font-label-code-sm text-label-code-sm px-1.5 py-0.5 rounded bg-surface-container text-outline border border-outline-variant/20 truncate"
              >
                #{item.tag.name}
              </span>
            ))
          ) : (
            <>
              <span className="font-label-code-sm text-label-code-sm px-1.5 py-0.5 rounded bg-surface-container text-outline border border-outline-variant/20">
                #Footage
              </span>
              <span className="font-label-code-sm text-label-code-sm px-1.5 py-0.5 rounded bg-surface-container text-outline border border-outline-variant/20">
                #{clip.game?.slug || "raw"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
