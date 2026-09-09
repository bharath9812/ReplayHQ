"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { CollectionInfo, GameInfo } from "./Sidebar";
import { ClipData } from "./ClipCard";

interface CollectionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: CollectionInfo[];
  allClips: ClipData[];
  games: GameInfo[];
  initialCollectionId?: string | null;
  initialSelectedClipIds?: string[];
  onRefreshCollections: () => void;
  onRefreshClips: () => void;
}

const COLOR_PRESETS = [
  "#0A84FF", // Apple Blue
  "#30D158", // Apple Green
  "#FF9F0A", // Apple Orange
  "#BF5AF2", // Apple Purple
  "#FF375F", // Apple Pink
  "#64D2FF", // Apple Cyan
  "#FFD60A", // Apple Yellow
  "#AC8E68", // Desert Sand
];

const ICON_PRESETS = [
  { id: "collections_bookmark", label: "Album" },
  { id: "star", label: "Starred" },
  { id: "military_tech", label: "Tournament" },
  { id: "trophy", label: "Trophy" },
  { id: "local_fire_department", label: "Fire" },
  { id: "auto_awesome", label: "Magic" },
  { id: "sports_esports", label: "Gaming" },
  { id: "movie", label: "Reel" },
  { id: "flag", label: "Milestone" },
  { id: "bolt", label: "Clutch" },
];

function formatBytes(bytes: number = 0): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(seconds: number = 0): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CollectionManagerModal({
  isOpen,
  onClose,
  collections,
  allClips,
  games,
  initialCollectionId,
  initialSelectedClipIds,
  onRefreshCollections,
  onRefreshClips,
}: CollectionManagerModalProps) {
  // Selected Collection
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");

  // Tabs for the active collection: "included" (manage current) vs "add" (browse and pick footage)
  const [activeTab, setActiveTab] = useState<"included" | "add">("included");

  // Inline New Collection Form Toggle
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [newColColor, setNewColColor] = useState(COLOR_PRESETS[0]);
  const [newColIcon, setNewColIcon] = useState(ICON_PRESETS[0].id);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Edit details of current collection
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Add Videos Tab Filters
  const [searchFilter, setSearchFilter] = useState("");
  const [gameFilter, setGameFilter] = useState<string>("all");
  const [notInCollectionOnly, setNotInCollectionOnly] = useState(false);
  const [selectedClipIdsToAdd, setSelectedClipIdsToAdd] = useState<Set<string>>(
    initialSelectedClipIds && initialSelectedClipIds.length > 0
      ? new Set(initialSelectedClipIds)
      : new Set()
  );

  // Loading indicator for clip updates
  const [isUpdatingClips, setIsUpdatingClips] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Available tags across all clips
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    allClips.forEach((c) => c.tags?.forEach((t) => set.add(t.tag.name)));
    return Array.from(set).sort();
  }, [allClips]);

  // Set initial selected collection
  useEffect(() => {
    if (initialCollectionId) {
      setSelectedCollectionId(initialCollectionId);
    } else if (collections.length > 0 && !selectedCollectionId) {
      // Prefer custom collection if any, else first smart
      const firstCustom = collections.find((c) => !c.isSmart);
      setSelectedCollectionId(firstCustom ? firstCustom.id : collections[0].id);
    }
  }, [initialCollectionId, collections, selectedCollectionId]);

  // If initialSelectedClipIds was provided, switch straight to "add" tab
  useEffect(() => {
    if (initialSelectedClipIds && initialSelectedClipIds.length > 0) {
      setActiveTab("add");
      setSelectedClipIdsToAdd(new Set(initialSelectedClipIds));
    }
  }, [initialSelectedClipIds]);

  // Active Collection Object
  const currentCollection = useMemo(() => {
    return collections.find((c) => c.id === selectedCollectionId || c.slug === selectedCollectionId) || null;
  }, [collections, selectedCollectionId]);

  // Sync edit form fields when active collection changes
  useEffect(() => {
    if (currentCollection) {
      setEditName(currentCollection.name);
      setEditDesc(currentCollection.description || "");
      setEditColor(currentCollection.color || "#0A84FF");
      setEditIcon(currentCollection.icon || "collections_bookmark");
    }
  }, [currentCollection]);

  // Flash action message
  const showFeedback = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  // Clips currently in this collection
  const includedClips = useMemo(() => {
    if (!currentCollection) return [];
    if (currentCollection.isSmart) {
      if (currentCollection.smartType === "boss") {
        return allClips.filter((c) => {
          const t = c.title.toLowerCase();
          return (
            t.includes("boss") ||
            t.includes("clutch") ||
            t.includes("fight") ||
            t.includes("battle") ||
            c.tags?.some((tg) => tg.tag.name.toLowerCase().includes("boss"))
          );
        });
      }
      if (currentCollection.smartType === "highlights") {
        return allClips.filter((c) => {
          const t = c.title.toLowerCase();
          return (
            t.includes("highlight") ||
            (c.highlights && c.highlights.length > 0) ||
            c.tags?.some((tg) => tg.tag.name.toLowerCase().includes("highlight"))
          );
        });
      }
      if (currentCollection.smartType === "long_sessions") {
        return allClips.filter((c) => c.duration >= 300);
      }
    }
    const idSet = new Set(currentCollection.clipIds || []);
    return allClips.filter((c) => idSet.has(c.id));
  }, [currentCollection, allClips]);

  // Filtered list of clips in the "Add Videos" tab
  const addClipsCandidates = useMemo(() => {
    const inColIdSet = new Set(currentCollection?.clipIds || []);
    return allClips.filter((clip) => {
      if (clip.isTrash) return false;
      if (notInCollectionOnly && inColIdSet.has(clip.id)) return false;
      if (gameFilter !== "all" && clip.game?.id !== gameFilter && clip.gameId !== gameFilter) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const matchesTitle = clip.title.toLowerCase().includes(q);
        const matchesFile = clip.originalFilename.toLowerCase().includes(q);
        const matchesTags = clip.tags?.some((t) => t.tag.name.toLowerCase().includes(q));
        if (!matchesTitle && !matchesFile && !matchesTags) return false;
      }
      return true;
    });
  }, [allClips, currentCollection, notInCollectionOnly, gameFilter, searchFilter]);

  // Create New Collection
  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim() || isSubmittingNew) return;
    setIsSubmittingNew(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newColName.trim(),
          description: newColDesc.trim(),
          color: newColColor,
          icon: newColIcon,
          clipIds: Array.from(selectedClipIdsToAdd),
        }),
      });
      const data = await res.json();
      if (data.success && data.collection) {
        showFeedback(`Created collection "${data.collection.name}"!`);
        setIsCreatingNew(false);
        setNewColName("");
        setNewColDesc("");
        setSelectedCollectionId(data.collection.id);
        onRefreshCollections();
        onRefreshClips();
      } else {
        alert(data.error || "Failed to create collection");
      }
    } catch (err: any) {
      console.error("Create collection error:", err);
      alert("Error creating collection: " + err.message);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Save Collection Metadata Changes
  const handleSaveDetails = async () => {
    if (!currentCollection || currentCollection.isSmart || isSavingDetails) return;
    setIsSavingDetails(true);
    try {
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: currentCollection.id,
          action: "updateDetails",
          name: editName.trim(),
          description: editDesc.trim(),
          color: editColor,
          icon: editIcon,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback("Collection details updated!");
        onRefreshCollections();
      } else {
        alert(data.error || "Failed to update details");
      }
    } catch (err: any) {
      console.error("Save details error:", err);
      alert("Error: " + err.message);
    } finally {
      setIsSavingDetails(false);
    }
  };

  // Delete Collection
  const handleDeleteCollection = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the collection "${name}"? Clips will NOT be deleted.`)) return;
    try {
      const res = await fetch(`/api/collections?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showFeedback(`Deleted collection "${name}"`);
        onRefreshCollections();
        const remaining = collections.filter((c) => c.id !== id);
        if (remaining.length > 0) {
          setSelectedCollectionId(remaining[0].id);
        }
      } else {
        alert(data.error || "Failed to delete collection");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Add or Remove a Single Clip
  const handleToggleSingleClip = async (clipId: string, isCurrentlyIn: boolean) => {
    if (!currentCollection || currentCollection.isSmart || isUpdatingClips) return;
    setIsUpdatingClips(true);
    try {
      const action = isCurrentlyIn ? "removeClip" : "addClip";
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: currentCollection.id,
          action,
          clipId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onRefreshCollections();
        onRefreshClips();
      } else {
        alert(data.error || "Failed to update collection");
      }
    } catch (err: any) {
      console.error("Toggle clip error:", err);
    } finally {
      setIsUpdatingClips(false);
    }
  };

  // Bulk Add Selected Clips to Collection
  const handleAddSelectedClips = async () => {
    if (!currentCollection || currentCollection.isSmart || selectedClipIdsToAdd.size === 0 || isUpdatingClips) return;
    setIsUpdatingClips(true);
    try {
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: currentCollection.id,
          action: "addClips",
          clipIds: Array.from(selectedClipIdsToAdd),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(`Added ${selectedClipIdsToAdd.size} clips to "${currentCollection.name}"!`);
        setSelectedClipIdsToAdd(new Set());
        onRefreshCollections();
        onRefreshClips();
      } else {
        alert(data.error || "Failed to add clips");
      }
    } catch (err: any) {
      console.error("Add selected clips error:", err);
      alert("Error adding clips: " + err.message);
    } finally {
      setIsUpdatingClips(false);
    }
  };

  // Bulk Remove Selected Clips from Collection
  const handleRemoveAllIncluded = async () => {
    if (!currentCollection || currentCollection.isSmart || includedClips.length === 0 || isUpdatingClips) return;
    if (!confirm(`Remove all ${includedClips.length} clips from "${currentCollection.name}"?`)) return;
    setIsUpdatingClips(true);
    try {
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: currentCollection.id,
          action: "setClips",
          clipIds: [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(`Cleared all clips from "${currentCollection.name}"`);
        onRefreshCollections();
        onRefreshClips();
      } else {
        alert(data.error || "Failed to clear clips");
      }
    } catch (err: any) {
      console.error("Clear clips error:", err);
    } finally {
      setIsUpdatingClips(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 select-none animate-fade-in overflow-hidden overscroll-none">
      <div className="w-full max-w-5xl h-[92dvh] rounded-2xl bg-[#0e1017] border border-outline-variant/40 shadow-2xl flex flex-col text-on-surface overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/30 bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-sm">
              <span className="material-symbols-outlined text-[20px]">collections_bookmark</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm text-white">Collections Manager</h2>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/25">
                  Cross-Category Playlists
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono">
                Organize videos from any game into curated reels, clutch compilations, or custom albums
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {actionSuccessMsg && (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg animate-fade-in flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                <span>{actionSuccessMsg}</span>
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Modal Body: Two-Column Master / Detail */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left Column: Collections List & Quick Creator */}
          <div className="w-full md:w-80 border-r border-outline-variant/20 bg-surface-container-lowest/70 flex flex-col shrink-0 overflow-hidden">
            {/* Header & Create Button */}
            <div className="p-3 border-b border-outline-variant/20 flex items-center justify-between gap-2 shrink-0">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
                Collections ({collections.length})
              </span>
              <button
                onClick={() => setIsCreatingNew((prev) => !prev)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-400 text-xs font-mono font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {isCreatingNew ? "close" : "add"}
                </span>
                <span>{isCreatingNew ? "Cancel" : "New Collection"}</span>
              </button>
            </div>

            {/* Inline New Collection Creator Form */}
            {isCreatingNew && (
              <form onSubmit={handleCreateCollection} className="p-3 border-b border-outline-variant/30 bg-surface-container-low space-y-2.5 shrink-0 animate-scale-in">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400 text-[18px]">folder_special</span>
                  <span className="text-xs font-mono font-semibold text-white">Create Multi-Game Collection</span>
                </div>

                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Collection name (e.g. Clutch Wins)..."
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container text-xs text-white font-mono border border-outline-variant/40 focus:border-blue-400 outline-none"
                />

                <input
                  type="text"
                  placeholder="Optional description..."
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container text-xs text-zinc-300 font-mono border border-outline-variant/40 focus:border-blue-400 outline-none"
                />

                {/* Color Swatches */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColColor(c)}
                      className={`w-5 h-5 rounded-full shrink-0 transition-transform ${
                        newColColor === c ? "scale-125 ring-2 ring-white" : "opacity-70 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  {selectedClipIdsToAdd.size > 0 && (
                    <span className="text-[10px] text-blue-300 font-mono">
                      Includes {selectedClipIdsToAdd.size} selected clip{selectedClipIdsToAdd.size > 1 ? "s" : ""}
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={!newColName.trim() || isSubmittingNew}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-mono text-xs font-semibold disabled:opacity-40 transition-all cursor-pointer shadow-sm"
                  >
                    {isSubmittingNew ? "Saving..." : "Create Collection"}
                  </button>
                </div>
              </form>
            )}

            {/* Collections List Scrollable */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* Built-in Smart Presets */}
              <div className="px-2 pt-1 pb-1">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Smart Presets (Auto-Curated)
                </span>
              </div>
              {collections
                .filter((c) => c.isSmart)
                .map((col) => {
                  const isSelected = selectedCollectionId === col.id || selectedCollectionId === col.slug;
                  return (
                    <button
                      key={col.id}
                      onClick={() => {
                        setSelectedCollectionId(col.id);
                        setActiveTab("included");
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-mono transition-all text-left cursor-pointer border ${
                        isSelected
                          ? "bg-blue-500/15 border-blue-500/30 text-white shadow-xs font-semibold"
                          : "border-transparent text-zinc-300 hover:bg-white/[0.03] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: col.color || "#0A84FF" }}
                        />
                        <div className="min-w-0">
                          <span className="truncate block">{col.name}</span>
                          <span className="text-[10px] text-zinc-500 font-sans block truncate">
                            Smart Heuristic Rule
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/5 text-zinc-400 font-mono shrink-0 ml-1">
                        {col.clipCount ?? 0}
                      </span>
                    </button>
                  );
                })}

              {/* Custom Collections */}
              <div className="px-2 pt-3 pb-1">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Custom User Collections
                </span>
              </div>
              {collections.filter((c) => !c.isSmart).length > 0 ? (
                collections
                  .filter((c) => !c.isSmart)
                  .map((col) => {
                    const isSelected = selectedCollectionId === col.id;
                    return (
                      <div
                        key={col.id}
                        onClick={() => setSelectedCollectionId(col.id)}
                        className={`group w-full flex items-center justify-between p-2 rounded-xl text-xs font-mono transition-all text-left cursor-pointer border ${
                          isSelected
                            ? "bg-blue-500/15 border-blue-500/30 text-white shadow-xs font-semibold"
                            : "border-transparent text-zinc-300 hover:bg-white/[0.03] hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: col.color || "#0A84FF" }}
                          />
                          <div className="min-w-0">
                            <span className="truncate block">{col.name}</span>
                            <span className="text-[10px] text-zinc-500 font-sans block truncate">
                              {col.totalBytes ? formatBytes(col.totalBytes) : "0 B"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/5 text-zinc-400 font-mono">
                            {col.clipCount ?? 0}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCollection(col.id, col.name);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-rose-400 transition-all cursor-pointer"
                            title="Delete collection"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="p-3 text-center text-zinc-600 text-[11px] font-mono italic">
                  No custom collections yet. Click "+ New Collection" above to start one!
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Selected Collection Details & Video Management */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
            {currentCollection ? (
              <>
                {/* Collection Meta Top Bar */}
                <div className="p-4 border-b border-outline-variant/20 bg-surface-container-lowest/50 shrink-0 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
                        style={{ backgroundColor: currentCollection.color || "#0A84FF" }}
                      >
                        <span className="material-symbols-outlined text-[24px]">
                          {currentCollection.icon || "collections_bookmark"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white truncate font-mono">
                            {currentCollection.name}
                          </h3>
                          {currentCollection.isSmart && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Smart Heuristic
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 font-sans line-clamp-1">
                          {currentCollection.description || "Multi-game collection playlist"}
                        </p>
                      </div>
                    </div>

                    {/* Quick Stats Badges */}
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <div className="px-3 py-1 rounded-lg bg-surface-container border border-outline-variant/30 text-zinc-300">
                        <span className="text-white font-bold">{includedClips.length}</span> clips
                      </div>
                      <div className="px-3 py-1 rounded-lg bg-surface-container border border-outline-variant/30 text-zinc-300">
                        <span className="text-white font-bold">
                          {formatBytes(includedClips.reduce((acc, c) => acc + Number(c.fileSize || 0), 0))}
                        </span>
                      </div>
                      {!currentCollection.isSmart && (
                        <button
                          onClick={() => handleDeleteCollection(currentCollection.id, currentCollection.name)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 transition-colors cursor-pointer"
                          title="Delete collection"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Editable Details Form for Custom Collection */}
                  {!currentCollection.isSmart && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-outline-variant/20 text-xs font-mono">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Collection Name..."
                        className="px-2.5 py-1 rounded-lg bg-surface-container text-white border border-outline-variant/30 focus:border-blue-400 outline-none max-w-[200px]"
                      />
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Short description..."
                        className="flex-1 min-w-[200px] px-2.5 py-1 rounded-lg bg-surface-container text-zinc-300 border border-outline-variant/30 focus:border-blue-400 outline-none"
                      />
                      <div className="flex items-center gap-1">
                        {COLOR_PRESETS.slice(0, 5).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-4 h-4 rounded-full transition-transform ${
                              editColor === c ? "scale-125 ring-2 ring-white" : "opacity-60 hover:opacity-100"
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      {(editName !== currentCollection.name || editDesc !== (currentCollection.description || "") || editColor !== currentCollection.color) && (
                        <button
                          onClick={handleSaveDetails}
                          disabled={isSavingDetails}
                          className="px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                        >
                          {isSavingDetails ? "Saving..." : "Save Details"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Section Tabs Switcher */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex rounded-xl bg-surface-container p-0.5 border border-outline-variant/30 font-mono text-xs">
                      <button
                        onClick={() => setActiveTab("included")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          activeTab === "included"
                            ? "bg-blue-500 text-white font-semibold shadow-xs"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">video_library</span>
                        <span>Included Videos ({includedClips.length})</span>
                      </button>
                      <button
                        onClick={() => setActiveTab("add")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          activeTab === "add"
                            ? "bg-blue-500 text-white font-semibold shadow-xs"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">add_circle</span>
                        <span>Add Videos / Catalog Picker</span>
                      </button>
                    </div>

                    {activeTab === "included" && !currentCollection.isSmart && includedClips.length > 0 && (
                      <button
                        onClick={handleRemoveAllIncluded}
                        className="text-xs font-mono text-rose-400 hover:text-rose-300 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">clear_all</span>
                        <span>Clear All Clips</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* TAB 1: INCLUDED VIDEOS IN THIS COLLECTION */}
                {activeTab === "included" && (
                  <div className="flex-1 overflow-y-auto p-4">
                    {includedClips.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {includedClips.map((clip) => (
                          <div
                            key={clip.id}
                            className="group relative rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-blue-500/40 p-2.5 flex flex-col gap-2 transition-all shadow-sm"
                          >
                            {/* Thumbnail & Quick Specs */}
                            <div className="relative aspect-video rounded-lg overflow-hidden bg-black flex items-center justify-center">
                              <img
                                src={`/api/clips/${clip.id}/thumbnail`}
                                alt={clip.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23121316'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2387929a' font-family='sans-serif' font-size='16'%3EGame Footage%3C/text%3E%3C/svg%3E";
                                }}
                              />
                              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 font-mono text-[10px] text-white">
                                {formatDuration(clip.duration)}
                              </span>
                              {clip.game && (
                                <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/70 border border-white/10 font-mono text-[10px] text-zinc-200">
                                  {clip.game.name}
                                </span>
                              )}
                            </div>

                            {/* Title & Size */}
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-xs text-white truncate font-mono" title={clip.title}>
                                {clip.title}
                              </span>
                              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-0.5">
                                <span>{clip.folder ? `📁 ${clip.folder}` : "Unfiled"}</span>
                                <span>{formatBytes(Number(clip.fileSize || 0))}</span>
                              </div>
                            </div>

                            {/* Action Button: Remove from Collection */}
                            {!currentCollection.isSmart ? (
                              <button
                                onClick={() => handleToggleSingleClip(clip.id, true)}
                                disabled={isUpdatingClips}
                                className="w-full py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-outline-variant/20 hover:border-rose-500/30 text-[11px] font-mono transition-colors cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                              >
                                <span className="material-symbols-outlined text-[13px]">remove_circle</span>
                                <span>Remove from Collection</span>
                              </button>
                            ) : (
                              <span className="text-center text-[10px] font-mono text-zinc-500 italic">
                                Auto-included by smart rule
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-blue-400 mb-3 border border-outline-variant/30">
                          <span className="material-symbols-outlined text-[24px]">movie</span>
                        </div>
                        <h4 className="font-semibold text-sm text-white mb-1">
                          No Videos In This Collection
                        </h4>
                        <p className="text-xs text-zinc-400 max-w-sm mb-4 font-sans">
                          This collection doesn't have any clips yet. Browse the vault in the "Add Videos" tab to populate it!
                        </p>
                        <button
                          onClick={() => setActiveTab("add")}
                          className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-mono text-xs font-semibold transition-all cursor-pointer shadow-md"
                        >
                          Browse &amp; Add Videos
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: ADD VIDEOS TO COLLECTION (BROWSE & MANUAL PICKER) */}
                {activeTab === "add" && (
                  <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    {/* Filter & Bulk Action Bar */}
                    <div className="p-3 border-b border-outline-variant/20 bg-surface-container-low/60 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[160px]">
                          <input
                            type="text"
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            placeholder="Filter clips by title or tag..."
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container text-xs text-white font-mono border border-outline-variant/30 focus:border-blue-400 outline-none"
                          />
                          <span className="material-symbols-outlined text-zinc-400 text-[16px] absolute left-2.5 top-1/2 -translate-y-1/2">
                            search
                          </span>
                        </div>

                        {/* Game Category Filter */}
                        <select
                          value={gameFilter}
                          onChange={(e) => setGameFilter(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-surface-container text-xs text-zinc-200 font-mono border border-outline-variant/30 focus:border-blue-400 outline-none cursor-pointer"
                        >
                          <option value="all">All Games ({games.length})</option>
                          {games.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>

                        {/* Filter Unincluded Only */}
                        <button
                          type="button"
                          onClick={() => setNotInCollectionOnly(!notInCollectionOnly)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors cursor-pointer ${
                            notInCollectionOnly
                              ? "bg-blue-500/20 text-blue-300 border-blue-500/40 font-semibold"
                              : "bg-surface-container text-zinc-400 border-outline-variant/30 hover:text-white"
                          }`}
                        >
                          Not in Collection Yet
                        </button>
                      </div>

                      {/* Bulk Add Action */}
                      <div className="flex items-center gap-2">
                        {selectedClipIdsToAdd.size > 0 && !currentCollection.isSmart && (
                          <button
                            onClick={handleAddSelectedClips}
                            disabled={isUpdatingClips}
                            className="px-3.5 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-mono text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-40"
                          >
                            <span className="material-symbols-outlined text-[15px]">add_circle</span>
                            <span>Add {selectedClipIdsToAdd.size} Selected to Collection</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Clips Catalog Grid for Picking */}
                    <div className="flex-1 overflow-y-auto p-4">
                      {addClipsCandidates.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {addClipsCandidates.map((clip) => {
                            const isAlreadyIn = currentCollection.clipIds?.includes(clip.id);
                            const isChecked = selectedClipIdsToAdd.has(clip.id);

                            return (
                              <div
                                key={clip.id}
                                className={`group rounded-xl border p-2.5 flex flex-col gap-2 transition-all ${
                                  isAlreadyIn
                                    ? "bg-blue-500/5 border-blue-500/25"
                                    : isChecked
                                    ? "bg-surface-container border-blue-400"
                                    : "bg-surface-container-low border-outline-variant/30 hover:border-outline-variant/60"
                                }`}
                              >
                                {/* Thumbnail Header */}
                                <div className="relative aspect-video rounded-lg overflow-hidden bg-black flex items-center justify-center">
                                  <img
                                    src={`/api/clips/${clip.id}/thumbnail`}
                                    alt={clip.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src =
                                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23121316'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2387929a' font-family='sans-serif' font-size='16'%3EGame Footage%3C/text%3E%3C/svg%3E";
                                    }}
                                  />

                                  {/* Selection Checkbox (for bulk add) */}
                                  {!isAlreadyIn && !currentCollection.isSmart && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = new Set(selectedClipIdsToAdd);
                                        if (next.has(clip.id)) next.delete(clip.id);
                                        else next.add(clip.id);
                                        setSelectedClipIdsToAdd(next);
                                      }}
                                      className={`absolute top-1.5 left-1.5 w-6 h-6 rounded flex items-center justify-center border transition-all ${
                                        isChecked
                                          ? "bg-blue-500 border-blue-500 text-white"
                                          : "bg-black/60 border-white/40 text-transparent hover:border-white"
                                      }`}
                                    >
                                      <span className="material-symbols-outlined text-[16px]">check</span>
                                    </button>
                                  )}

                                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 font-mono text-[10px] text-white">
                                    {formatDuration(clip.duration)}
                                  </span>
                                  {clip.game && (
                                    <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/70 border border-white/10 font-mono text-[10px] text-zinc-200">
                                      {clip.game.name}
                                    </span>
                                  )}
                                </div>

                                {/* Title & Info */}
                                <div className="flex flex-col min-w-0">
                                  <span className="font-semibold text-xs text-white truncate font-mono" title={clip.title}>
                                    {clip.title}
                                  </span>
                                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-0.5">
                                    <span>{clip.folder ? `📁 ${clip.folder}` : "Unfiled"}</span>
                                    <span>{formatBytes(Number(clip.fileSize || 0))}</span>
                                  </div>
                                </div>

                                {/* Toggle Action Button */}
                                {!currentCollection.isSmart ? (
                                  isAlreadyIn ? (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSingleClip(clip.id, true)}
                                      disabled={isUpdatingClips}
                                      className="w-full py-1.5 rounded-lg bg-emerald-500/15 hover:bg-rose-500/20 text-emerald-300 hover:text-rose-300 border border-emerald-500/30 hover:border-rose-500/30 text-xs font-mono font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      <span className="material-symbols-outlined text-[15px]">check</span>
                                      <span>In Collection (Click to Remove)</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSingleClip(clip.id, false)}
                                      disabled={isUpdatingClips}
                                      className="w-full py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-xs font-mono font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      <span className="material-symbols-outlined text-[15px]">add</span>
                                      <span>+ Add to Collection</span>
                                    </button>
                                  )
                                ) : (
                                  <span className="text-center text-[10px] font-mono text-zinc-500 italic">
                                    Smart collection rule managed
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8">
                          <span className="material-symbols-outlined text-zinc-600 text-3xl mb-2">search_off</span>
                          <span className="text-xs font-mono text-zinc-400">No matching videos found with current filters</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <span className="material-symbols-outlined text-zinc-600 text-4xl mb-2">collections_bookmark</span>
                <span className="text-sm font-mono text-zinc-400">Select or create a collection on the left</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
