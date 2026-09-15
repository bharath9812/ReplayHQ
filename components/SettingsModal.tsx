"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useVaultSetting } from "@/lib/settings/settingsEngine";

interface GameProfile {
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

function formatBytes(bytes: number = 0): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  games: GameProfile[];
  onRefreshGames: () => void;
  onRefreshTags?: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  games,
  onRefreshGames,
  onRefreshTags,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"games" | "tags" | "ingest" | "server">("games");

  // Game Categories State
  const [newName, setNewName] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [newRules, setNewRules] = useState("");
  const [newColor, setNewColor] = useState("#8ed5ff");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [gameSearch, setGameSearch] = useState("");
  const [gameFilter, setGameFilter] = useState<"all" | "used" | "unused">("all");
  const [isDeletingGameId, setIsDeletingGameId] = useState<string | null>(null);
  const [isDeletingUnusedGames, setIsDeletingUnusedGames] = useState(false);
  const [gameActionError, setGameActionError] = useState<string | null>(null);

  // Tags State
  const [tags, setTags] = useState<TagItem[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#38bdf8");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isDeletingUnused, setIsDeletingUnused] = useState(false);
  const [tagFilter, setTagFilter] = useState<"all" | "used" | "unused">("all");

  // Playback resume preference (Enterprise Settings Engine)
  const [resumeBehavior, setResumeBehavior] = useVaultSetting("playbackResumeBehavior");

  // Ingest visualization preference (Enterprise Settings Engine)
  const [uploadStyle, setUploadStyle] = useVaultSetting("uploadChartStyle");

  // Folder browsing style preference (Enterprise Settings Engine)
  const [folderStyle, setFolderStyle] = useVaultSetting("folderBrowsingStyle");

  // Centralized Dynamic Linux System Stats
  const [systemStats, setSystemStats] = useState<any>(null);

  const fetchSystemStats = useCallback(async () => {
    try {
      const res = await fetch("/api/system/stats");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setSystemStats(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchSystemStats();
  }, [isOpen, fetchSystemStats]);

  // Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSetUploadStyle = (style: "graph" | "progress-bar") => {
    setUploadStyle(style);
    try {
      window.dispatchEvent(new CustomEvent("gamevault_upload_style_changed", { detail: style }));
    } catch {}
  };

  const handleSetFolderStyle = (style: "shelf" | "finder") => {
    setFolderStyle(style);
    try {
      window.dispatchEvent(new CustomEvent("gamevault_folder_style_changed", { detail: style }));
    } catch {}
  };

  // Fetch tags
  const fetchTags = useCallback(async () => {
    setTagLoading(true);
    try {
      const res = await fetch("/api/tags");
      const data = await res.json();
      if (data.success && Array.isArray(data.tags)) {
        setTags(data.tags);
      }
    } catch (err) {
      console.error("Failed to fetch tags:", err);
    } finally {
      setTagLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && (activeTab === "tags" || tags.length === 0)) {
      fetchTags();
    }
  }, [isOpen, activeTab, fetchTags, tags.length]);

  if (!isOpen) return null;

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newFolder.trim()) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          folderName: newFolder.trim().toLowerCase().replace(/\s+/g, "-"),
          matchRules: newRules.split(",").map((r) => r.trim()).filter(Boolean),
          accentColor: newColor,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNewName("");
        setNewFolder("");
        setNewRules("");
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        onRefreshGames();
      }
    } catch (err) {
      console.error("Failed to add game profile:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGame = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the empty category "${name}"?`)) return;

    setIsDeletingGameId(id);
    setGameActionError(null);
    try {
      const res = await fetch(`/api/games?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        onRefreshGames();
      } else {
        setGameActionError(data.error || "Failed to delete category");
      }
    } catch (err: any) {
      console.error("Failed to delete game:", err);
      setGameActionError(err.message || "Failed to delete category");
    } finally {
      setIsDeletingGameId(null);
    }
  };

  const handleDeleteUnusedGames = async () => {
    if (unusedGamesCount === 0) return;
    if (
      !confirm(
        `Are you sure you want to clean all ${unusedGamesCount} unused categories? Only empty categories with 0 videos will be removed.`
      )
    )
      return;

    setIsDeletingUnusedGames(true);
    setGameActionError(null);
    try {
      const res = await fetch("/api/games?unused=true", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        onRefreshGames();
      } else {
        setGameActionError(data.error || "Failed to delete unused categories");
      }
    } catch (err: any) {
      console.error("Failed to delete unused games:", err);
      setGameActionError(err.message || "Failed to delete unused categories");
    } finally {
      setIsDeletingUnusedGames(false);
    }
  };

  // Tag Management Handlers
  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTagName.trim().toLowerCase().replace(/^#/, "");
    if (!clean) return;

    setIsCreatingTag(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, color: newTagColor }),
      });
      const data = await res.json();
      if (data.success) {
        setNewTagName("");
        fetchTags();
        if (onRefreshTags) onRefreshTags();
      }
    } catch (err) {
      console.error("Failed to create tag:", err);
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleDeleteTag = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the tag #${name}?`)) return;

    try {
      const res = await fetch(`/api/tags?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchTags();
        if (onRefreshTags) onRefreshTags();
      }
    } catch (err) {
      console.error("Failed to delete tag:", err);
    }
  };

  const handleDeleteUnusedTags = async () => {
    const unusedCount = tags.filter((t) => t.count === 0).length;
    if (unusedCount === 0) return;
    if (!confirm(`Are you sure you want to delete all ${unusedCount} unused tag(s)?`)) return;

    setIsDeletingUnused(true);
    try {
      const res = await fetch("/api/tags?unused=true", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchTags();
        if (onRefreshTags) onRefreshTags();
      }
    } catch (err) {
      console.error("Failed to delete unused tags:", err);
    } finally {
      setIsDeletingUnused(false);
    }
  };

  const unusedTagsCount = tags.filter((t) => t.count === 0).length;
  const filteredTags = tags.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(tagSearch.toLowerCase().trim());
    if (!matchesSearch) return false;
    if (tagFilter === "used") return t.count > 0;
    if (tagFilter === "unused") return t.count === 0;
    return true;
  });

  const realGames = useMemo(
    () => games.filter((g) => g.id !== "uncategorized" && g.slug !== "uncategorized"),
    [games]
  );
  const unusedGamesCount = realGames.filter((g) => (g.clipCount || 0) === 0).length;
  const usedGamesCount = realGames.filter((g) => (g.clipCount || 0) > 0).length;

  const filteredGames = realGames.filter((g) => {
    const matchesSearch =
      !gameSearch.trim() ||
      g.name.toLowerCase().includes(gameSearch.toLowerCase().trim()) ||
      (g.folderName && g.folderName.toLowerCase().includes(gameSearch.toLowerCase().trim())) ||
      (g.matchRules && g.matchRules.some((r) => r.toLowerCase().includes(gameSearch.toLowerCase().trim())));
    if (!matchesSearch) return false;

    const count = g.clipCount || 0;
    if (gameFilter === "used") return count > 0;
    if (gameFilter === "unused") return count === 0;
    return true;
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-6 select-none animate-fade-in overflow-hidden overscroll-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-5xl h-[94vh] sm:h-[84vh] sm:min-h-[600px] sm:max-h-[760px] rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl relative flex flex-col md:flex-row text-on-surface overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Navigation Sidebar (Notion-Style) */}
        <aside className="w-full md:w-60 lg:w-64 border-b md:border-b-0 md:border-r border-outline-variant/20 bg-surface-container-lowest/95 md:bg-zinc-950/40 flex flex-col shrink-0">
          {/* Sidebar Top: Branding & Host Info */}
          <div className="p-3.5 sm:p-4 flex items-center justify-between border-b border-outline-variant/15">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary border border-outline-variant/30 shadow-xs shrink-0">
                <span className="material-symbols-outlined text-[18px]">settings</span>
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-xs sm:text-sm text-on-surface truncate">Settings</h2>
                <p className="text-[10px] text-outline truncate">Preferences &amp; System</p>
              </div>
            </div>
            {/* Mobile close button */}
            <button
              onClick={onClose}
              className="md:hidden p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              title="Close"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Navigation Items (Scrollable on small height or mobile) */}
          <div className="flex md:flex-col p-2 md:p-3 gap-1 overflow-x-auto md:overflow-y-auto no-scrollbar flex-1">
            {/* Group 1: LIBRARY */}
            <div className="hidden md:block px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              Library
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("games")}
              className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-all cursor-pointer shrink-0 text-left ${
                activeTab === "games"
                  ? "bg-white/[0.08] text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                  : "text-outline hover:text-on-surface hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`material-symbols-outlined text-[17px] ${activeTab === "games" ? "text-primary" : "text-outline"}`}>
                  category
                </span>
                <span className="truncate">Category Manager</span>
              </div>
              {unusedGamesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-mono text-[10px] border border-amber-500/30 shrink-0">
                  {unusedGamesCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("tags")}
              className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-all cursor-pointer shrink-0 text-left ${
                activeTab === "tags"
                  ? "bg-white/[0.08] text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                  : "text-outline hover:text-on-surface hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`material-symbols-outlined text-[17px] ${activeTab === "tags" ? "text-primary" : "text-outline"}`}>
                  label
                </span>
                <span className="truncate">Tag Manager</span>
              </div>
              {unusedTagsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-mono text-[10px] border border-amber-500/30 shrink-0">
                  {unusedTagsCount}
                </span>
              )}
            </button>

            {/* Group 2: PREFERENCES */}
            <div className="hidden md:block px-2.5 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              Preferences
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("ingest")}
              className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-all cursor-pointer shrink-0 text-left ${
                activeTab === "ingest"
                  ? "bg-white/[0.08] text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                  : "text-outline hover:text-on-surface hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`material-symbols-outlined text-[17px] ${activeTab === "ingest" ? "text-primary" : "text-outline"}`}>
                  play_circle
                </span>
                <span className="truncate">Playback &amp; Uploads</span>
              </div>
            </button>

            {/* Group 3: SYSTEM */}
            <div className="hidden md:block px-2.5 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              System
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("server")}
              className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-all cursor-pointer shrink-0 text-left ${
                activeTab === "server"
                  ? "bg-white/[0.08] text-on-surface font-medium border border-outline-variant/30 shadow-xs"
                  : "text-outline hover:text-on-surface hover:bg-white/[0.03] border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`material-symbols-outlined text-[17px] ${activeTab === "server" ? "text-primary" : "text-outline"}`}>
                  info
                </span>
                <span className="truncate">About GameVault</span>
              </div>
            </button>
          </div>

          {/* Sidebar Bottom: Dynamic Host Status Footer */}
          <div className="hidden md:flex p-3 border-t border-outline-variant/15 mt-auto items-center justify-between text-[11px] text-outline bg-surface-container-lowest/40">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-zinc-400 font-medium">Server Connected</span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-surface-container font-mono text-[9px] border border-outline-variant/20 text-emerald-400">
              ACTIVE
            </span>
          </div>
        </aside>

        {/* Right Main Content Canvas */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-surface-container-lowest">
          {/* Header Bar */}
          <div className="px-5 py-3.5 sm:px-8 sm:py-5 border-b border-outline-variant/20 flex items-center justify-between shrink-0 bg-surface-container-lowest/80 backdrop-blur-xs">
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-on-surface flex items-center gap-2">
                {activeTab === "games" && "Category Manager"}
                {activeTab === "tags" && "Tag Manager"}
                {activeTab === "ingest" && "Playback & Uploads"}
                {activeTab === "server" && "About GameVault"}
              </h1>
              <p className="text-xs text-outline mt-0.5">
                {activeTab === "games" && "Manage game categories, storage subfolders, and auto-matching rules."}
                {activeTab === "tags" && "Organize custom tags and review metadata usage across your library."}
                {activeTab === "ingest" && "Configure playback resume, upload speed graphs, and display preferences."}
                {activeTab === "server" && "App details, storage safety architecture, and server info."}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer flex items-center gap-1 group"
              title="Close (Esc)"
            >
              <span className="text-[11px] font-mono text-zinc-500 group-hover:text-zinc-400 hidden sm:inline">Esc</span>
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">close</span>
            </button>
          </div>

          {/* Scrollable Tab Canvas Body */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-5 sm:py-6 space-y-6 no-scrollbar">
            {/* TAB 1: CATEGORY / GAME MANAGER */}
          {activeTab === "games" && (
            <div className="space-y-5 font-sans">
              {/* Error banner if deletion rejected */}
              {gameActionError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    <span>{gameActionError}</span>
                  </div>
                  <button onClick={() => setGameActionError(null)} className="text-zinc-400 hover:text-white cursor-pointer">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              )}

              {/* Add New Game Category Form */}
              <form onSubmit={handleAddGame} className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-xs text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-[16px]">add_circle</span>
                    <span>Create Game Category</span>
                  </h3>
                  {saveSuccess && (
                    <span className="text-secondary text-xs flex items-center gap-1 font-sans">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Category Created!
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-outline mb-1">Category / Game Name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        if (!newFolder) {
                          setNewFolder(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                        }
                      }}
                      placeholder="e.g. Battlegrounds Mobile India"
                      className="w-full px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-outline mb-1">Storage Subfolder</label>
                    <input
                      type="text"
                      value={newFolder}
                      onChange={(e) => setNewFolder(e.target.value)}
                      placeholder="e.g. bgmi"
                      className="w-full px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-outline mb-1">
                    Auto-Match Pattern Tokens (comma-separated for auto-categorization on import)
                  </label>
                  <input
                    type="text"
                    value={newRules}
                    onChange={(e) => setNewRules(e.target.value)}
                    placeholder="e.g. bgmi, pubg, battlegrounds"
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-outline">Accent Color:</span>
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="w-6 h-6 rounded border-none bg-transparent cursor-pointer"
                      title="Accent Color"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSaving || !newName.trim() || !newFolder.trim()}
                    className="px-4 py-1.5 rounded-lg font-medium text-xs text-on-primary bg-primary hover:brightness-105 active:scale-98 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {isSaving ? "Creating..." : "Add Category"}
                  </button>
                </div>
              </form>

              {/* Category Controls & Filters (Search, All/Active/Unused, Bulk Clean) */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Search & Filter */}
                <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={gameSearch}
                      onChange={(e) => setGameSearch(e.target.value)}
                      placeholder="Filter categories or storage folders..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
                    />
                    <span className="material-symbols-outlined text-outline text-[16px] absolute left-2.5 top-1/2 -translate-y-1/2">
                      search
                    </span>
                  </div>

                  <div className="flex rounded-lg bg-surface-container p-0.5 border border-outline-variant/30 text-[11px] font-mono shrink-0">
                    <button
                      onClick={() => setGameFilter("all")}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        gameFilter === "all" ? "bg-primary text-on-primary font-semibold" : "text-outline hover:text-on-surface"
                      }`}
                    >
                      All ({realGames.length})
                    </button>
                    <button
                      onClick={() => setGameFilter("used")}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        gameFilter === "used" ? "bg-primary text-on-primary font-semibold" : "text-outline hover:text-on-surface"
                      }`}
                    >
                      With Clips ({usedGamesCount})
                    </button>
                    <button
                      onClick={() => setGameFilter("unused")}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        gameFilter === "unused" ? "bg-primary text-on-primary font-semibold" : "text-outline hover:text-on-surface"
                      }`}
                    >
                      Empty ({unusedGamesCount})
                    </button>
                  </div>
                </div>

                {/* Bulk Delete Unused Categories Button */}
                {unusedGamesCount > 0 && (
                  <button
                    onClick={handleDeleteUnusedGames}
                    disabled={isDeletingUnusedGames}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error-container/20 border border-error/40 text-error text-xs font-semibold hover:bg-error-container/40 transition-colors cursor-pointer shrink-0 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                    <span>Clean {unusedGamesCount} Empty Categor{unusedGamesCount > 1 ? "ies" : "y"}</span>
                  </button>
                )}
              </div>

              {/* Categories Grid List */}
              <div className="space-y-2">
                {filteredGames.length > 0 ? (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 no-scrollbar">
                    {filteredGames.map((g) => {
                      const clipCount = g.clipCount || 0;
                      const isUnused = clipCount === 0;
                      const hasFolders = g.folders && g.folders.length > 0;

                      return (
                        <div
                          key={g.id}
                          className={`p-3 rounded-xl border flex flex-col gap-2 transition-colors ${
                            isUnused
                              ? "bg-surface-container-lowest border-outline-variant/20 hover:border-outline-variant/40"
                              : "bg-surface-container-low border-outline-variant/30 hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: g.accentColor || "#007AFF" }}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-xs text-on-surface truncate">
                                    {g.name}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-mono text-[10px] border ${
                                      isUnused
                                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                        : "bg-primary/15 text-primary border-primary/30 font-semibold"
                                    }`}
                                  >
                                    {clipCount} video{clipCount === 1 ? "" : "s"} • {formatBytes(g.totalBytes || 0)}
                                  </span>
                                </div>
                                <span className="text-[11px] text-outline font-mono truncate block mt-0.5">
                                  /originals/{g.folderName || g.slug}/ • Auto-match:{" "}
                                  {Array.isArray(g.matchRules) ? g.matchRules.join(", ") : g.slug}
                                </span>
                              </div>
                            </div>

                            {/* Deletion / Protected State */}
                            <div className="shrink-0 flex items-center gap-2">
                              {isUnused ? (
                                <button
                                  onClick={() => handleDeleteGame(g.id, g.name)}
                                  disabled={isDeletingGameId === g.id}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-mono transition-colors cursor-pointer active:scale-95"
                                  title="Delete empty category"
                                >
                                  <span className="material-symbols-outlined text-[15px]">delete</span>
                                  <span>{isDeletingGameId === g.id ? "Deleting..." : "Delete Empty"}</span>
                                </button>
                              ) : (
                                <div
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container border border-outline-variant/30 text-zinc-400 text-[11px] font-mono select-none"
                                  title="Category has active footage and cannot be deleted until footage is removed or reassigned."
                                >
                                  <span className="material-symbols-outlined text-[14px] text-emerald-400">
                                    shield
                                  </span>
                                  <span>Active ({clipCount})</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Nested Subfolders Pill Row if any exist */}
                          {hasFolders && (
                            <div className="pt-2 border-t border-outline-variant/20 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                                Subfolders:
                              </span>
                              {g.folders!.map((f) => (
                                <span
                                  key={f.name}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container text-zinc-300 border border-outline-variant/25 text-[11px] font-mono"
                                >
                                  <span className="material-symbols-outlined text-[12px] text-primary">folder</span>
                                  <span>{f.name}</span>
                                  <span className="text-[9px] text-zinc-500">({f.clipCount})</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-outline text-xs font-mono rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                    No game categories found matching &ldquo;{gameSearch}&rdquo;.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TAG MANAGER */}
          {activeTab === "tags" && (
            <div className="space-y-5 font-sans">
              {/* Create Tag Form */}
              <form onSubmit={handleCreateTag} className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <span className="material-symbols-outlined text-primary text-[18px]">add_circle</span>
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Create new tag (e.g. bossfight, 4k-hdr)..."
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-7 h-7 rounded border-none bg-transparent cursor-pointer"
                    title="Tag Color Accent"
                  />
                  <button
                    type="submit"
                    disabled={isCreatingTag || !newTagName.trim()}
                    className="px-3.5 py-1.5 rounded-lg font-medium text-xs text-on-primary bg-primary hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {isCreatingTag ? "Adding..." : "Add Tag"}
                  </button>
                </div>
              </form>

              {/* Tag Controls & Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Search & Filter */}
                <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      placeholder="Filter tags..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
                    />
                    <span className="material-symbols-outlined text-outline text-[16px] absolute left-2.5 top-1/2 -translate-y-1/2">
                      search
                    </span>
                  </div>

                  <div className="flex rounded-lg bg-surface-container p-0.5 border border-outline-variant/30 text-[11px] font-mono shrink-0">
                    <button
                      onClick={() => setTagFilter("all")}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        tagFilter === "all" ? "bg-primary text-on-primary font-semibold" : "text-outline hover:text-on-surface"
                      }`}
                    >
                      All ({tags.length})
                    </button>
                    <button
                      onClick={() => setTagFilter("used")}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        tagFilter === "used" ? "bg-primary text-on-primary font-semibold" : "text-outline hover:text-on-surface"
                      }`}
                    >
                      Used ({tags.filter((t) => t.count > 0).length})
                    </button>
                    <button
                      onClick={() => setTagFilter("unused")}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        tagFilter === "unused" ? "bg-primary text-on-primary font-semibold" : "text-outline hover:text-on-surface"
                      }`}
                    >
                      Unused ({unusedTagsCount})
                    </button>
                  </div>
                </div>

                {/* Bulk Delete Unused Button */}
                {unusedTagsCount > 0 && (
                  <button
                    onClick={handleDeleteUnusedTags}
                    disabled={isDeletingUnused}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error-container/20 border border-error/40 text-error text-xs font-semibold hover:bg-error-container/40 transition-colors cursor-pointer shrink-0 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                    <span>Clean {unusedTagsCount} Unused Tag{unusedTagsCount > 1 ? "s" : ""}</span>
                  </button>
                )}
              </div>

              {/* Tags Grid */}
              <div className="space-y-2">
                {tagLoading ? (
                  <div className="py-8 text-center text-outline text-xs flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px] animate-spin">progress_activity</span>
                    <span>Loading tags database...</span>
                  </div>
                ) : filteredTags.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1 no-scrollbar">
                    {filteredTags.map((t) => {
                      const isUnused = t.count === 0;
                      return (
                        <div
                          key={t.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                            isUnused
                              ? "bg-surface-container-lowest border-outline-variant/20 hover:border-outline-variant/50"
                              : "bg-surface-container-low border-outline-variant/30 hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: t.color || "#38bdf8" }}
                            />
                            <div className="overflow-hidden min-w-0">
                              <span className="font-semibold text-xs text-on-surface truncate block font-mono">
                                #{t.name}
                              </span>
                              <span
                                className={`text-[10px] font-mono ${
                                  isUnused ? "text-amber-400 font-medium" : "text-outline"
                                }`}
                              >
                                {isUnused ? "0 videos (Unused)" : `${t.count} video${t.count > 1 ? "s" : ""}`}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteTag(t.id, t.name)}
                            className="p-1 rounded-md text-outline hover:text-error hover:bg-surface-container transition-colors cursor-pointer shrink-0"
                            title={isUnused ? "Delete Unused Tag" : "Delete Tag"}
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-10 text-center text-outline text-xs bg-surface-container-low rounded-xl border border-outline-variant/20">
                    No matching tags found.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PLAYBACK & INGEST PREFERENCES */}
          {activeTab === "ingest" && (
            <div className="space-y-4">
              {/* Playback & Resume Directive */}
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-primary uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">play_circle</span>
                    Playback &amp; Resume
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-mono">
                    Instant Auto-Sync
                  </span>
                </div>
                <p className="text-xs text-outline leading-relaxed">
                  Choose whether footage automatically resumes from your last watched timestamp (like YouTube), or always begins at 0:00. This preference is honored everywhere across all devices.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Option 1: Resume from Last Left */}
                  <div
                    onClick={() => setResumeBehavior("resume")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                      resumeBehavior === "resume"
                        ? "border-primary bg-primary/10 shadow-md"
                        : "border-outline-variant/30 bg-surface-container hover:border-outline-variant/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">history</span>
                        <span className="font-semibold text-xs text-on-surface">Resume from Last Left</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-primary font-mono">
                        YouTube Style
                      </span>
                    </div>
                    <p className="text-[11px] text-outline leading-normal">
                      Automatically starts playback at the exact timestamp you left off. Includes a 1-click &quot;Start Over&quot; HUD prompt in the player.
                    </p>
                    <div className="h-10 w-full rounded-lg bg-black/50 border border-outline-variant/20 flex items-center px-3 gap-2 mt-1">
                      <span className="text-[10px] font-mono text-zinc-400">03:45</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="w-[45%] h-full bg-[#FF0033] rounded-full" />
                      </div>
                      <span className="text-[9px] px-1 rounded bg-[#FF0033]/20 text-[#FF6680] font-mono">
                        Resume
                      </span>
                    </div>
                  </div>

                  {/* Option 2: Always Start at 0:00 */}
                  <div
                    onClick={() => setResumeBehavior("beginning")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                      resumeBehavior === "beginning"
                        ? "border-primary bg-primary/10 shadow-md"
                        : "border-outline-variant/30 bg-surface-container hover:border-outline-variant/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">first_page</span>
                        <span className="font-semibold text-xs text-on-surface">Always Start at 0:00</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-outline font-mono">
                        Fresh Start
                      </span>
                    </div>
                    <p className="text-[11px] text-outline leading-normal">
                      Always begins playback from 0:00. Watch history red bars remain visible on library cards, and a quick &quot;Resume&quot; button appears in the player HUD.
                    </p>
                    <div className="h-10 w-full rounded-lg bg-black/50 border border-outline-variant/20 flex items-center px-3 gap-2 mt-1">
                      <span className="text-[10px] font-mono text-primary font-bold">00:00</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="w-[0%] h-full bg-[#FF0033] rounded-full" />
                      </div>
                      <span className="text-[9px] px-1 rounded bg-zinc-700 text-zinc-300 font-mono">
                        Start 0:00
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload Telemetry Mode */}
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-3">
                <span className="font-semibold text-xs text-primary uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">show_chart</span>
                  Upload Telemetry &amp; Visualization Mode
                </span>
                <p className="text-xs text-outline leading-relaxed">
                  Choose how upload speeds, chunk throughput, and ingest completion are visually graphed across the application.
                </p>

                {/* Options Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Option 1: Microsoft Style Speed Graph */}
                  <div
                    onClick={() => handleSetUploadStyle("graph")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                      uploadStyle === "graph"
                        ? "border-primary bg-primary/10 shadow-md"
                        : "border-outline-variant/30 bg-surface-container hover:border-outline-variant/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">ssid_chart</span>
                        <span className="font-semibold text-xs text-on-surface">Speed Graph</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary font-mono">
                        Windows Style
                      </span>
                    </div>

                    <p className="text-[11px] text-outline leading-normal">
                      Dynamic real-time throughput area graph with peak MB/s tracking and live network speed waveform.
                    </p>

                    {/* Mini SVG Preview */}
                    <div className="h-12 w-full rounded-lg bg-black/40 border border-outline-variant/20 flex items-end p-1 overflow-hidden mt-1">
                      <svg className="w-full h-full text-primary" viewBox="0 0 100 40" preserveAspectRatio="none">
                        <path
                          d="M0,35 Q15,10 30,25 T60,15 T90,5 L100,20 L100,40 L0,40 Z"
                          fill="currentColor"
                          fillOpacity="0.25"
                        />
                        <path
                          d="M0,35 Q15,10 30,25 T60,15 T90,5 L100,20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Option 2: Clean Progress Bar */}
                  <div
                    onClick={() => handleSetUploadStyle("progress-bar")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                      uploadStyle === "progress-bar"
                        ? "border-primary bg-primary/10 shadow-md"
                        : "border-outline-variant/30 bg-surface-container hover:border-outline-variant/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary text-[20px]">linear_scale</span>
                        <span className="font-semibold text-xs text-on-surface">Progress Bar</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-outline font-mono">
                        Minimal
                      </span>
                    </div>

                    <p className="text-[11px] text-outline leading-normal">
                      Clean linear progress bar with high-precision percentage, remaining bytes, and ETA counter.
                    </p>

                    {/* Mini Preview */}
                    <div className="h-12 w-full rounded-lg bg-black/40 border border-outline-variant/20 flex flex-col justify-center px-3 gap-1.5 mt-1">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>74%</span>
                        <span>12s remaining</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
                        <div className="w-3/4 h-full bg-secondary rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Folder Exploration & Browsing Preference */}
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-3">
                <span className="font-semibold text-xs text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">folder_special</span>
                  Folder Exploration &amp; Browsing Style
                </span>
                <p className="text-xs text-outline leading-relaxed">
                  Choose how game subfolders are explored: either as an Apple macOS Finder directory canvas with drill-down navigation, or as a rapid horizontal shelf strip pinned above clips.
                </p>

                {/* Folder Style Option Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Option 1: macOS Finder Style */}
                  <div
                    onClick={() => handleSetFolderStyle("finder")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                      folderStyle === "finder"
                        ? "border-amber-400 bg-amber-500/10 shadow-md"
                        : "border-outline-variant/30 bg-surface-container hover:border-outline-variant/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-400 text-[20px]">folder_copy</span>
                        <span className="font-semibold text-xs text-on-surface">macOS Finder Style</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-amber-300 font-mono">
                        Directory
                      </span>
                    </div>

                    <p className="text-[11px] text-outline leading-normal">
                      Interactive macOS Finder folder cards in the main canvas. Click to open and drill down with path bar breadcrumbs and back navigation.
                    </p>

                    {/* Mini Preview Graphic */}
                    <div className="h-12 w-full rounded-lg bg-black/40 border border-outline-variant/20 flex items-center justify-around px-3 gap-2 mt-1">
                      <div className="flex flex-col items-center">
                        <span className="material-symbols-outlined text-amber-400 text-[18px]">folder</span>
                        <span className="text-[9px] font-mono text-zinc-400">Season-19</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="material-symbols-outlined text-amber-400 text-[18px]">folder</span>
                        <span className="text-[9px] font-mono text-zinc-400">Tournaments</span>
                      </div>
                    </div>
                  </div>

                  {/* Option 2: Horizontal Shelf Strip */}
                  <div
                    onClick={() => handleSetFolderStyle("shelf")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                      folderStyle === "shelf"
                        ? "border-primary bg-primary/10 shadow-md"
                        : "border-outline-variant/30 bg-surface-container hover:border-outline-variant/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">view_column</span>
                        <span className="font-semibold text-xs text-on-surface">Horizontal Shelf Strip</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary font-mono">
                        Quick Filter
                      </span>
                    </div>

                    <p className="text-[11px] text-outline leading-normal">
                      Compact horizontal pill strip pinned above the media grid. Click any folder tab to filter clips instantly without leaving the full catalog.
                    </p>

                    {/* Mini Preview Graphic */}
                    <div className="h-12 w-full rounded-lg bg-black/40 border border-outline-variant/20 flex items-center px-2 gap-1.5 mt-1 overflow-hidden">
                      <div className="px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 text-[9px] font-mono shrink-0">
                        All Clips
                      </div>
                      <div className="px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 text-[9px] font-mono shrink-0">
                        📁 Season-19
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ABOUT GAMEVAULT */}
          {activeTab === "server" && (
            <div className="space-y-5 text-xs font-sans">
              {/* App Overview Card */}
              <div className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[26px] text-primary">videogame_asset</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-on-surface">GameVault Media Engine</span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-mono text-[10px] font-semibold border border-primary/25">
                        v2.4.0
                      </span>
                    </div>
                    <p className="text-outline text-xs mt-0.5">
                      Lossless gameplay recording vault, timeline scrubber, and high-throughput media streamer.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Host Operational
                  </span>
                </div>
              </div>

              {/* Zero-Corruption Storage Safeguards */}
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/25 space-y-3">
                <span className="font-semibold text-xs text-secondary uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">verified_user</span>
                  Zero-Corruption Storage Architecture
                </span>
                <p className="text-outline leading-relaxed text-xs">
                  Original gameplay recordings uploaded from iPad or PC are treated as write-once, read-only master files.
                  They are permanently mounted with strict read permissions in{" "}
                  <code className="bg-surface-container px-1.5 py-0.5 rounded text-on-surface font-mono text-[11px]">
                    /data/storage/originals/
                  </code>
                  . Thumbnails, 320x180 storyboard scrubbing sheets, and trimmed clips reside exclusively in{" "}
                  <code className="bg-surface-container px-1.5 py-0.5 rounded text-on-surface font-mono text-[11px]">
                    /data/storage/derived/
                  </code>
                  , guaranteeing the source footage is never modified or compressed.
                </p>
              </div>

              {/* Dynamic Topology & Specs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-col gap-1">
                  <span className="text-outline text-[11px] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-primary">router</span>
                    Assigned Network Port
                  </span>
                  <span className="text-on-surface font-mono font-semibold text-sm">
                    {systemStats?.host?.port || (typeof window !== "undefined" && window.location.port ? window.location.port : "3845")}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Dedicated container port</span>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-col gap-1">
                  <span className="text-outline text-[11px] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-secondary">stream</span>
                    Streaming Protocol
                  </span>
                  <span className="text-on-surface font-semibold text-sm">HTTP 206 Partial Content</span>
                  <span className="text-[10px] text-zinc-500 font-mono">Byte-range instant seeking for 4K/60fps</span>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-col gap-1">
                  <span className="text-outline text-[11px] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-amber-400">bolt</span>
                    Hardware Acceleration
                  </span>
                  <span className="text-on-surface font-semibold text-sm truncate">
                    {systemStats?.host?.hardwareTranscoder || (systemStats?.host?.hasQuickSync ? "Intel QuickSync (QSV)" : "Hardware Accelerated")}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Hardware pass-through via /dev/dri</span>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-col gap-1">
                  <span className="text-outline text-[11px] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-emerald-400">fingerprint</span>
                    Data Integrity Verification
                  </span>
                  <span className="text-emerald-400 font-mono font-semibold text-sm">SHA-256 Checksums</span>
                  <span className="text-[10px] text-zinc-500 font-mono">Computed on ingestion and verified on audit</span>
                </div>
              </div>

              {/* Dynamic Host & Container Environment */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
                <span className="text-[11px] font-semibold text-outline uppercase tracking-wider block">
                  Container &amp; Server Topology
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div className="p-2 rounded-lg bg-surface-container/60 border border-outline-variant/15">
                    <span className="text-zinc-500 block text-[10px]">Host Machine</span>
                    <span className="text-on-surface font-semibold truncate block">
                      {systemStats?.host?.hostname || "Server"} ({systemStats?.host?.osType || systemStats?.host?.platform || "Linux"})
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-container/60 border border-outline-variant/15">
                    <span className="text-zinc-500 block text-[10px]">App Container</span>
                    <span className="text-on-surface font-semibold truncate block">gamevault-app</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-container/60 border border-outline-variant/15">
                    <span className="text-zinc-500 block text-[10px]">DB Container</span>
                    <span className="text-on-surface font-semibold truncate block">gamevault-db</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-container/60 border border-outline-variant/15">
                    <span className="text-zinc-500 block text-[10px]">Internal Network</span>
                    <span className="text-on-surface font-semibold truncate block">gamevault_internal</span>
                  </div>
                </div>

                {/* Secondary Diagnostic Info */}
                {systemStats?.host?.ip && (
                  <div className="pt-2 border-t border-outline-variant/15 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                    <span>Host Endpoint:</span>
                    <span className="text-zinc-400">{systemStats.host.ip}:{systemStats?.host?.port || "3845"}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
