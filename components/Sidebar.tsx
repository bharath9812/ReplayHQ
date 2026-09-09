"use client";

import React from "react";

export interface GameInfo {
  id: string;
  name: string;
  slug: string;
  folderName?: string | null;
  matchRules?: string[];
  accentColor?: string;
  icon?: string | null;
  clipCount?: number;
  totalBytes?: number;
  folders?: Array<{ name: string; clipCount: number; totalBytes: number }>;
}

export interface CollectionInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  isSmart?: boolean;
  smartType?: "boss" | "highlights" | "long_sessions";
  clipCount?: number;
  totalBytes?: number;
  clipIds?: string[];
}

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  games: GameInfo[];
  selectedGame: string | null;
  onSelectGame: (slug: string | null) => void;
  selectedFolder?: string | null;
  onSelectFolder?: (folder: string | null) => void;
  onOpenOrganizeFolder?: (gameSlug?: string) => void;
  collections?: CollectionInfo[];
  onOpenNewCollection?: () => void;
  onOpenCollectionManager?: () => void;
  onDeleteCollection?: (id: string) => void;
  activeProcessingCount?: number;
  totalClipsCount: number;
  totalBytesStr?: string;
  appStorageBytesStr?: string;
  serverAvailableBytesStr?: string;
  serverTotalBytesStr?: string;
  appStorageUsedPercent?: number;
  hostName?: string;
  storagePoolTotalStr?: string;
  storagePoolUsedPercent?: number;
  collectionsCounts?: {
    bosses: number;
    highlights: number;
    longSessions: number;
  };
  favoriteCount?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenUpload: () => void;
  onOpenSettings: () => void;
  onOpenAddGame?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function Sidebar({
  currentView,
  onSelectView,
  games,
  selectedGame,
  onSelectGame,
  selectedFolder,
  onSelectFolder,
  onOpenOrganizeFolder,
  collections = [],
  onOpenNewCollection,
  onOpenCollectionManager,
  onDeleteCollection,
  activeProcessingCount = 0,
  totalClipsCount,
  totalBytesStr = "0 B",
  appStorageBytesStr,
  serverAvailableBytesStr,
  serverTotalBytesStr,
  appStorageUsedPercent,
  hostName,
  storagePoolTotalStr = "4.0 TB",
  storagePoolUsedPercent = 5,
  collectionsCounts = { bosses: 0, highlights: 0, longSessions: 0 },
  favoriteCount = 0,
  isCollapsed = false,
  onToggleCollapse,
  isOpenMobile,
  onCloseMobile,
  onOpenUpload,
  onOpenSettings,
  onOpenAddGame,
}: SidebarProps) {
  const displayAppStorage = appStorageBytesStr || totalBytesStr;
  const displayServerAvailable = serverAvailableBytesStr || "3.2 TB";
  const displayServerTotal = serverTotalBytesStr || storagePoolTotalStr;
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 md:hidden animate-fade-in"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static top-0 left-0 h-[100dvh] w-64 bg-surface-container-lowest flex flex-col z-50 transition-all duration-300 ease-in-out shrink-0 select-none overflow-hidden ${
          isOpenMobile
            ? "translate-x-0 shadow-2xl md:shadow-none border-r border-outline-variant/40 pointer-events-auto"
            : "-translate-x-full md:translate-x-0 pointer-events-none md:pointer-events-auto"
        } ${
          isCollapsed
            ? "md:w-0 md:border-r-0 md:opacity-0 md:pointer-events-none"
            : "md:w-64 md:border-r md:border-outline-variant/40 md:opacity-100"
        }`}
      >
        <div className="w-64 h-full flex flex-col min-h-0">
          {/* Brand & Import */}
          <div className="p-space-md pb-space-sm flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center border border-outline-variant/30 shadow-xs">
                  <span className="material-symbols-outlined text-primary text-[18px]">lock</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-headline-md text-body-md text-on-surface font-semibold tracking-tight">
                    GameVault
                  </span>
                  <span className="font-label-code-sm text-label-code-sm text-outline flex items-center gap-space-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block animate-pulse"></span>
                    LAN 1 Gbps • i5 Host
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Desktop / iPad collapse button */}
                {onToggleCollapse && (
                  <button
                    onClick={onToggleCollapse}
                    className="hidden md:flex p-1.5 rounded-lg hover:bg-surface-container text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="Collapse Sidebar (⌘\)"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                  </button>
                )}

                {/* Mobile close button */}
                <button
                  onClick={onCloseMobile}
                  className="md:hidden p-1 text-outline hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

          <button
            onClick={() => {
              onOpenUpload();
              if (isOpenMobile) onCloseMobile();
            }}
            className="w-full flex items-center justify-between px-space-md py-space-xs rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface transition-all cursor-pointer group shadow-xs active:scale-[0.99]"
          >
            <span className="flex items-center gap-space-xs font-body-sm text-body-sm text-on-surface">
              <span className="material-symbols-outlined text-[16px] text-primary group-hover:scale-110 transition-transform">
                add_to_photos
              </span>
              Import Footage
            </span>
            <kbd className="font-label-code-sm text-label-code-sm text-outline bg-surface-container-low px-1.5 py-0.5 rounded border border-outline-variant/40">
              ⌘I
            </kbd>
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-space-sm space-y-space-md no-scrollbar">
          {/* Library Section */}
          <section>
            <div className="px-space-sm py-space-2xs font-badge-caps text-badge-caps text-outline uppercase tracking-wider">
              Library
            </div>
            <nav className="space-y-0.5">
              <button
                onClick={() => {
                  onSelectView("all-footage");
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-space-sm py-space-xs transition-colors rounded-lg cursor-pointer text-left ${
                  currentView === "all-footage" && selectedGame === null
                    ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                }`}
              >
                <span className="flex items-center gap-space-sm font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-[16px]">video_library</span>
                  All Footage
                </span>
                <span className="font-label-code-sm text-label-code-sm text-outline">
                  {totalClipsCount}
                </span>
              </button>

              <button
                onClick={() => {
                  onSelectView("recently-added");
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-space-sm py-space-xs transition-colors rounded-lg cursor-pointer text-left ${
                  currentView === "recently-added"
                    ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                }`}
              >
                <span className="flex items-center gap-space-sm font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  Recently Added
                </span>
              </button>

              <button
                onClick={() => {
                  onSelectView("continue-watching");
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-space-sm py-space-xs transition-colors rounded-lg cursor-pointer text-left ${
                  currentView === "continue-watching"
                    ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                }`}
              >
                <span className="flex items-center gap-space-sm font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-[16px]">play_circle</span>
                  Continue Watching
                </span>
              </button>

              <button
                onClick={() => {
                  onSelectView("favorites");
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-space-sm py-space-xs transition-colors rounded-lg cursor-pointer text-left ${
                  currentView === "favorites"
                    ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                }`}
              >
                <span className="flex items-center gap-space-sm font-body-sm text-body-sm">
                  <span className={`material-symbols-outlined text-[16px] text-amber-400 ${currentView === "favorites" ? "fill-current" : ""}`}>star</span>
                  Favorites
                </span>
                {favoriteCount > 0 && (
                  <span className="font-label-code-sm text-label-code-sm text-outline">
                    {favoriteCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  onSelectView("watched-status");
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-space-sm py-space-xs transition-colors rounded-lg cursor-pointer text-left ${
                  currentView === "watched-status"
                    ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                }`}
              >
                <span className="flex items-center gap-space-sm font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  Watched &amp; Unwatched
                </span>
              </button>
            </nav>
          </section>

          {/* Games Section */}
          <section>
            <div className="flex items-center justify-between px-space-sm py-space-2xs">
              <span className="font-badge-caps text-badge-caps text-outline uppercase tracking-wider">
                Games
              </span>
              <button
                onClick={onOpenAddGame || onOpenSettings}
                className="hover:text-on-surface text-outline hover:bg-surface-container p-0.5 rounded transition-colors cursor-pointer"
                title="Add New Game Profile"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
              </button>
            </div>
            <nav className="space-y-1">
              {games.map((game) => {
                const isSelected = selectedGame === game.slug;
                const hasFolders = Boolean(game.folders && game.folders.length > 0);
                return (
                  <div key={game.id} className="space-y-0.5">
                    <div className="flex items-center group relative">
                      <button
                        onClick={() => {
                          onSelectView("all-footage");
                          onSelectGame(isSelected ? null : game.slug);
                          if (onSelectFolder) onSelectFolder(null);
                          if (isOpenMobile) onCloseMobile();
                        }}
                        className={`flex-1 flex items-center justify-between px-space-sm py-space-xs rounded-lg transition-colors cursor-pointer text-left ${
                          isSelected
                            ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                            : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                        }`}
                      >
                        <div className="flex flex-col truncate pr-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-body-sm text-body-sm truncate">{game.name}</span>
                            {hasFolders && (
                              <span className="text-[10px] text-amber-400/70 font-mono bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20">
                                {game.folders?.length} folders
                              </span>
                            )}
                          </div>
                          <span className="font-label-code-sm text-label-code-sm text-outline truncate">
                            {game.clipCount !== undefined ? game.clipCount : (game as any)._count?.clips || 0} clips • {formatBytes(game.totalBytes)}
                          </span>
                        </div>
                      </button>

                      {onOpenOrganizeFolder && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenOrganizeFolder(game.slug);
                          }}
                          title={`Smart Folder Organizer for ${game.name}`}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-surface-container-high text-zinc-400 hover:text-amber-400 transition-all ml-1 cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined text-[15px]">drive_file_move</span>
                        </button>
                      )}
                    </div>

                    {/* Subfolders when game is selected or expanded */}
                    {hasFolders && isSelected && (
                      <div className="ml-3 pl-2.5 border-l border-white/10 space-y-0.5 pt-0.5 pb-1">
                        <button
                          onClick={() => {
                            if (onSelectFolder) onSelectFolder(null);
                            if (isOpenMobile) onCloseMobile();
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors cursor-pointer text-left ${
                            !selectedFolder
                              ? "text-primary font-medium bg-primary/10"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="material-symbols-outlined text-[13px]">folder_open</span>
                            All Clips
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {game.clipCount || 0}
                          </span>
                        </button>

                        {game.folders?.map((f) => {
                          const isFolderActive = selectedFolder === f.name;
                          return (
                            <button
                              key={f.name}
                              onClick={() => {
                                if (onSelectFolder) onSelectFolder(f.name);
                                if (isOpenMobile) onCloseMobile();
                              }}
                              className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors cursor-pointer text-left ${
                                isFolderActive
                                  ? "text-amber-300 font-medium bg-amber-500/10 border border-amber-500/20"
                                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                              }`}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <span className="material-symbols-outlined text-[13px] text-amber-400/80">folder</span>
                                <span className="truncate">{f.name}</span>
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">
                                {f.clipCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </section>

          {/* Collections Section */}
          <section>
            <div className="flex items-center justify-between px-space-sm py-space-2xs">
              <span className="font-badge-caps text-badge-caps text-outline uppercase tracking-wider">
                Collections
              </span>
              <div className="flex items-center gap-1">
                {onOpenCollectionManager && (
                  <button
                    onClick={onOpenCollectionManager}
                    className="hover:text-on-surface text-outline hover:bg-surface-container p-0.5 rounded transition-colors cursor-pointer"
                    title="Manage Collections & Videos"
                  >
                    <span className="material-symbols-outlined text-[15px]">tune</span>
                  </button>
                )}
                {onOpenNewCollection && (
                  <button
                    onClick={onOpenNewCollection}
                    className="hover:text-on-surface text-outline hover:bg-surface-container p-0.5 rounded transition-colors cursor-pointer"
                    title="Create New Multi-Game Collection"
                  >
                    <span className="material-symbols-outlined text-[15px]">add</span>
                  </button>
                )}
              </div>
            </div>
            <nav className="space-y-0.5">
              {(collections && collections.length > 0
                ? collections
                : [
                    {
                      id: "smart-bosses",
                      name: "Boss Battles & Clutch Wins",
                      slug: "collection-bosses",
                      icon: "folder",
                      color: "#FF9F0A",
                      clipCount: collectionsCounts.bosses,
                      isSmart: true,
                    },
                    {
                      id: "smart-highlights",
                      name: "2026 Highlight Reels",
                      slug: "collection-2026-highlights",
                      icon: "folder",
                      color: "#BF5AF2",
                      clipCount: collectionsCounts.highlights,
                      isSmart: true,
                    },
                    {
                      id: "smart-long-sessions",
                      name: "Long Exploration Sessions",
                      slug: "collection-long-sessions",
                      icon: "folder",
                      color: "#30D158",
                      clipCount: collectionsCounts.longSessions,
                      isSmart: true,
                    },
                  ]
              ).map((col) => {
                const isActive = currentView === col.slug || currentView === col.id;
                return (
                  <div key={col.id} className="group/col flex items-center">
                    <button
                      onClick={() => {
                        onSelectView(col.slug);
                        if (onSelectFolder) onSelectFolder(null);
                        if (isOpenMobile) onCloseMobile();
                      }}
                      className={`flex-1 flex items-center justify-between px-space-sm py-space-xs rounded-lg transition-colors cursor-pointer text-left ${
                        isActive
                          ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                          : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                      }`}
                    >
                      <div className="flex items-center gap-space-sm min-w-0">
                        <span
                          className="material-symbols-outlined text-[16px]"
                          style={{ color: col.color || "#8ED5FF" }}
                        >
                          {col.icon || (col.isSmart ? "auto_awesome" : "collections_bookmark")}
                        </span>
                        <span className="font-body-sm text-body-sm truncate">{col.name}</span>
                      </div>
                      {col.clipCount !== undefined && col.clipCount > 0 && (
                        <span className="font-label-code-sm text-label-code-sm text-outline ml-1">
                          {col.clipCount}
                        </span>
                      )}
                    </button>

                    {/* Delete button for custom collections */}
                    {!col.isSmart && onDeleteCollection && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete collection "${col.name}"? (No videos will be deleted)`)) {
                            onDeleteCollection(col.id);
                          }
                        }}
                        className="opacity-0 group-hover/col:opacity-100 p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all ml-0.5 cursor-pointer"
                        title="Delete this collection"
                      >
                        <span className="material-symbols-outlined text-[13px]">delete</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </nav>
          </section>

          {/* System & Safety Section */}
          <section>
            <div className="px-space-sm py-space-2xs font-badge-caps text-badge-caps text-outline uppercase tracking-wider">
              System &amp; Safety
            </div>
            <nav className="space-y-0.5">
              <button
                onClick={() => {
                  onSelectView("processing-center");
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-space-sm py-space-xs rounded-lg transition-colors cursor-pointer text-left ${
                  currentView === "processing-center"
                    ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                }`}
              >
                <span className="flex items-center gap-space-sm font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-[16px]">swap_calls</span>
                  Processing Center
                </span>
                {activeProcessingCount > 0 ? (
                  <span className="w-4 h-4 rounded-full bg-primary text-on-primary font-label-code-sm text-label-code-sm flex items-center justify-center font-bold text-[10px] animate-pulse">
                    {activeProcessingCount}
                  </span>
                ) : (
                  <span className="font-label-code-sm text-[10px] text-secondary flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> Idle
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  onSelectView("storage-integrity");
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-space-sm py-space-xs rounded-lg transition-colors cursor-pointer text-left ${
                  currentView === "storage-integrity"
                    ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                }`}
              >
                <span className="flex items-center gap-space-sm font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-[16px] text-secondary">
                    verified_user
                  </span>
                  Storage &amp; Integrity
                </span>
                <span className="material-symbols-outlined text-secondary text-[14px]">check</span>
              </button>

              <button
                onClick={() => {
                  onSelectView("activity-log");
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center gap-space-sm px-space-sm py-space-xs rounded-lg transition-colors cursor-pointer text-left ${
                  currentView === "activity-log"
                    ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
                <span className="font-body-sm text-body-sm">Activity Log</span>
              </button>
            </nav>
          </section>
        </div>

        {/* Bottom Storage & Server Telemetry */}
        <div className="p-3 bg-surface-container-low border-t border-outline-variant/40 flex flex-col gap-2.5 shrink-0">
          {/* Storage Telemetry Card */}
          <div className="p-2.5 rounded-xl bg-surface-container/60 border border-outline-variant/25 flex flex-col gap-1.5 shadow-xs">
            {/* Storage Used by this App */}
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                App Storage
              </span>
              <span className="text-white font-semibold">{displayAppStorage}</span>
            </div>

            {/* Storage Available to Use on Server */}
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Server Available
              </span>
              <span className="text-emerald-400 font-semibold">{displayServerAvailable}</span>
            </div>

            {/* Visual Storage Bar */}
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mt-0.5 relative">
              <div
                style={{ width: `${Math.max(2, Math.min(100, appStorageUsedPercent ?? 3))}%` }}
                className="h-full bg-primary rounded-full transition-all duration-500"
                title={`GameVault uses ${displayAppStorage} of server capacity`}
              ></div>
            </div>

            {/* Capacity breakdown footer */}
            {displayServerTotal && (
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-0.5">
                <span>Total Server: {displayServerTotal}</span>
                <span className="text-emerald-400/80">{displayServerAvailable} free</span>
              </div>
            )}
          </div>

          {/* Server Host & Settings Row */}
          <div className="flex items-center justify-between px-0.5 pt-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[16px]">dns</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-body-sm text-xs text-on-surface truncate font-medium">
                  {hostName || "Debian Host"}
                </span>
                <span className="font-label-code-sm text-[10px] text-emerald-400 leading-tight flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online • 192.168.1.9
                </span>
              </div>
            </div>

            <button
              onClick={onOpenSettings}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer border border-transparent hover:border-outline-variant/30 shrink-0"
              title="Settings & System Directives"
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
            </button>
          </div>
        </div>
        </div>
      </aside>
    </>
  );
}
