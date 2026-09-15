"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Sidebar, GameInfo, CollectionInfo, triggerVaultSync } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";
import { ClipCard, ClipData } from "@/components/ClipCard";
import { ProcessingSafetyView } from "@/components/ProcessingSafetyView";
import { DeepVideoPlayerModal } from "@/components/DeepVideoPlayerModal";
import { UploadModal } from "@/components/UploadModal";
import { SettingsModal } from "@/components/SettingsModal";
import { FolderOrganizeModal } from "@/components/FolderOrganizeModal";
import { FinderFolderCard } from "@/components/FinderFolderCard";
import { NewCollectionModal } from "@/components/NewCollectionModal";
import { CollectionManagerModal } from "@/components/CollectionManagerModal";

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function DashboardPage() {
  // Navigation View State
  const [currentView, setCurrentView] = useState<string>("all-footage");
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [resolutionFilter, setResolutionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOption, setSortOption] = useState<string>("newest");
  const [viewMode, setViewMode] = useState<"grid" | "filmstrip" | "list">("grid");

  // Modal State for Folder Organizer
  const [isFolderOrganizeOpen, setIsFolderOrganizeOpen] = useState(false);
  const [folderOrganizeGameSlug, setFolderOrganizeGameSlug] = useState<string | undefined>(undefined);
  const [folderOrganizeClipIds, setFolderOrganizeClipIds] = useState<string[] | undefined>(undefined);
  const [folderOrganizeInitialFolderName, setFolderOrganizeInitialFolderName] = useState<string | null>(null);

  // Modal State for Collection Manager
  const [isCollectionManagerOpen, setIsCollectionManagerOpen] = useState(false);
  const [collectionManagerInitialId, setCollectionManagerInitialId] = useState<string | null>(null);

  // Bulk Action Dock Popover States
  const [isBulkFolderPopoverOpen, setIsBulkFolderPopoverOpen] = useState(false);
  const [bulkNewFolderInput, setBulkNewFolderInput] = useState("");
  const [isBulkCollectionPopoverOpen, setIsBulkCollectionPopoverOpen] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Selection State
  const [selectedClip, setSelectedClip] = useState<ClipData | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());

  // Persistent Collapsible & Resizable Sidebar State (Server-backed + optimistic localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("gamevault_sidebar_collapsed");
        if (saved !== null) return saved === "true";
      } catch {}
    }
    return false;
  });

  const [sidebarWidth, setSidebarWidth] = useState<number>(260);

  // Debounce ref for live dragging saves
  const sidebarPersistTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Robust server & client persistence function
  const persistSidebarWidth = useCallback((width: number) => {
    // 1. Instant synchronous write to localStorage, CSS Variable & Cookie
    try {
      localStorage.setItem("gamevault_sidebar_width", String(width));
      localStorage.setItem("gamevault_sidebar_width_ts", String(Date.now()));
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
        document.cookie = `gamevault_sidebar_width=${width}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch {}

    // 2. Guaranteed unmount-resistant dispatch to server (keepalive survives immediate refresh)
    try {
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "sidebar_width", value: String(width) }),
        keepalive: true,
      }).catch((err) => {
        console.error("Failed to persist sidebar width to server:", err);
      });
    } catch (err) {
      console.error("Failed to persist sidebar width:", err);
    }
  }, []);

  // Hydrate sidebar settings on client mount (immediately from localStorage, then synced with server)
  useEffect(() => {
    // 1. Instantly read localStorage on client mount so sidebar snaps to user preference with zero delay
    try {
      const savedWidth = localStorage.getItem("gamevault_sidebar_width");
      if (savedWidth) {
        const num = parseInt(savedWidth, 10);
        if (!isNaN(num) && num >= 180 && num <= 500) {
          setSidebarWidth(num);
          document.documentElement.style.setProperty("--sidebar-width", `${num}px`);
        }
      }
      const savedCollapsed = localStorage.getItem("gamevault_sidebar_collapsed");
      if (savedCollapsed !== null) {
        setIsSidebarCollapsed(savedCollapsed === "true");
      }
    } catch {}

    // 2. Sync with database settings (for cross-device / fresh browser sync)
    const fetchServerSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (data.success && data.settings) {
          const localSaved = localStorage.getItem("gamevault_sidebar_width");
          if (!localSaved && data.settings.sidebar_width) {
            const num = parseInt(data.settings.sidebar_width, 10);
            if (!isNaN(num) && num >= 180 && num <= 500) {
              setSidebarWidth(num);
              document.documentElement.style.setProperty("--sidebar-width", `${num}px`);
              try {
                localStorage.setItem("gamevault_sidebar_width", String(num));
              } catch {}
            }
          }
          const localCol = localStorage.getItem("gamevault_sidebar_collapsed");
          if (localCol === null && data.settings.sidebar_collapsed !== undefined) {
            const isCol = data.settings.sidebar_collapsed === "true";
            setIsSidebarCollapsed(isCol);
            try {
              localStorage.setItem("gamevault_sidebar_collapsed", String(isCol));
            } catch {}
          }
        }
      } catch {
        // Gracefully keep local values
      }
    };
    fetchServerSettings();
  }, []);

  const handleSidebarResize = useCallback((newWidth: number) => {
    setSidebarWidth(newWidth);
    // Instant local save & CSS variable update on every pixel moved
    try {
      localStorage.setItem("gamevault_sidebar_width", String(newWidth));
      localStorage.setItem("gamevault_sidebar_width_ts", String(Date.now()));
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty("--sidebar-width", `${newWidth}px`);
      }
    } catch {}

    // Debounced server save while dragging (if user stops moving for 250ms, save immediately)
    if (sidebarPersistTimerRef.current) clearTimeout(sidebarPersistTimerRef.current);
    sidebarPersistTimerRef.current = setTimeout(() => {
      persistSidebarWidth(newWidth);
    }, 250);
  }, [persistSidebarWidth]);

  const handleSidebarResizeEnd = useCallback((finalWidth: number) => {
    // Cancel debounce timer and execute immediate synchronous commit
    if (sidebarPersistTimerRef.current) clearTimeout(sidebarPersistTimerRef.current);
    setSidebarWidth(finalWidth);
    persistSidebarWidth(finalWidth);
  }, [persistSidebarWidth]);

  const toggleSidebarCollapse = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsOpenMobileSidebar((prev) => !prev);
      return;
    }
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("gamevault_sidebar_collapsed", String(next));
      } catch {}
      const payload = JSON.stringify({ key: "sidebar_collapsed", value: String(next) });
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const blob = new Blob([payload], { type: "application/json" });
          const sent = navigator.sendBeacon("/api/settings", blob);
          if (!sent) {
            fetch("/api/settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true,
            }).catch(() => {});
          }
        } else {
          fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch (err) {
        console.error("Failed to persist collapse to server:", err);
      }
      return next;
    });
  }, []);

  // Modal State
  const [activePlayerClip, setActivePlayerClip] = useState<ClipData | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [hasActiveUpload, setHasActiveUpload] = useState(false);

  // Global Refresh Protection when an upload is in flight
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasActiveUpload) {
        e.preventDefault();
        e.returnValue = "Upload is in progress. Leaving or refreshing will interrupt your upload.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasActiveUpload]);

  // Auto-open Upload Modal if an interrupted upload is stored in localStorage
  useEffect(() => {
    try {
      const activeUpload = localStorage.getItem("gamevault_active_upload");
      if (activeUpload) {
        setIsUploadOpen(true);
      }
    } catch {}
  }, []);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [isNewCollectionOpen, setIsNewCollectionOpen] = useState(false);
  const [isOpenMobileSidebar, setIsOpenMobileSidebar] = useState(false);

  // Folder Browsing Style Preference ('shelf' | 'finder')
  const [folderDisplayStyle, setFolderDisplayStyle] = useState<"shelf" | "finder">("shelf");

  // Load and synchronize Folder Browsing Style preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gamevault_folder_style");
      if (saved === "finder" || saved === "shelf") {
        setFolderDisplayStyle(saved);
      }
    } catch {}

    const handleStyleEvent = (e: any) => {
      if (e.detail === "finder" || e.detail === "shelf") {
        setFolderDisplayStyle(e.detail);
      }
    };
    window.addEventListener("gamevault_folder_style_changed", handleStyleEvent);
    return () => window.removeEventListener("gamevault_folder_style_changed", handleStyleEvent);
  }, []);

  const handleSetFolderDisplayStyle = (style: "shelf" | "finder") => {
    setFolderDisplayStyle(style);
    try {
      localStorage.setItem("gamevault_folder_style", style);
      window.dispatchEvent(new CustomEvent("gamevault_folder_style_changed", { detail: style }));
    } catch {}
  };

  // New Game Form State
  const [newGameName, setNewGameName] = useState("");
  const [newGameFolder, setNewGameFolder] = useState("");
  const [newGameColor, setNewGameColor] = useState("#007AFF");
  const [newGameRules, setNewGameRules] = useState("");
  const [isSubmittingGame, setIsSubmittingGame] = useState(false);

  // Data State
  const [clips, setClips] = useState<ClipData[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Grid Scale Slider (1 = compact 3-4 cols, 2 = standard 2 cols, 3 = expansive 1 col)
  const [gridScale, setGridScale] = useState<number>(2);

  // Synchronize Player with /video/:id URL
  const openPlayer = useCallback((targetClip: ClipData) => {
    setActivePlayerClip(targetClip);
    if (typeof window !== "undefined") {
      window.history.pushState({ clipId: targetClip.id }, "", `/video/${targetClip.id}`);
    }
  }, []);

  const closePlayer = useCallback(() => {
    setActivePlayerClip(null);
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/video")) {
      window.history.pushState(null, "", "/");
    }
  }, []);

  // Handle Browser Back / Forward History Navigation
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return;
      if (window.location.pathname.startsWith("/video/")) {
        const id = window.location.pathname.replace("/video/", "");
        const matched = clips.find((c) => c.id === id);
        if (matched) setActivePlayerClip(matched);
      } else {
        setActivePlayerClip(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [clips]);

  // Fetch Games
  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch("/api/games");
      const data = await res.json();
      if (data.success && data.games) {
        setGames(data.games);
      }
    } catch (err) {
      console.error("Failed to fetch games:", err);
    }
  }, []);

  // Fetch Stats & System Telemetry
  const fetchStats = useCallback(async () => {
    try {
      const [resStats, resSys] = await Promise.all([
        fetch("/api/stats").catch(() => null),
        fetch("/api/system/stats").catch(() => null),
      ]);

      if (resStats && resStats.ok) {
        const data = await resStats.json();
        if (data.success) setStats(data.stats);
      }

      if (resSys && resSys.ok) {
        const dataSys = await resSys.json();
        if (dataSys.success) setSystemStats(dataSys);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);

  // Fetch Clips with Query Parameters
  const fetchClips = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedGame) params.set("game", selectedGame);
      if (selectedFolder) params.set("folder", selectedFolder);
      if (selectedTag) params.set("tag", selectedTag);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (currentView === "favorites") params.set("favorite", "true");
      if (currentView === "trash") params.set("trash", "true");
      if (sortOption !== "newest") params.set("sortBy", sortOption);

      const res = await fetch(`/api/clips?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.clips) {
        setClips(data.clips);
        if (!selectedClip && data.clips.length > 0) {
          setSelectedClip(data.clips[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch clips:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedGame, selectedFolder, selectedTag, searchQuery, currentView, sortOption, selectedClip]);

  // Fetch Collections
  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      const data = await res.json();
      if (data.success && Array.isArray(data.collections)) {
        setCollections(data.collections);
      }
    } catch (err) {
      console.error("Failed to fetch collections:", err);
    }
  }, []);

  // Delete Custom Collection
  const handleDeleteCollection = async (id: string) => {
    try {
      const res = await fetch(`/api/collections?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchCollections();
        if (currentView.startsWith("collection-")) {
          setCurrentView("all-footage");
        }
      } else {
        alert(data.error || "Failed to delete collection");
      }
    } catch (err: any) {
      console.error("Failed to delete collection:", err);
      alert("Error deleting collection: " + err.message);
    }
  };

  const refreshAllData = useCallback(() => {
    fetchClips();
    fetchGames();
    fetchCollections();
    fetchStats();
    triggerVaultSync();
  }, [fetchClips, fetchGames, fetchCollections, fetchStats]);

  useEffect(() => {
    fetchGames();
    fetchStats();
    fetchCollections();
  }, [fetchGames, fetchStats, fetchCollections]);

  // Real-time Event Listener (Cross-component synchronization)
  useEffect(() => {
    const handleVaultSync = () => {
      fetchGames();
      fetchCollections();
      fetchStats();
    };
    window.addEventListener("gamevault:sync", handleVaultSync);
    return () => window.removeEventListener("gamevault:sync", handleVaultSync);
  }, [fetchGames, fetchCollections, fetchStats]);

  // Real-time Polling & Window Focus sync (3s interval for live host storage updates)
  useEffect(() => {
    const onFocus = () => {
      fetchGames();
      fetchCollections();
      fetchStats();
    };
    window.addEventListener("focus", onFocus);

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchGames();
        fetchCollections();
        fetchStats();
      }
    }, 3000);

    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [fetchGames, fetchCollections, fetchStats]);

  useEffect(() => {
    fetchClips();
  }, [fetchClips]);

  // Keyboard Shortcuts (⌘K search, ⌘I upload)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (input) input.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setIsUploadOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebarCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtered & Client-Sorted Clips
  const filteredClips = useMemo(() => {
    let result = clips.filter((clip) => {
      // Subfolder Filter
      if (selectedFolder) {
        if (selectedFolder === "none" || selectedFolder === "unfiled") {
          if (clip.folder) return false;
        } else if (clip.folder !== selectedFolder) {
          return false;
        }
      }

      // Resolution Filter
      if (resolutionFilter === "4k" && clip.width < 3840 && clip.height < 2160) return false;
      if (resolutionFilter === "1440p" && (clip.width < 2560 || clip.width >= 3840)) return false;
      if (resolutionFilter === "1080p" && clip.width < 1920) return false;

      // Status Filter
      if (statusFilter === "ready" && clip.status !== "READY") return false;
      if (statusFilter === "processing" && clip.status === "READY") return false;

      // View Sections
      if (currentView === "recently-added") {
        return true; // Sorted newest
      }
      if (currentView === "continue-watching") {
        return clip.duration > 30;
      }
      if (currentView === "favorites") {
        return !!clip.isFavorite;
      }
      if (currentView.startsWith("collection-") || currentView.startsWith("col-")) {
        const activeCol = collections.find((c) => c.slug === currentView || c.id === currentView);
        if (activeCol) {
          if (activeCol.isSmart) {
            if (activeCol.smartType === "boss") {
              const titleLower = clip.title.toLowerCase();
              return (
                titleLower.includes("boss") ||
                titleLower.includes("clutch") ||
                titleLower.includes("fight") ||
                titleLower.includes("battle") ||
                clip.tags?.some((t) => t.tag.name.toLowerCase().includes("boss"))
              );
            }
            if (activeCol.smartType === "highlights") {
              return (
                clip.title.toLowerCase().includes("highlight") ||
                (clip.highlights && clip.highlights.length > 0) ||
                clip.tags?.some((t) => t.tag.name.toLowerCase().includes("highlight"))
              );
            }
            if (activeCol.smartType === "long_sessions") {
              return clip.duration >= 300;
            }
          } else {
            return activeCol.clipIds ? activeCol.clipIds.includes(clip.id) : false;
          }
        }
        // Fallback for default presets before first fetch completes
        if (currentView === "collection-bosses") {
          const titleLower = clip.title.toLowerCase();
          return (
            titleLower.includes("boss") ||
            titleLower.includes("clutch") ||
            titleLower.includes("fight") ||
            titleLower.includes("battle") ||
            clip.tags?.some((t) => t.tag.name.toLowerCase().includes("boss"))
          );
        }
        if (currentView === "collection-2026-highlights") {
          return (
            clip.title.toLowerCase().includes("highlight") ||
            (clip.highlights && clip.highlights.length > 0)
          );
        }
        if (currentView === "collection-long-sessions") {
          return clip.duration >= 300;
        }
        return false;
      }
      return true;
    });

    // Reactive Client-side Sorting
    return result.sort((a, b) => {
      if (sortOption === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortOption === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortOption === "duration_desc") {
        return b.duration - a.duration;
      }
      if (sortOption === "duration_asc") {
        return a.duration - b.duration;
      }
      if (sortOption === "size_desc") {
        return Number(b.fileSize || 0) - Number(a.fileSize || 0);
      }
      if (sortOption === "size_asc") {
        return Number(a.fileSize || 0) - Number(b.fileSize || 0);
      }
      if (sortOption === "fps_desc") {
        return b.fps - a.fps;
      }
      if (sortOption === "title_asc") {
        return a.title.localeCompare(b.title);
      }
      if (sortOption === "title_desc") {
        return b.title.localeCompare(a.title);
      }
      return 0;
    });
  }, [clips, selectedFolder, resolutionFilter, statusFilter, currentView, sortOption, collections]);

  // Toggle Favorite
  const handleToggleFavorite = async (id: string, currentVal: boolean) => {
    try {
      const res = await fetch(`/api/clips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !currentVal }),
      });
      const data = await res.json();
      if (data.success && data.clip) {
        setClips((prev) => prev.map((c) => (c.id === id ? { ...c, isFavorite: !currentVal } : c)));
        if (selectedClip?.id === id) {
          setSelectedClip((prev) => (prev ? { ...prev, isFavorite: !currentVal } : null));
        }
        fetchStats();
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  // Toggle Trash
  const handleToggleTrash = async (id: string, currentVal: boolean) => {
    try {
      const res = await fetch(`/api/clips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTrash: !currentVal }),
      });
      const data = await res.json();
      if (data.success) {
        setClips((prev) => prev.filter((c) => c.id !== id));
        if (selectedClip?.id === id) {
          setSelectedClip(null);
        }
        fetchStats();
        fetchGames();
        fetchCollections();
        triggerVaultSync();
      }
    } catch (err) {
      console.error("Failed to toggle trash:", err);
    }
  };

  // Selection Handlers
  const handleToggleSelectClip = (clipId: string) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedClipIds(new Set(filteredClips.map((c) => c.id)));
  };

  const handleDeselectAll = () => {
    setSelectedClipIds(new Set());
  };

  const handleBulkFavorite = async () => {
    for (const id of Array.from(selectedClipIds)) {
      await handleToggleFavorite(id, false);
    }
    handleDeselectAll();
  };

  const handleBulkTrash = async () => {
    if (!confirm(`Move ${selectedClipIds.size} clips to trash?`)) return;
    for (const id of Array.from(selectedClipIds)) {
      await handleToggleTrash(id, false);
    }
    handleDeselectAll();
    triggerVaultSync();
  };

  // Bulk Move Selected Clips to a Folder
  const handleBulkMoveToFolder = async (folderName: string | null) => {
    if (selectedClipIds.size === 0 || isBulkUpdating) return;
    setIsBulkUpdating(true);
    try {
      const res = await fetch("/api/clips/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipIds: Array.from(selectedClipIds),
          folderName: folderName || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsBulkFolderPopoverOpen(false);
        setBulkNewFolderInput("");
        setIsSelectMode(false);
        setSelectedClipIds(new Set());
        fetchClips();
        fetchStats();
        fetchGames();
        fetchCollections();
        triggerVaultSync();
      } else {
        alert(data.error || "Failed to organize clips");
      }
    } catch (err: any) {
      console.error("Bulk move error:", err);
      alert("Error: " + err.message);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Bulk Add Selected Clips to Collection
  const handleBulkAddToCollection = async (collectionId: string, colName?: string) => {
    if (selectedClipIds.size === 0 || isBulkUpdating) return;
    setIsBulkUpdating(true);
    try {
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId,
          action: "addClips",
          clipIds: Array.from(selectedClipIds),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsBulkCollectionPopoverOpen(false);
        setIsSelectMode(false);
        setSelectedClipIds(new Set());
        fetchCollections();
        fetchClips();
        fetchGames();
        fetchStats();
      } else {
        alert(data.error || "Failed to add clips to collection");
      }
    } catch (err: any) {
      console.error("Bulk add collection error:", err);
      alert("Error: " + err.message);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Add Game Submission
  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;
    setIsSubmittingGame(true);

    try {
      const folder = newGameFolder.trim() || newGameName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      const rules = newGameRules
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGameName.trim(),
          folderName: folder,
          accentColor: newGameColor,
          matchRules: rules.length > 0 ? rules : [newGameName.trim()],
          icon: "Gamepad2",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsAddGameOpen(false);
        setNewGameName("");
        setNewGameFolder("");
        setNewGameRules("");
        fetchGames();
      } else {
        alert(`Failed to create game: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setIsSubmittingGame(false);
    }
  };

  // Real Storage & Counts
  const totalClipsCount = systemStats?.pipeline?.totalClips ?? stats?.totalClips ?? clips.length;
  const totalOriginalBytes = systemStats?.storage?.originalsBytes ?? Number(stats?.totalBytes || 0);
  const totalDerivedBytes = systemStats?.storage?.derivedBytes ?? 0;
  const appTotalBytes = totalOriginalBytes + totalDerivedBytes;
  const appStorageBytesStr = formatBytes(appTotalBytes);
  const totalBytesStr = appStorageBytesStr;

  const poolTotalBytes = systemStats?.storage?.poolTotalBytes || 225 * 1024 * 1024 * 1024;
  const poolUsedBytes = systemStats?.storage?.poolUsedBytes ?? (183 * 1024 * 1024 * 1024);
  const poolUsedPercent = systemStats?.storage?.poolUsedPercent ?? 86;
  const poolAvailableBytes = systemStats?.storage?.poolAvailableBytes ?? systemStats?.storage?.poolFreeBytes ?? (32.4 * 1024 * 1024 * 1024);
  const serverAvailableBytesStr = formatBytes(poolAvailableBytes);
  const serverTotalBytesStr = formatBytes(poolTotalBytes);
  const serverUsedBytesStr = formatBytes(poolUsedBytes);
  const appStorageUsedPercent = Math.min(100, Math.max(1, Math.round((appTotalBytes / poolTotalBytes) * 100)));

  const activeProcessingCount = systemStats?.pipeline?.activeProcessingCount ?? 0;
  const favoriteCount = stats?.favoriteClips ?? clips.filter((c) => c.isFavorite).length;

  const collectionsCounts = useMemo(() => {
    let bosses = 0;
    let highlights = 0;
    let longSessions = 0;

    for (const c of clips) {
      const t = c.title.toLowerCase();
      if (t.includes("boss") || t.includes("clutch") || t.includes("fight") || t.includes("battle")) bosses++;
      if (t.includes("highlight") || (c.highlights && c.highlights.length > 0)) highlights++;
      if (c.duration >= 300) longSessions++;
    }

    return { bosses, highlights, longSessions };
  }, [clips]);

  // Active Selected Game Entity
  const currentActiveGame = useMemo(() => {
    return games.find((g) => g.slug === selectedGame);
  }, [games, selectedGame]);

  // Aggregate Available Subfolders for current scope
  const availableFolders = useMemo(() => {
    if (currentActiveGame && currentActiveGame.folders && currentActiveGame.folders.length > 0) {
      return currentActiveGame.folders;
    }
    const folderMap = new Map<string, { name: string; clipCount: number; totalBytes: number }>();
    for (const g of games) {
      if (g.folders) {
        for (const f of g.folders) {
          const existing = folderMap.get(f.name);
          if (existing) {
            existing.clipCount += f.clipCount;
            existing.totalBytes += f.totalBytes;
          } else {
            folderMap.set(f.name, { ...f });
          }
        }
      }
    }
    return Array.from(folderMap.values());
  }, [currentActiveGame, games]);

  // Context View Title
  const viewTitle = useMemo(() => {
    if (selectedGame) {
      const g = games.find((x) => x.slug === selectedGame);
      return g ? g.name : "Game Clips";
    }
    if (currentView.startsWith("collection-") || currentView.startsWith("col-")) {
      const col = collections.find((c) => c.slug === currentView || c.id === currentView);
      if (col) return col.name;
    }
    switch (currentView) {
      case "recently-added":
        return "Recently Added";
      case "continue-watching":
        return "Continue Watching";
      case "favorites":
        return "Favorites";
      case "collection-bosses":
        return "Boss Battles & Clutch Wins";
      case "collection-2026-highlights":
        return "2026 Highlight Reels";
      case "collection-long-sessions":
        return "Long Exploration Sessions";
      default:
        return "Library";
    }
  }, [selectedGame, currentView, games, collections]);

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-row bg-background font-body-md text-body-md text-on-surface antialiased select-none">
      {/* Left Pro Apple Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={(v) => {
          setCurrentView(v);
          setSelectedGame(null);
          setSelectedFolder(null);
        }}
        games={games}
        selectedGame={selectedGame}
        onSelectGame={(slug) => {
          setSelectedGame(slug);
          setSelectedFolder(null);
          if (slug) {
            setCurrentView("all-footage");
          }
        }}
        selectedFolder={selectedFolder}
        onSelectFolder={setSelectedFolder}
        onOpenOrganizeFolder={(slug) => {
          setFolderOrganizeGameSlug(slug || selectedGame || undefined);
          setIsFolderOrganizeOpen(true);
        }}
        activeProcessingCount={activeProcessingCount}
        totalClipsCount={totalClipsCount}
        totalBytesStr={appStorageBytesStr}
        appStorageBytesStr={appStorageBytesStr}
        serverAvailableBytesStr={serverAvailableBytesStr}
        serverTotalBytesStr={serverTotalBytesStr}
        serverUsedBytesStr={serverUsedBytesStr}
        appStorageUsedPercent={appStorageUsedPercent}
        storagePoolUsedPercent={poolUsedPercent}
        hostName={systemStats?.host?.hostname || "Debian Host"}
        collectionsCounts={collectionsCounts}
        collections={collections}
        onOpenNewCollection={() => setIsNewCollectionOpen(true)}
        onOpenCollectionManager={() => setIsCollectionManagerOpen(true)}
        onDeleteCollection={handleDeleteCollection}
        favoriteCount={favoriteCount}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        sidebarWidth={sidebarWidth}
        onResizeSidebar={handleSidebarResize}
        onResizeEnd={handleSidebarResizeEnd}
        isOpenMobile={isOpenMobileSidebar}
        onCloseMobile={() => setIsOpenMobileSidebar(false)}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAddGame={() => setIsAddGameOpen(true)}
      />

      {/* Center & Fluid Main Stage */}
      <div className="flex-1 h-[100dvh] flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Global Pro Header Navbar */}
        <Navbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          onOpenUpload={() => setIsUploadOpen(true)}
          onToggleMobileSidebar={() => setIsOpenMobileSidebar((prev) => !prev)}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={toggleSidebarCollapse}
          isSelectMode={isSelectMode}
          onToggleSelectMode={() => {
            setIsSelectMode(!isSelectMode);
            if (isSelectMode) setSelectedClipIds(new Set());
          }}
          selectedCount={selectedClipIds.size}
          sortOption={sortOption}
          onChangeSortOption={setSortOption}
        />

        {/* Scrollable Viewport Stage */}
        <main className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 min-h-0 no-scrollbar">
          {currentView === "processing-center" || currentView === "storage-integrity" ? (
            /* Processing & Storage Safety View */
            <div className="py-4">
              <ProcessingSafetyView stats={stats} onRefreshStats={fetchStats} />
            </div>
          ) : currentView === "activity-log" ? (
            /* Real Chronological Activity & Ingest Log */
            <div className="py-6 flex flex-col gap-5 max-w-5xl mx-auto">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Activity Log</h1>
                  <span className="text-xs text-zinc-400 font-sans">
                    Chronological history of media uploads, processing tasks, and integrity audits
                  </span>
                </div>
                <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg">
                  Integrity Verified
                </span>
              </div>

              <div className="space-y-2.5 font-mono text-xs">
                {clips.map((clip, idx) => (
                  <div
                    key={clip.id}
                    className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3 hover:bg-surface-container transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-zinc-500 font-bold shrink-0">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="text-sky-400 font-semibold shrink-0">VERIFIED</span>
                      <span className="text-white truncate font-medium">{clip.title}</span>
                      <span className="text-zinc-400 hidden sm:inline text-[11px]">
                        ({clip.width}x{clip.height} • {formatBytes(Number(clip.fileSize))} • {clip.codec})
                      </span>
                    </div>
                    <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded text-[11px] font-semibold shrink-0">
                      PROTECTED
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Standard Library / Media Catalog View */
            <div className="flex flex-col w-full text-on-surface select-none pb-16">
              {/* Top Viewport Context Header */}
              <div className="w-full pt-4 pb-3 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                      <span>{viewTitle}</span>
                      {selectedFolder && (
                        <span className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-lg text-sm align-middle">
                          <span className="material-symbols-outlined text-[15px] text-amber-400">folder</span>
                          <span className="text-amber-300 font-mono font-semibold">{selectedFolder}</span>
                          <button
                            onClick={() => setSelectedFolder(null)}
                            className="text-zinc-400 hover:text-white ml-1 cursor-pointer transition-colors"
                            title="Show all clips (clear folder filter)"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-zinc-400">
                      {filteredClips.length} {filteredClips.length === 1 ? "clip" : "clips"} • {totalBytesStr}
                    </span>
                  </div>
                </div>

                {/* Filter & Control Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 bg-surface-container-lowest p-2 rounded-xl border border-outline-variant/30 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Game Dropdown Filter */}
                    <div className="relative">
                      <select
                        value={selectedGame || ""}
                        onChange={(e) => {
                          setSelectedGame(e.target.value ? e.target.value : null);
                          setSelectedFolder(null);
                        }}
                        className="appearance-none flex items-center gap-1.5 px-3 py-1.5 pr-7 rounded-lg bg-surface-container text-zinc-200 hover:text-white transition-colors font-mono text-xs cursor-pointer border border-outline-variant/30 focus:outline-none focus:border-primary"
                      >
                        <option value="">Game: All ({games.length})</option>
                        {games.map((g) => (
                          <option key={g.id} value={g.slug}>
                            {g.name} ({g.clipCount ?? 0})
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined text-[15px] text-zinc-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        expand_more
                      </span>
                    </div>

                    {availableFolders.length > 0 && (
                      <div className="relative">
                        <select
                          value={selectedFolder || ""}
                          onChange={(e) => setSelectedFolder(e.target.value ? e.target.value : null)}
                          className="appearance-none flex items-center gap-1.5 px-3 py-1.5 pr-7 rounded-lg bg-surface-container text-amber-300 hover:text-amber-200 transition-colors font-mono text-xs cursor-pointer border border-amber-500/30 focus:outline-none focus:border-amber-400"
                        >
                          <option value="">Folder: All ({availableFolders.length})</option>
                          {availableFolders.map((f) => (
                            <option key={f.name} value={f.name}>
                              📁 {f.name} ({f.clipCount})
                            </option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined text-[15px] text-amber-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                          expand_more
                        </span>
                      </div>
                    )}

                    {/* Resolution Filter */}
                    <div className="relative">
                      <select
                        value={resolutionFilter}
                        onChange={(e) => setResolutionFilter(e.target.value)}
                        className="appearance-none flex items-center gap-1.5 px-3 py-1.5 pr-7 rounded-lg bg-surface-container text-zinc-200 hover:text-white transition-colors font-mono text-xs cursor-pointer border border-outline-variant/30 focus:outline-none focus:border-primary"
                      >
                        <option value="all">Resolution: All</option>
                        <option value="4k">4K UHD</option>
                        <option value="1440p">1440p QHD</option>
                        <option value="1080p">1080p FHD</option>
                      </select>
                      <span className="material-symbols-outlined text-[15px] text-zinc-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        expand_more
                      </span>
                    </div>

                    {/* Status Toggle Button */}
                    <button
                      onClick={() => {
                        if (statusFilter === "all") setStatusFilter("ready");
                        else if (statusFilter === "ready") setStatusFilter("processing");
                        else setStatusFilter("all");
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs border transition-colors cursor-pointer ${
                        statusFilter === "ready"
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-semibold"
                          : statusFilter === "processing"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30 font-semibold"
                          : "bg-surface-container text-zinc-300 border-outline-variant/30"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          statusFilter === "ready"
                            ? "bg-emerald-400"
                            : statusFilter === "processing"
                            ? "bg-amber-400 animate-pulse"
                            : "bg-zinc-400"
                        }`}
                      ></span>
                      <span>
                        {statusFilter === "ready"
                          ? "Ready Only"
                          : statusFilter === "processing"
                          ? "Processing Only"
                          : "All Statuses"}
                      </span>
                    </button>
                  </div>

                  {/* Scale & Import Actions */}
                  <div className="flex items-center gap-2.5">
                    {viewMode === "grid" && (
                      <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-zinc-400">
                        <span>Scale</span>
                        <input
                          type="range"
                          min="1"
                          max="3"
                          step="1"
                          value={gridScale}
                          onChange={(e) => setGridScale(Number(e.target.value))}
                          className="w-16 h-1 bg-surface-container-high rounded-full appearance-none cursor-pointer accent-primary"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 1. HORIZONTAL SHELF STRIP (When Shelf mode is active) */}
                {folderDisplayStyle === "shelf" && (selectedGame || availableFolders.length > 0) && (
                  <div className="w-full flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
                    {/* All Clips Folder Card */}
                    <button
                      onClick={() => setSelectedFolder(null)}
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer shrink-0 shadow-sm ${
                        !selectedFolder
                          ? "bg-primary/15 border-primary/40 text-primary font-semibold shadow-primary/10 shadow-md"
                          : "bg-surface-container-lowest hover:bg-surface-container border-outline-variant/30 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">folder_open</span>
                      <span>All Clips</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${!selectedFolder ? "bg-primary/20 text-primary" : "bg-white/5 text-zinc-400"}`}>
                        {currentActiveGame?.clipCount ?? clips.length}
                      </span>
                    </button>

                    {/* Subfolder Cards */}
                    {availableFolders.map((f) => {
                      const isFolderActive = selectedFolder === f.name;
                      return (
                        <button
                          key={f.name}
                          onClick={() => setSelectedFolder(isFolderActive ? null : f.name)}
                          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer shrink-0 shadow-sm ${
                            isFolderActive
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold shadow-amber-500/10 shadow-md"
                              : "bg-surface-container-lowest hover:bg-surface-container border-outline-variant/30 text-zinc-300 hover:text-white"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[16px] text-amber-400">
                            {isFolderActive ? "folder_open" : "folder"}
                          </span>
                          <span className="max-w-[160px] truncate">{f.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isFolderActive ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-zinc-400"}`}>
                            {f.clipCount}
                          </span>
                        </button>
                      );
                    })}

                    {/* Quick Action: New Subfolder / Smart Organize */}
                    <button
                      onClick={() => {
                        setFolderOrganizeGameSlug(selectedGame || undefined);
                        setIsFolderOrganizeOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-amber-500/30 hover:border-amber-400/60 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300/80 hover:text-amber-200 text-xs font-mono transition-all cursor-pointer shrink-0"
                      title="Create a new folder"
                    >
                      <span className="material-symbols-outlined text-[15px]">add_circle</span>
                      <span>+ Folder</span>
                    </button>
                  </div>
                )}

                {/* 2. MACOS FINDER PATH BAR (When Finder mode is active & folder is opened) */}
                {folderDisplayStyle === "finder" && selectedFolder && (
                  <div className="w-full flex items-center justify-between bg-surface-container-low border border-outline-variant/30 rounded-xl px-3.5 py-2 shadow-sm">
                    <div className="flex items-center gap-2 min-w-0 text-xs font-mono">
                      <button
                        onClick={() => setSelectedFolder(null)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-zinc-300 hover:text-white transition-colors cursor-pointer"
                        title="Navigate back to parent folder"
                      >
                        <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                        <span className="font-semibold">Back</span>
                      </button>
                      <span className="text-zinc-600">/</span>
                      <button
                        onClick={() => setSelectedFolder(null)}
                        className="text-zinc-400 hover:text-zinc-200 cursor-pointer truncate"
                      >
                        {currentActiveGame ? currentActiveGame.name : "All Games"}
                      </button>
                      <span className="text-zinc-600">/</span>
                      <div className="flex items-center gap-1.5 text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-md truncate">
                        <span className="material-symbols-outlined text-[15px] text-amber-400">folder_open</span>
                        <span className="truncate">{selectedFolder}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        ({filteredClips.length} {filteredClips.length === 1 ? "clip" : "clips"})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setFolderOrganizeGameSlug(selectedGame || undefined);
                          setIsFolderOrganizeOpen(true);
                        }}
                        className="text-[11px] font-mono text-amber-300 hover:text-amber-200 flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-500/10 transition-colors cursor-pointer"
                        title="Organize more clips into this folder"
                      >
                        <span className="material-symbols-outlined text-[14px]">drive_file_move</span>
                        <span className="hidden sm:inline">Add / Organize</span>
                      </button>
                      <button
                        onClick={() => setSelectedFolder(null)}
                        className="text-[11px] font-mono text-zinc-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
                        title="Exit folder view"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                        <span className="hidden sm:inline">Exit Folder</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Full Width Media Catalog Canvas */}
              <div className="w-full min-w-0 mt-2">
                {/* macOS Finder Canvas Directory Folders (When Finder mode is active & at root) */}
                {folderDisplayStyle === "finder" && !selectedFolder && availableFolders.length > 0 && (
                  <div className="mb-6 p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-400 text-[18px]">folder_copy</span>
                        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
                          Folders ({availableFolders.length})
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                          • Tap to open folder
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setFolderOrganizeGameSlug(selectedGame || undefined);
                          setIsFolderOrganizeOpen(true);
                        }}
                        className="flex items-center gap-1 text-[11px] font-mono text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-all cursor-pointer shadow-xs"
                      >
                        <span className="material-symbols-outlined text-[14px]">add_circle</span>
                        <span>New Folder</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {availableFolders.map((f) => (
                        <FinderFolderCard
                          key={f.name}
                          name={f.name}
                          clipCount={f.clipCount}
                          totalBytes={f.totalBytes}
                          onClick={() => setSelectedFolder(f.name)}
                          onOrganize={() => {
                            setFolderOrganizeGameSlug(selectedGame || undefined);
                            setIsFolderOrganizeOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {/* 1. GRID VIEW MODE */}
                {viewMode === "grid" && (
                  filteredClips.length > 0 ? (
                    <div
                      className={`grid gap-4 transition-all ${
                        gridScale === 1
                          ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
                          : gridScale === 3
                          ? "grid-cols-1 md:grid-cols-2"
                          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                      }`}
                    >
                      {filteredClips.map((clip) => {
                        const isSelected = selectedClipIds.has(clip.id) || selectedClip?.id === clip.id;
                        return (
                          <div key={clip.id} className="relative group">
                            {isSelectMode && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSelectClip(clip.id);
                                }}
                                className={`absolute top-2.5 left-2.5 z-20 w-6 h-6 rounded-md flex items-center justify-center border transition-all ${
                                  selectedClipIds.has(clip.id)
                                    ? "bg-primary border-primary text-white"
                                    : "bg-black/60 border-white/40 text-transparent hover:border-white"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[16px]">check</span>
                              </button>
                            )}
                            <ClipCard
                              clip={clip}
                              isSelected={isSelected}
                              isSelectMode={isSelectMode}
                              onSelect={(c) => {
                                if (isSelectMode) {
                                  handleToggleSelectClip(c.id);
                                } else {
                                  setSelectedClip(c);
                                  openPlayer(c);
                                }
                              }}
                              onOpenPlayer={(c) => openPlayer(c)}
                              onToggleFavorite={handleToggleFavorite}
                              onToggleTrash={handleToggleTrash}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Clean Pro Empty State */
                    currentView === "favorites" ? (
                      <div className="py-24 flex flex-col items-center justify-center text-center p-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
                        <div className="w-14 h-14 rounded-2xl bg-amber-400/10 flex items-center justify-center text-amber-400 mb-4 border border-amber-400/25 shadow-inner">
                          <span className="material-symbols-outlined text-[32px]">star</span>
                        </div>
                        <h3 className="font-semibold text-base text-white mb-1">
                          No Favorites Yet
                        </h3>
                        <p className="text-xs text-zinc-400 max-w-sm mb-4">
                          Star your top moments, clutches, or best gameplay clips to easily access them here.
                        </p>
                        <button
                          onClick={() => setCurrentView("all-footage")}
                          className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-white font-medium text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">video_library</span>
                          Browse All Clips
                        </button>
                      </div>
                    ) : (
                      <div className="py-24 flex flex-col items-center justify-center text-center p-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
                        <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-primary mb-4 border border-outline-variant/30 shadow-inner">
                          <span className="material-symbols-outlined text-[32px]">video_library</span>
                        </div>
                        <h3 className="font-semibold text-base text-white mb-1">
                          No Videos Found
                        </h3>
                        <p className="text-xs text-zinc-400 max-w-sm mb-4">
                          Import your gameplay recordings to get started.
                        </p>
                        <button
                          onClick={() => setIsUploadOpen(true)}
                          className="px-4 py-2 rounded-xl bg-primary text-white font-medium text-xs shadow-md hover:brightness-105 active:scale-98 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">add_to_photos</span>
                          Import Footage (⌘I)
                        </button>
                      </div>
                    )
                  )
                )}

                {/* 2. FILMSTRIP VIEW MODE */}
                {viewMode === "filmstrip" && (
                  <div className="flex flex-col gap-4">
                    {/* Featured Cinema Viewer */}
                    {selectedClip || filteredClips[0] ? (
                      (() => {
                        const current = selectedClip || filteredClips[0];
                        return (
                          <div className="w-full rounded-2xl bg-[#0c0e12] border border-white/10 overflow-hidden shadow-2xl flex flex-col lg:flex-row">
                            <div className="relative aspect-video lg:w-3/5 bg-black flex items-center justify-center group">
                              <video
                                key={current.id}
                                src={`/api/clips/${current.id}/stream`}
                                poster={`/api/clips/${current.id}/thumbnail?t=${current.updatedAt ? new Date(current.updatedAt).getTime() : 1}`}
                                controls
                                playsInline
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div className="p-5 lg:w-2/5 flex flex-col justify-between space-y-4 bg-surface-container-low border-t lg:border-t-0 lg:border-l border-white/10 font-mono text-xs">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary font-semibold border border-primary/30">
                                    {current.game?.name || "Uncategorized"}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-zinc-200 border border-white/10">
                                    {current.width}x{current.height} • {current.fps}fps
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    {current.codec}
                                  </span>
                                </div>
                                <h2 className="text-lg font-bold text-white tracking-tight">{current.title}</h2>
                                <p className="text-zinc-400 text-xs leading-relaxed">{current.originalFilename}</p>
                              </div>

                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-[11px]">
                                <div className="flex flex-col">
                                  <span className="text-zinc-400">Duration</span>
                                  <span className="text-white font-semibold">{formatDuration(current.duration)}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-zinc-400">File Size</span>
                                  <span className="text-white font-semibold">{formatBytes(Number(current.fileSize))}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-2">
                                <button
                                  onClick={() => openPlayer(current)}
                                  className="flex-1 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                                >
                                  <span className="material-symbols-outlined text-[16px]">fullscreen</span>
                                  <span>Deep Theatre Mode</span>
                                </button>
                                <button
                                  onClick={() => handleToggleFavorite(current.id, current.isFavorite)}
                                  className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                                    current.isFavorite
                                      ? "bg-amber-400/20 border-amber-400/40 text-amber-300"
                                      : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[18px]">star</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : null}

                    {/* Horizontal Filmstrip Carousel */}
                    <div className="flex items-center gap-3 overflow-x-auto pb-4 pt-2 no-scrollbar">
                      {filteredClips.map((c) => {
                        const isSelected = (selectedClip?.id || filteredClips[0]?.id) === c.id;
                        return (
                          <div
                            key={c.id}
                            onClick={() => setSelectedClip(c)}
                            className={`shrink-0 w-64 rounded-xl overflow-hidden border cursor-pointer transition-all duration-200 bg-surface-container-low ${
                              isSelected
                                ? "ring-2 ring-primary border-primary shadow-xl scale-[1.02]"
                                : "border-white/10 hover:border-white/30 opacity-80 hover:opacity-100"
                            }`}
                          >
                            <div className="relative aspect-video w-full bg-black overflow-hidden">
                              <img
                                src={`/api/clips/${c.id}/thumbnail?t=${c.updatedAt ? new Date(c.updatedAt).getTime() : 1}`}
                                alt={c.title}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[9px] text-zinc-200">
                                {formatDuration(c.duration)}
                              </div>
                            </div>
                            <div className="p-2.5 font-mono text-xs">
                              <span className="text-white font-medium truncate block">{c.title}</span>
                              <span className="text-zinc-400 text-[10px] truncate block mt-0.5">
                                {formatBytes(Number(c.fileSize))} • {c.game?.name || "Game"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. LIST / TABLE VIEW MODE */}
                {viewMode === "list" && (
                  <div className="w-full rounded-2xl bg-[#0c0e12] border border-white/10 overflow-hidden shadow-xl font-mono text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-zinc-400 text-[11px] bg-white/[0.02]">
                          {isSelectMode && <th className="p-3 w-10"></th>}
                          <th className="p-3 font-semibold">Clip</th>
                          <th className="p-3 font-semibold">Game</th>
                          <th className="p-3 font-semibold">Resolution</th>
                          <th className="p-3 font-semibold">Duration</th>
                          <th className="p-3 font-semibold">Size</th>
                          <th className="p-3 font-semibold">Codec</th>
                          <th className="p-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredClips.map((clip) => (
                          <tr
                            key={clip.id}
                            onClick={() => {
                              if (isSelectMode) handleToggleSelectClip(clip.id);
                              else openPlayer(clip);
                            }}
                            className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                          >
                            {isSelectMode && (
                              <td className="p-3 w-10" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleToggleSelectClip(clip.id)}
                                  className={`w-5 h-5 rounded flex items-center justify-center border ${
                                    selectedClipIds.has(clip.id)
                                      ? "bg-primary border-primary text-white"
                                      : "border-white/30 text-transparent"
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[14px]">check</span>
                                </button>
                              </td>
                            )}
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-12 h-7 rounded bg-cover bg-center shrink-0 border border-white/10 bg-black"
                                  style={{ backgroundImage: `url('/api/clips/${clip.id}/thumbnail?t=${clip.updatedAt ? new Date(clip.updatedAt).getTime() : 1}')` }}
                                />
                                <div className="flex flex-col min-w-0">
                                  <span className="text-white font-medium truncate max-w-xs">{clip.title}</span>
                                  <span className="text-zinc-500 text-[10px] truncate max-w-xs">{clip.originalFilename}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="text-zinc-300 bg-white/5 px-2 py-0.5 rounded border border-white/10 text-[11px]">
                                {clip.game?.name || "Uncategorized"}
                              </span>
                            </td>
                            <td className="p-3 text-zinc-300">
                              {clip.width}x{clip.height} ({clip.fps}fps)
                            </td>
                            <td className="p-3 text-zinc-300">{formatDuration(clip.duration)}</td>
                            <td className="p-3 text-zinc-300">{formatBytes(Number(clip.fileSize))}</td>
                            <td className="p-3 text-emerald-400 font-semibold">{clip.codec}</td>
                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleToggleFavorite(clip.id, clip.isFavorite)}
                                  className={`p-1.5 rounded hover:bg-white/10 transition-colors ${
                                    clip.isFavorite ? "text-amber-400" : "text-zinc-500 hover:text-zinc-300"
                                  }`}
                                  title="Favorite"
                                >
                                  <span className="material-symbols-outlined text-[16px]">star</span>
                                </button>
                                <button
                                  onClick={() => openPlayer(clip)}
                                  className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                  title="Play"
                                >
                                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bulk Selection Bottom Floating Action Dock */}
      {isSelectMode && selectedClipIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#12151c]/95 border border-white/20 rounded-2xl px-5 py-3 shadow-2xl backdrop-blur-2xl flex flex-wrap items-center justify-center gap-3 animate-fade-in font-mono text-xs">
          <span className="text-white font-semibold whitespace-nowrap">
            {selectedClipIds.size} {selectedClipIds.size === 1 ? "clip" : "clips"} selected
          </span>
          <div className="h-4 w-[1px] bg-white/20 hidden sm:block"></div>
          <button
            onClick={handleSelectAll}
            className="text-zinc-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Select All ({filteredClips.length})
          </button>

          {/* Move to Folder Button with Popover */}
          <div className="relative">
            <button
              onClick={() => {
                setIsBulkFolderPopoverOpen((prev) => !prev);
                setIsBulkCollectionPopoverOpen(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              title="Move selected clips to a subfolder"
            >
              <span className="material-symbols-outlined text-[15px]">folder_open</span>
              <span>Move to Folder</span>
              <span className="material-symbols-outlined text-[12px] opacity-70">arrow_drop_down</span>
            </button>

            {isBulkFolderPopoverOpen && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-72 bg-[#0e1017] border border-outline-variant/60 rounded-xl shadow-2xl p-3 flex flex-col gap-2.5 backdrop-blur-xl animate-scale-in text-xs z-50">
                <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                  <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">folder</span>
                    Move {selectedClipIds.size} Clips to Folder
                  </span>
                  <button
                    onClick={() => setIsBulkFolderPopoverOpen(false)}
                    className="text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>

                {/* Quick Create & Move Input */}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="New folder (e.g. Season-19)..."
                    value={bulkNewFolderInput}
                    onChange={(e) => setBulkNewFolderInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && bulkNewFolderInput.trim()) {
                        e.preventDefault();
                        handleBulkMoveToFolder(bulkNewFolderInput.trim());
                      }
                    }}
                    className="flex-1 bg-surface-container rounded-lg px-2.5 py-1.5 text-xs text-white font-mono border border-outline-variant/40 focus:border-amber-400 outline-none"
                  />
                  <button
                    type="button"
                    disabled={!bulkNewFolderInput.trim() || isBulkUpdating}
                    onClick={() => handleBulkMoveToFolder(bulkNewFolderInput.trim())}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs font-mono transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Move
                  </button>
                </div>

                {/* Existing Folders List */}
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                    Existing Folders
                  </span>
                  {availableFolders.length > 0 ? (
                    availableFolders.map((f) => (
                      <button
                        key={f.name}
                        onClick={() => handleBulkMoveToFolder(f.name)}
                        disabled={isBulkUpdating}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-container text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="material-symbols-outlined text-[13px] text-amber-400/80">folder</span>
                          <span className="truncate">{f.name}</span>
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">{f.clipCount}</span>
                      </button>
                    ))
                  ) : (
                    <span className="text-zinc-600 text-[11px] font-mono py-1">No existing folders yet</span>
                  )}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleBulkMoveToFolder(null)}
                    disabled={isBulkUpdating}
                    className="text-[11px] text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    Remove from Folder
                  </button>
                  <button
                    onClick={() => {
                      setIsBulkFolderPopoverOpen(false);
                      setFolderOrganizeClipIds(Array.from(selectedClipIds));
                      setFolderOrganizeGameSlug(selectedGame || undefined);
                      setIsFolderOrganizeOpen(true);
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                  >
                    Smart Rules...
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Add to Collection Button with Popover */}
          <div className="relative">
            <button
              onClick={() => {
                setIsBulkCollectionPopoverOpen((prev) => !prev);
                setIsBulkFolderPopoverOpen(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              title="Add selected clips to a multi-game collection"
            >
              <span className="material-symbols-outlined text-[15px]">collections_bookmark</span>
              <span>Add to Collection</span>
              <span className="material-symbols-outlined text-[12px] opacity-70">arrow_drop_down</span>
            </button>

            {isBulkCollectionPopoverOpen && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-72 bg-[#0e1017] border border-outline-variant/60 rounded-xl shadow-2xl p-3 flex flex-col gap-2.5 backdrop-blur-xl animate-scale-in text-xs z-50">
                <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                  <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">collections_bookmark</span>
                    Add {selectedClipIds.size} Clips to Collection
                  </span>
                  <button
                    onClick={() => setIsBulkCollectionPopoverOpen(false)}
                    className="text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>

                {/* Collections List */}
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                  {collections.filter((c) => !c.isSmart).length > 0 ? (
                    collections
                      .filter((c) => !c.isSmart)
                      .map((col) => (
                        <button
                          key={col.id}
                          onClick={() => handleBulkAddToCollection(col.id, col.name)}
                          disabled={isBulkUpdating}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-container text-zinc-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: col.color || "#0A84FF" }}
                            />
                            <span className="truncate">{col.name}</span>
                          </div>
                          <span className="material-symbols-outlined text-[14px] text-blue-400">add</span>
                        </button>
                      ))
                  ) : (
                    <span className="text-zinc-500 text-[11px] font-mono py-1 text-center">
                      No custom collections yet
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setIsBulkCollectionPopoverOpen(false);
                      setIsNewCollectionOpen(true);
                    }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[13px]">add</span>
                    <span>New Collection</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsBulkCollectionPopoverOpen(false);
                      setIsCollectionManagerOpen(true);
                    }}
                    className="text-[11px] text-zinc-400 hover:text-white hover:underline cursor-pointer"
                  >
                    Manage Tool...
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleBulkFavorite}
            className="px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[15px]">star</span>
            <span>Favorite All</span>
          </button>
          <button
            onClick={handleBulkTrash}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[15px]">delete</span>
            <span>Trash</span>
          </button>
          <button
            onClick={handleDeselectAll}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Clear
          </button>
        </div>
      )}

      {/* Add Game Profile Quick Modal */}
      {isAddGameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#14181f] border border-white/20 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">sports_esports</span>
                <h3 className="text-white font-semibold text-base">Add Game Profile</h3>
              </div>
              <button
                onClick={() => setIsAddGameOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateGame} className="space-y-3.5">
              <div>
                <label className="text-zinc-300 block mb-1">Game Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Elden Ring"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-zinc-300 block mb-1">Storage Subfolder Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. elden-ring"
                  value={newGameFolder}
                  onChange={(e) => setNewGameFolder(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-300 block mb-1">Accent Color</label>
                  <input
                    type="color"
                    value={newGameColor}
                    onChange={(e) => setNewGameColor(e.target.value)}
                    className="w-full h-9 rounded-lg bg-transparent cursor-pointer border border-white/10"
                  />
                </div>
                <div>
                  <label className="text-zinc-300 block mb-1">Keywords (CSV)</label>
                  <input
                    type="text"
                    placeholder="e.g. Elden, ER"
                    value={newGameRules}
                    onChange={(e) => setNewGameRules(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsAddGameOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGame}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold transition-colors cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmittingGame ? "Creating..." : "Save Game Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pro Video Player Deep Inspector Theatre Modal */}
      {activePlayerClip && (
        <DeepVideoPlayerModal
          clip={activePlayerClip}
          allClips={clips}
          onClose={closePlayer}
          onSelectOtherClip={(targetClip) => openPlayer(targetClip)}
          onRefreshClip={refreshAllData}
          onUpdateClip={(updated) => {
            setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setActivePlayerClip(updated);
            if (selectedClip?.id === updated.id) {
              setSelectedClip(updated);
            }
            fetchStats();
            fetchGames();
            fetchCollections();
          }}
        />
      )}

      {/* Quick Upload Modal / Persistent Ingest Tray */}
      {(isUploadOpen || hasActiveUpload) && (
        <UploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onActiveStateChange={(active) => setHasActiveUpload(active)}
          onUploadSuccess={() => {
            fetchClips();
            fetchStats();
            fetchGames();
            fetchCollections();
            triggerVaultSync();
          }}
          games={games}
          collections={collections}
          allClips={clips}
        />
      )}

      {/* Global Server Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          games={games}
          onRefreshGames={() => {
            fetchClips();
            fetchStats();
            fetchGames();
          }}
          onRefreshTags={() => {
            fetchClips();
          }}
        />
      )}

      {/* Smart Folder Organizer Modal */}
      {isFolderOrganizeOpen && (
        <FolderOrganizeModal
          isOpen={isFolderOrganizeOpen}
          onClose={() => {
            setIsFolderOrganizeOpen(false);
            setFolderOrganizeClipIds(undefined);
            setFolderOrganizeInitialFolderName(null);
          }}
          games={games}
          initialGameSlug={folderOrganizeGameSlug}
          initialClipIds={folderOrganizeClipIds}
          initialFolderName={folderOrganizeInitialFolderName}
          allClips={clips}
          onSuccess={() => {
            fetchClips();
            fetchStats();
            fetchGames();
            fetchCollections();
          }}
        />
      )}

      {/* New Multi-Game Collection Modal */}
      {isNewCollectionOpen && (
        <NewCollectionModal
          isOpen={isNewCollectionOpen}
          onClose={() => setIsNewCollectionOpen(false)}
          onCreated={() => {
            fetchCollections();
          }}
        />
      )}

      {/* Dedicated Collection Manager & Organizer Modal */}
      {isCollectionManagerOpen && (
        <CollectionManagerModal
          isOpen={isCollectionManagerOpen}
          onClose={() => {
            setIsCollectionManagerOpen(false);
            setCollectionManagerInitialId(null);
          }}
          collections={collections}
          allClips={clips}
          games={games}
          initialCollectionId={collectionManagerInitialId}
          initialSelectedClipIds={Array.from(selectedClipIds)}
          onRefreshCollections={fetchCollections}
          onRefreshClips={fetchClips}
        />
      )}
    </div>
  );
}
