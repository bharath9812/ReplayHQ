"use client";

import React from "react";

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: "grid" | "filmstrip" | "list";
  onChangeViewMode: (mode: "grid" | "filmstrip" | "list") => void;
  onOpenUpload: () => void;
  onToggleMobileSidebar: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  isSelectMode: boolean;
  onToggleSelectMode: () => void;
  selectedCount?: number;
  sortOption: string;
  onChangeSortOption: (opt: string) => void;
}

export function Navbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onChangeViewMode,
  onOpenUpload,
  onToggleMobileSidebar,
  isSidebarCollapsed,
  onToggleSidebar,
  isSelectMode,
  onToggleSelectMode,
  selectedCount = 0,
  sortOption,
  onChangeSortOption,
}: NavbarProps) {
  return (
    <header className="h-14 bg-surface-container-lowest/90 backdrop-blur-xl z-30 flex items-center justify-between px-space-md lg:px-space-lg border-b border-outline-variant/30 shrink-0 w-full">
      {/* Left: Sidebar Toggle & Vault Badge */}
      <div className="flex items-center gap-space-sm md:gap-space-md">
        {/* Sidebar Toggle Button: Shown on mobile to open/toggle sidebar drawer, or on desktop/iPad when sidebar is collapsed */}
        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.innerWidth < 768) {
              onToggleMobileSidebar();
            } else if (onToggleSidebar) {
              onToggleSidebar();
            }
          }}
          className={`p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-zinc-300 hover:text-white transition-colors cursor-pointer border border-outline-variant/30 items-center justify-center shadow-xs ${
            isSidebarCollapsed ? "flex animate-fade-in" : "flex md:hidden"
          }`}
          title={isSidebarCollapsed ? "Show Sidebar (⌘\\)" : "Open Menu"}
          aria-label={isSidebarCollapsed ? "Show Sidebar" : "Toggle Navigation Sidebar"}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        {/* Immutable Vault Pill */}
        <div className="flex items-center gap-space-xs font-label-code-sm text-label-code-sm text-secondary bg-surface-container px-2.5 py-1 rounded-lg border border-outline-variant/30 shadow-xs">
          <span className="material-symbols-outlined text-[14px]">shield</span>
          <span className="truncate max-w-[140px] sm:max-w-none font-semibold">Immutable Vault • Safe</span>
        </div>
      </div>

      {/* Center: Search input */}
      <div className="flex-1 max-w-md mx-space-sm md:mx-space-lg">
        <div className="flex items-center gap-space-xs bg-surface-container px-space-md py-1 rounded-lg border border-outline-variant/30 focus-within:border-primary/60 transition-colors">
          <span className="material-symbols-outlined text-outline text-[16px]">search</span>
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-transparent border-none outline-none font-body-sm text-body-sm text-on-surface placeholder:text-outline"
            placeholder="Search clips, codecs, fps... (⌘K)"
            type="text"
          />
          {searchQuery ? (
            <button
              onClick={() => onSearchChange("")}
              className="text-outline hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          ) : (
            <kbd className="hidden sm:inline font-label-code-sm text-label-code-sm text-outline bg-surface-container-low px-1.5 py-0.5 rounded border border-outline-variant/30">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-space-sm">
        {/* Segmented View Mode */}
        <div className="hidden md:flex items-center bg-surface-container p-0.5 rounded-lg border border-outline-variant/30">
          <button
            onClick={() => onChangeViewMode("grid")}
            className={`p-1 rounded cursor-pointer transition-colors ${
              viewMode === "grid"
                ? "bg-surface-container-high text-primary shadow-xs"
                : "text-outline hover:text-on-surface"
            }`}
            title="Grid View"
          >
            <span className="material-symbols-outlined text-[16px]">grid_view</span>
          </button>
          <button
            onClick={() => onChangeViewMode("filmstrip")}
            className={`p-1 rounded cursor-pointer transition-colors ${
              viewMode === "filmstrip"
                ? "bg-surface-container-high text-primary shadow-xs"
                : "text-outline hover:text-on-surface"
            }`}
            title="Filmstrip View"
          >
            <span className="material-symbols-outlined text-[16px]">view_day</span>
          </button>
          <button
            onClick={() => onChangeViewMode("list")}
            className={`p-1 rounded cursor-pointer transition-colors ${
              viewMode === "list"
                ? "bg-surface-container-high text-primary shadow-xs"
                : "text-outline hover:text-on-surface"
            }`}
            title="List View"
          >
            <span className="material-symbols-outlined text-[16px]">table_rows</span>
          </button>
        </div>

        {/* Sort Select */}
        <div className="relative">
          <select
            value={sortOption}
            onChange={(e) => onChangeSortOption(e.target.value)}
            className="appearance-none bg-surface-container text-zinc-200 hover:text-white font-body-sm text-xs sm:text-body-sm px-2.5 py-1.5 pr-7 rounded-lg border border-outline-variant/30 cursor-pointer focus:outline-none focus:border-primary"
          >
            <option value="newest">Recently Added</option>
            <option value="oldest">Oldest First</option>
            <option value="duration_desc">Duration (Longest)</option>
            <option value="duration_asc">Duration (Shortest)</option>
            <option value="size_desc">File Size (Largest)</option>
            <option value="fps_desc">Framerate (Highest)</option>
            <option value="title_asc">Title (A-Z)</option>
            <option value="title_desc">Title (Z-A)</option>
          </select>
          <span className="material-symbols-outlined text-[16px] text-outline absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
            arrow_drop_down
          </span>
        </div>

        {/* Select Mode Toggle */}
        <button
          onClick={onToggleSelectMode}
          className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg font-body-sm text-body-sm transition-colors border cursor-pointer ${
            isSelectMode
              ? "bg-primary-container text-on-primary-container border-primary"
              : "bg-surface-container text-outline hover:text-on-surface border-outline-variant/30"
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">checklist</span>
          <span>{isSelectMode ? `Selected (${selectedCount})` : "Select"}</span>
        </button>

        {/* Import Trigger */}
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface font-body-sm text-body-sm font-medium transition-all active:scale-[0.98] cursor-pointer shadow-xs"
        >
          <span className="material-symbols-outlined text-[16px] text-primary">add</span>
          <span className="hidden sm:inline">Import</span>
        </button>
      </div>
    </header>
  );
}
