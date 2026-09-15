"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

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
  isUncategorized?: boolean;
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

export function triggerVaultSync() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gamevault:sync"));
  }
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
  serverUsedBytesStr?: string;
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
  sidebarWidth?: number;
  onResizeSidebar?: (newWidth: number) => void;
  onResizeEnd?: (finalWidth: number) => void;
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
  serverUsedBytesStr,
  appStorageUsedPercent,
  hostName,
  storagePoolTotalStr = "225 GB",
  storagePoolUsedPercent = 86,
  collectionsCounts = { bosses: 0, highlights: 0, longSessions: 0 },
  favoriteCount = 0,
  isCollapsed = false,
  onToggleCollapse,
  isOpenMobile,
  onCloseMobile,
  onOpenUpload,
  onOpenSettings,
  onOpenAddGame,
  sidebarWidth = 260,
  onResizeSidebar,
  onResizeEnd,
}: SidebarProps) {
  const displayAppStorage = appStorageBytesStr || totalBytesStr;
  const displayServerAvailable = serverAvailableBytesStr || "32.4 GB";
  const displayServerTotal = serverTotalBytesStr || storagePoolTotalStr;

  // Resizing Drag State
  const [isDragging, setIsDragging] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const currentWidthRef = useRef(sidebarWidth);
  currentWidthRef.current = sidebarWidth;

  // Expanded folders per game
  const [expandedGames, setExpandedGames] = useState<Record<string, boolean>>({});



  // Track mobile screen state (viewport < 768px)
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleGameExpanded = (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGames((prev) => ({
      ...prev,
      [slug]: prev[slug] !== undefined ? !prev[slug] : selectedGame !== slug,
    }));
  };

  const isGameExpanded = (slug: string) => {
    if (expandedGames[slug] !== undefined) {
      return expandedGames[slug];
    }
    return selectedGame === slug;
  };

  // Mouse Drag Handler (with window capture for reliable drag across iframes/viewports)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const startX = e.clientX;
      const startW = asideRef.current ? asideRef.current.getBoundingClientRect().width : (currentWidthRef.current || 260);

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const targetWidth = Math.min(480, Math.max(180, Math.round(startW + delta)));
        document.documentElement.style.setProperty("--sidebar-width", `${targetWidth}px`);
        try {
          localStorage.setItem("gamevault_sidebar_width", String(targetWidth));
        } catch {}
        onResizeSidebar?.(targetWidth);
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", onMouseMove, { capture: true });
        window.removeEventListener("mouseup", onMouseUp, { capture: true });
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsDragging(false);

        const delta = upEvent.clientX - startX;
        const finalW = Math.min(480, Math.max(180, Math.round(startW + delta)));
        document.documentElement.style.setProperty("--sidebar-width", `${finalW}px`);
        try {
          localStorage.setItem("gamevault_sidebar_width", String(finalW));
          localStorage.setItem("gamevault_sidebar_width_ts", String(Date.now()));
        } catch {}
        onResizeEnd?.(finalW);
      };

      window.addEventListener("mousemove", onMouseMove, { capture: true, passive: true });
      window.addEventListener("mouseup", onMouseUp, { capture: true });
    },
    [onResizeSidebar, onResizeEnd]
  );

  // Touch Drag Handler (iPad / Touch devices)
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      setIsDragging(true);
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startW = asideRef.current ? asideRef.current.getBoundingClientRect().width : (currentWidthRef.current || 260);

      const onTouchMove = (moveEvent: TouchEvent) => {
        if (moveEvent.touches.length !== 1) return;
        const delta = moveEvent.touches[0].clientX - startX;
        const targetWidth = Math.min(480, Math.max(180, Math.round(startW + delta)));
        document.documentElement.style.setProperty("--sidebar-width", `${targetWidth}px`);
        try {
          localStorage.setItem("gamevault_sidebar_width", String(targetWidth));
        } catch {}
        onResizeSidebar?.(targetWidth);
      };

      const onTouchEnd = (endEvent: TouchEvent) => {
        window.removeEventListener("touchmove", onTouchMove, { capture: true });
        window.removeEventListener("touchend", onTouchEnd, { capture: true });
        setIsDragging(false);

        let finalDelta = 0;
        if (endEvent.changedTouches.length > 0) {
          finalDelta = endEvent.changedTouches[0].clientX - startX;
        }
        const finalW = Math.min(480, Math.max(180, Math.round(startW + finalDelta)));
        document.documentElement.style.setProperty("--sidebar-width", `${finalW}px`);
        try {
          localStorage.setItem("gamevault_sidebar_width", String(finalW));
          localStorage.setItem("gamevault_sidebar_width_ts", String(Date.now()));
        } catch {}
        onResizeEnd?.(finalW);
      };

      window.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
      window.addEventListener("touchend", onTouchEnd, { capture: true });
    },
    [onResizeSidebar, onResizeEnd]
  );

  const handleDoubleClickHandle = useCallback(() => {
    document.documentElement.style.setProperty("--sidebar-width", "260px");
    try {
      localStorage.setItem("gamevault_sidebar_width", "260");
      localStorage.setItem("gamevault_sidebar_width_ts", String(Date.now()));
    } catch {}
    onResizeSidebar?.(260);
    onResizeEnd?.(260);
  }, [onResizeSidebar, onResizeEnd]);

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
        ref={asideRef}
        style={{
          width: isMobileScreen ? undefined : (isCollapsed ? 0 : "var(--sidebar-width, 260px)"),
        }}
        className={`fixed md:relative top-0 left-0 h-[100dvh] bg-surface-container-lowest flex flex-col z-50 shrink-0 select-none overflow-hidden ${
          isDragging ? "transition-none select-none" : "transition-[width,transform,opacity] duration-300 ease-in-out"
        } ${
          isOpenMobile
            ? "translate-x-0 shadow-2xl md:shadow-none border-r border-outline-variant/40 pointer-events-auto"
            : "-translate-x-full md:translate-x-0 pointer-events-none md:pointer-events-auto"
        } ${
          isCollapsed
            ? "md:w-0 md:border-r-0 md:opacity-0 md:pointer-events-none"
            : "md:border-r md:border-outline-variant/40 md:opacity-100"
        } w-[280px] max-w-[85vw] md:max-w-none`}
      >
        {/* Draggable Border Handle for Width Resizing */}
        {!isCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onDoubleClick={handleDoubleClickHandle}
            className="hidden md:block absolute top-0 right-0 w-2.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary/70 z-30 transition-colors group"
            title="Drag to resize sidebar width • Double-click to reset (260px)"
          >
            <div
              className={`w-[1.5px] h-full mx-auto transition-colors ${
                isDragging ? "bg-primary" : "bg-transparent group-hover:bg-primary/70"
              }`}
            />
          </div>
        )}

        <div className="w-full h-full flex flex-col min-h-0">
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
                  <span className="font-label-code-sm text-label-code-sm text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                    Online
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
            </nav>
          </section>

          {/* Games & Categories Section */}
          <section>
            <div className="flex items-center justify-between px-space-sm py-space-2xs">
              <span className="font-badge-caps text-badge-caps text-outline uppercase tracking-wider">
                Games &amp; Categories
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
                const isExpanded = isGameExpanded(game.slug);
                const isUncat = game.slug === "uncategorized" || (game as any).isUncategorized;

                // Calculate unfiled clips count for games that have subfolders
                const folderTotalCount = game.folders?.reduce((acc, f) => acc + (f.clipCount || 0), 0) || 0;
                const unfiledCount = Math.max(0, (game.clipCount || 0) - folderTotalCount);

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
                            {isUncat ? (
                              <span className="material-symbols-outlined text-[15px] text-zinc-400 shrink-0">
                                help_outline
                              </span>
                            ) : (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: game.accentColor || "#007AFF" }}
                              />
                            )}
                            <span className="font-body-sm text-body-sm truncate">{game.name}</span>
                            {hasFolders && (
                              <span className="text-[10px] text-amber-400/80 font-mono bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20 shrink-0">
                                {game.folders?.length} {game.folders?.length === 1 ? "folder" : "folders"}
                              </span>
                            )}
                          </div>
                          <span className="font-label-code-sm text-label-code-sm text-outline truncate">
                            {game.clipCount !== undefined ? game.clipCount : (game as any)._count?.clips || 0} clips • {formatBytes(game.totalBytes)}
                          </span>
                        </div>
                      </button>

                      {/* Expand/Collapse Folders Toggle Button */}
                      {hasFolders && (
                        <button
                          onClick={(e) => toggleGameExpanded(game.slug, e)}
                          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-surface-container transition-colors cursor-pointer shrink-0 ml-0.5"
                          title={isExpanded ? "Collapse subfolders" : "Expand subfolders"}
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {isExpanded ? "expand_more" : "chevron_right"}
                          </span>
                        </button>
                      )}

                      {/* Smart Folder Organizer Action */}
                      {onOpenOrganizeFolder && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenOrganizeFolder(game.slug);
                          }}
                          title={`Smart Folder Organizer for ${game.name}`}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-surface-container-high text-zinc-400 hover:text-amber-400 transition-all ml-0.5 cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined text-[15px]">drive_file_move</span>
                        </button>
                      )}
                    </div>

                    {/* Subfolders when expanded */}
                    {hasFolders && isExpanded && (
                      <div className="ml-3 pl-2.5 border-l border-white/10 space-y-0.5 pt-0.5 pb-1 animate-fade-in">
                        {/* All Clips in this category */}
                        <button
                          onClick={() => {
                            onSelectView("all-footage");
                            onSelectGame(game.slug);
                            if (onSelectFolder) onSelectFolder(null);
                            if (isOpenMobile) onCloseMobile();
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors cursor-pointer text-left ${
                            isSelected && !selectedFolder
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

                        {/* Each Named Subfolder */}
                        {game.folders?.map((f) => {
                          const isFolderActive = isSelected && selectedFolder === f.name;
                          return (
                            <button
                              key={f.name}
                              onClick={() => {
                                onSelectView("all-footage");
                                onSelectGame(game.slug);
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

                        {/* Optional Unfiled Footage Filter if unfiled clips exist */}
                        {unfiledCount > 0 && (
                          <button
                            onClick={() => {
                              onSelectView("all-footage");
                              onSelectGame(game.slug);
                              if (onSelectFolder) onSelectFolder("unfiled");
                              if (isOpenMobile) onCloseMobile();
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors cursor-pointer text-left ${
                              isSelected && selectedFolder === "unfiled"
                                ? "text-amber-300 font-medium bg-amber-500/10 border border-amber-500/20"
                                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                            }`}
                            title="Clips not assigned to any specific subfolder"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="material-symbols-outlined text-[13px] text-zinc-500">folder_off</span>
                              <span className="truncate italic">Unfiled Clips</span>
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {unfiledCount}
                            </span>
                          </button>
                        )}
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
                  <span className="material-symbols-outlined text-[16px]">security</span>
                  Storage &amp; Integrity
                </span>
                <span className="font-label-code-sm text-[10px] text-secondary">
                  Immutable
                </span>
              </button>

              <button
                onClick={() => {
                  onSelectView("activity-log");
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-space-sm py-space-xs rounded-lg transition-colors cursor-pointer text-left ${
                  currentView === "activity-log"
                    ? "bg-surface-container text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface"
                }`}
              >
                <span className="flex items-center gap-space-sm font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-[16px]">terminal</span>
                  Activity Log
                </span>
              </button>
            </nav>
          </section>

        </div>

        {/* Bottom Storage & Server Status */}
        <div className="p-3 bg-surface-container-low border-t border-outline-variant/40 flex flex-col gap-2.5 shrink-0">
          {/* Storage Meter Card (Clicking opens Settings) */}
          <div
            onClick={onOpenSettings}
            className="p-2.5 rounded-xl bg-surface-container/60 hover:bg-surface-container border border-outline-variant/25 flex flex-col gap-1.5 shadow-xs cursor-pointer transition-colors"
            title="Open Settings & Storage Details"
          >
            {/* Library Storage */}
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Library Media
              </span>
              <span className="text-white font-semibold">{displayAppStorage}</span>
            </div>

            {/* Free Storage */}
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Free Space
              </span>
              <span className="text-emerald-400 font-semibold">{displayServerAvailable}</span>
            </div>

            {/* Visual Storage Bar */}
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mt-0.5 relative flex shadow-inner">
              <div
                style={{ width: `${Math.max(1, Math.min(100, appStorageUsedPercent ?? 3))}%` }}
                className="h-full bg-primary transition-all duration-500 shrink-0"
              ></div>
              <div
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100 - Math.max(1, appStorageUsedPercent ?? 3),
                      (storagePoolUsedPercent ?? 86) - Math.max(1, appStorageUsedPercent ?? 3)
                    )
                  )}%`,
                }}
                className="h-full bg-indigo-500/90 transition-all duration-500 shrink-0"
              ></div>
            </div>

            {/* Capacity summary */}
            {displayServerTotal && (
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-0.5">
                <span>Total: {displayServerTotal}</span>
                <span className="text-emerald-400 font-medium">{displayServerAvailable} free</span>
              </div>
            )}
          </div>

          {/* Server Host & Settings Row */}
          <div className="flex items-center justify-between px-0.5 pt-0.5">
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 min-w-0 text-left cursor-pointer group"
              title="Open Settings & System Details"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center shrink-0 shadow-xs group-hover:bg-emerald-500/20 transition-colors">
                <span className="material-symbols-outlined text-[16px]">dns</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-body-sm text-xs text-on-surface truncate font-medium group-hover:text-white transition-colors">
                  GameVault Server
                </span>
                <span className="font-label-code-sm text-[10px] text-emerald-400 leading-tight flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
                </span>
              </div>
            </button>

            <button
              onClick={onOpenSettings}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer border border-transparent hover:border-outline-variant/30 shrink-0"
              title="Settings"
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
