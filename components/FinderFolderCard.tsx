"use client";

import React from "react";

interface FinderFolderCardProps {
  name: string;
  clipCount: number;
  totalBytes?: number;
  color?: string;
  onClick: () => void;
  onOrganize?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function FinderFolderCard({
  name,
  clipCount,
  totalBytes,
  color = "#FF9F0A",
  onClick,
  onOrganize,
}: FinderFolderCardProps) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative flex flex-col items-center justify-center p-4 rounded-2xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 hover:border-amber-500/50 transition-all cursor-pointer select-none shadow-sm hover:shadow-lg hover:-translate-y-0.5"
    >
      {/* Action Button: Quick Organize inside this folder */}
      {onOrganize && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOrganize();
          }}
          title={`Smart organize clips into ${name}`}
          className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-black/50 hover:bg-black/80 text-zinc-300 hover:text-amber-300 transition-all z-10"
        >
          <span className="material-symbols-outlined text-[14px]">drive_file_move</span>
        </button>
      )}

      {/* Realistic macOS Finder Folder Graphic */}
      <div className="relative w-20 h-16 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform duration-200">
        <svg
          viewBox="0 0 80 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-md"
        >
          {/* Back Tab */}
          <path
            d="M4 14C4 9.58172 7.58172 6 12 6H28.8284C30.9502 6 32.9853 6.84285 34.4853 8.34285L38.1421 12C39.6421 13.5 41.6772 14.3429 43.799 14.3429H68C72.4183 14.3429 76 17.9246 76 22.3429V48C76 52.4183 72.4183 56 68 56H12C7.58172 56 4 52.4183 4 48V14Z"
            fill={color}
            fillOpacity="0.8"
          />
          {/* Inner Folder Sheet */}
          <rect
            x="8"
            y="15"
            width="64"
            height="34"
            rx="4"
            fill="#FFFFFF"
            fillOpacity="0.85"
          />
          {/* Front Body with subtle gradient & shadow */}
          <path
            d="M4 22C4 17.5817 7.58172 14 12 14H68C72.4183 14 76 17.5817 76 22V50C76 54.4183 72.4183 58 68 58H12C7.58172 58 4 54.4183 4 50V22Z"
            fill={color}
          />
          {/* Subtle Gloss Line */}
          <path
            d="M5 22C5 18.134 8.13401 15 12 15H68C71.866 15 75 18.134 75 22V24H5V22Z"
            fill="#FFFFFF"
            fillOpacity="0.25"
          />
        </svg>

        {/* Center Folder Symbol */}
        <span className="material-symbols-outlined absolute text-[20px] text-white/90 drop-shadow-sm pointer-events-none mt-2">
          folder_open
        </span>
      </div>

      {/* Folder Name */}
      <h4 className="font-semibold text-xs sm:text-sm text-white text-center truncate max-w-full px-1 group-hover:text-amber-300 transition-colors">
        {name}
      </h4>

      {/* Metadata Subtitle */}
      <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 mt-1">
        <span>{clipCount} {clipCount === 1 ? "clip" : "clips"}</span>
        {totalBytes !== undefined && totalBytes > 0 && (
          <>
            <span>•</span>
            <span>{formatBytes(totalBytes)}</span>
          </>
        )}
      </div>
    </div>
  );
}
