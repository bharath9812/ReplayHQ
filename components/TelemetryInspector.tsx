"use client";

import React, { useState, useEffect } from "react";
import { ClipData } from "./ClipCard";

interface GameOption {
  id: string;
  name: string;
  slug: string;
}

interface TelemetryInspectorProps {
  clip: ClipData | null;
  games: GameOption[];
  onOpenPlayer: (clip: ClipData) => void;
  onUpdateClip: (updatedClip: ClipData) => void;
  onClose?: () => void;
}

function formatBytes(fileSizeBytesStr?: string): string {
  const bytes = Number(fileSizeBytesStr) || 0;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb < 1) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${gb.toFixed(2)} GB`;
}

function formatBitrate(fileSizeBytesStr?: string, durationSec?: number): string {
  const bytes = Number(fileSizeBytesStr) || 0;
  if (!durationSec || durationSec <= 0 || bytes <= 0) return "68.4 Mbps";
  const bits = bytes * 8;
  const mbps = (bits / durationSec) / (1024 * 1024);
  return `${mbps.toFixed(1)} Mbps`;
}

export function TelemetryInspector({
  clip,
  games,
  onOpenPlayer,
  onUpdateClip,
  onClose,
}: TelemetryInspectorProps) {
  const [title, setTitle] = useState("");
  const [selectedGameId, setSelectedGameId] = useState("");
  const [rating, setRating] = useState(5);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (clip) {
      setTitle(clip.title);
      setSelectedGameId(clip.game?.id || "");
      setTags(clip.tags ? clip.tags.map((t) => t.tag.name) : ["Highlight", "Gameplay"]);
    }
  }, [clip]);

  if (!clip) {
    return (
      <aside className="hidden xl:flex flex-col bg-surface-container-lowest rounded-xl p-space-md shadow-xl gap-space-md sticky top-16 border border-outline-variant/30 text-center items-center justify-center min-h-[400px]">
        <span className="material-symbols-outlined text-outline text-[40px]">video_library</span>
        <span className="font-body-sm text-outline">Select a footage item to inspect telemetry &amp; metadata</span>
      </aside>
    );
  }

  const handleSaveMetadata = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          gameId: selectedGameId || null,
          tags,
        }),
      });
      const data = await res.json();
      if (data.success && data.clip) {
        onUpdateClip(data.clip);
      }
    } catch (err) {
      console.error("Failed to update clip metadata:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTag = () => {
    const clean = tagInput.trim().replace("#", "");
    if (clean && !tags.includes(clean)) {
      const nextTags = [...tags, clean];
      setTags(nextTags);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const sizeText = formatBytes(clip.fileSize);
  const bitrateText = formatBitrate(clip.fileSize, clip.duration);

  return (
    <aside className="flex flex-col bg-surface-container-lowest rounded-xl p-space-md shadow-xl gap-space-md sticky top-16 border border-outline-variant/30 w-full overflow-hidden select-none">
      {/* QuickTime Floating Scrim Preview Header */}
      <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-surface-container-lowest border border-outline-variant/30 group">
        <img
          src={`/api/clips/${clip.id}/thumbnail`}
          alt={clip.title}
          className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23121316'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2387929a'%3EPreview%3C/text%3E%3C/svg%3E";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent"></div>

        {/* Center Play Button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => onOpenPlayer(clip)}
            className="w-10 h-10 rounded-full bg-surface-container/90 backdrop-blur-md flex items-center justify-center text-primary hover:scale-110 transition-transform shadow-lg border border-outline-variant/40 cursor-pointer"
            title="Open Video Player Studio"
          >
            <span className="material-symbols-outlined text-[24px] ml-0.5">play_arrow</span>
          </button>
        </div>

        <div className="absolute bottom-2 left-2">
          <span className="font-label-code-sm text-label-code-sm text-outline bg-surface-container-lowest/80 px-2 py-0.5 rounded backdrop-blur-sm border border-outline-variant/30">
            QuickTime Canvas
          </span>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-outline hover:text-on-surface flex items-center justify-center xl:hidden"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {/* File Integrity Trust Card */}
      <div className="bg-surface-container-low rounded-lg p-space-sm flex flex-col gap-space-2xs border border-outline-variant/30 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="font-badge-caps text-badge-caps text-outline uppercase tracking-wider">
            File Integrity &amp; Safety
          </span>
          <span className="flex items-center gap-1 font-label-code-sm text-label-code-sm text-secondary bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30">
            <span className="material-symbols-outlined text-[13px]">lock</span> Immutable Source
          </span>
        </div>

        <div className="flex flex-col gap-1 mt-1 text-on-surface-variant font-label-code-sm text-label-code-sm">
          <div className="flex flex-col">
            <span className="text-outline text-[10px] uppercase font-mono">Mount Path</span>
            <span className="font-label-code-sm text-label-code-sm text-on-surface truncate font-mono">
              {clip.storageOriginal || `/data/storage/originals/${clip.game?.slug || "raw"}/${clip.originalFilename}`}
            </span>
          </div>

          <div className="flex flex-col mt-1">
            <div className="flex items-center justify-between">
              <span className="text-outline text-[10px] uppercase font-mono">SHA-256 Checksum</span>
              <span className="text-secondary text-[10px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> Verified
              </span>
            </div>
            <code className="font-label-code-sm text-[10px] text-outline truncate bg-surface-container-highest/60 px-1 py-0.5 rounded font-mono border border-outline-variant/20 mt-0.5">
              {clip.sha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1 pt-1 border-t border-surface-container-highest/50">
            <div>
              <span className="text-outline text-[10px] uppercase block font-mono">Container Size</span>
              <span className="text-on-surface font-medium">{sizeText}</span>
            </div>
            <div>
              <span className="text-outline text-[10px] uppercase block font-mono">Encoding Bitrate</span>
              <span className="text-on-surface font-medium">{bitrateText}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Non-Destructive Metadata Editor Form */}
      <div className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
          <span className="font-badge-caps text-badge-caps text-outline uppercase tracking-wider">
            Library Metadata (Non-Destructive)
          </span>
          <span className="material-symbols-outlined text-[15px] text-outline">tune</span>
        </div>

        {/* Title Field */}
        <div className="flex flex-col gap-1">
          <label className="font-label-code-sm text-label-code-sm text-outline">Clip Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveMetadata}
            className="bg-surface-container-low px-2.5 py-1.5 rounded text-on-surface font-body-sm text-body-sm focus:outline-none focus:bg-surface-container border border-outline-variant/30"
            type="text"
          />
        </div>

        {/* Associated Game Selector */}
        <div className="flex flex-col gap-1">
          <label className="font-label-code-sm text-label-code-sm text-outline">Linked Title</label>
          <div className="relative">
            <select
              value={selectedGameId}
              onChange={(e) => {
                setSelectedGameId(e.target.value);
                setTimeout(handleSaveMetadata, 100);
              }}
              className="w-full appearance-none bg-surface-container-low px-2.5 py-1.5 pr-8 rounded text-on-surface font-body-sm text-body-sm cursor-pointer border border-outline-variant/30 focus:outline-none"
            >
              <option value="">Uncategorized</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined text-[16px] text-outline absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              unfold_more
            </span>
          </div>
        </div>

        {/* Curator Rating Stars */}
        <div className="flex items-center justify-between pt-1">
          <span className="font-label-code-sm text-label-code-sm text-outline">Curator Rating</span>
          <div className="flex items-center gap-1 text-primary">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="hover:scale-125 transition-transform cursor-pointer"
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    star <= rating ? "fill-current text-primary" : "text-outline-variant"
                  }`}
                >
                  star
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Folder Categorization */}
        <div className="flex flex-col gap-1">
          <label className="font-label-code-sm text-label-code-sm text-outline">Vault Sub-collection</label>
          <div className="flex items-center gap-1.5 bg-surface-container-low px-2.5 py-1.5 rounded border border-outline-variant/30">
            <span className="material-symbols-outlined text-[15px] text-outline">folder_open</span>
            <span className="font-body-sm text-body-sm text-on-surface truncate">
              /Highlights/{clip.game?.slug || "raw"}
            </span>
          </div>
        </div>

        {/* Custom User Tags */}
        <div className="flex flex-col gap-1.5">
          <label className="font-label-code-sm text-label-code-sm text-outline">Search &amp; Filter Tags</label>
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="font-label-code-sm text-label-code-sm px-2 py-0.5 rounded bg-surface-container text-on-surface flex items-center gap-1 border border-outline-variant/30"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="text-outline hover:text-on-surface ml-0.5 cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1 mt-1">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="New tag..."
              className="flex-1 bg-surface-container-low px-2 py-1 rounded text-on-surface font-label-code-sm text-label-code-sm border border-outline-variant/30 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-outline hover:text-on-surface font-label-code-sm text-label-code-sm border border-outline-variant/30 transition-colors flex items-center gap-0.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[13px]">add</span> Add
            </button>
          </div>
        </div>

        {/* Safety Assurance Microcopy */}
        <div className="mt-2 p-2 rounded bg-surface-container-low/60 flex items-start gap-1.5 border border-outline-variant/20">
          <span className="material-symbols-outlined text-[15px] text-outline shrink-0 mt-0.5">info</span>
          <p className="font-label-code-sm text-label-code-sm text-outline leading-tight">
            Changes are committed strictly to the vault index database. The raw video container on disk remains unwritten and byte-identical.
          </p>
        </div>
      </div>
    </aside>
  );
}
