"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { GameInfo } from "./Sidebar";
import { ClipData } from "./ClipCard";

interface FolderOrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  games: GameInfo[];
  initialGameSlug?: string | null;
  initialFolderName?: string | null;
  initialClipIds?: string[];
  allClips?: ClipData[];
  onSuccess: () => void;
}

export function FolderOrganizeModal({
  isOpen,
  onClose,
  games,
  initialGameSlug,
  initialFolderName,
  initialClipIds,
  allClips = [],
  onSuccess,
}: FolderOrganizeModalProps) {
  // Target Game
  const [selectedGameId, setSelectedGameId] = useState<string>("");

  // Target Folder
  const [targetFolderName, setTargetFolderName] = useState<string>("");
  const [isCustomFolder, setIsCustomFolder] = useState<boolean>(false);
  const [customFolderInput, setCustomFolderInput] = useState<string>("");

  // Criteria States
  const [criteriaType, setCriteriaType] = useState<"date" | "tag" | "query" | "manual" | "all">(
    initialClipIds && initialClipIds.length > 0 ? "manual" : "date"
  );
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(
    initialClipIds && initialClipIds.length > 0 ? new Set(initialClipIds) : new Set()
  );

  // Preview & Submit States
  const [previewClips, setPreviewClips] = useState<any[]>([]);
  const [previewCount, setPreviewCount] = useState<number>(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Initialize selected game, folder, and clip IDs
  useEffect(() => {
    if (initialGameSlug) {
      const match = games.find((g) => g.slug === initialGameSlug);
      if (match) {
        setSelectedGameId(match.id);
      }
    } else if (initialClipIds && initialClipIds.length > 0 && allClips.length > 0) {
      const firstClip = allClips.find((c) => initialClipIds.includes(c.id));
      if (firstClip && firstClip.game?.id) {
        setSelectedGameId(firstClip.game.id);
      }
    } else if (games.length > 0 && !selectedGameId) {
      setSelectedGameId(games[0].id);
    }

    if (initialFolderName) {
      setTargetFolderName(initialFolderName);
      setIsCustomFolder(false);
    }

    if (initialClipIds && initialClipIds.length > 0) {
      setCriteriaType("manual");
      setSelectedClipIds(new Set(initialClipIds));
    }
  }, [initialGameSlug, initialFolderName, initialClipIds, games, allClips]);

  // Selected Game Object & Available Folders
  const currentGame = useMemo(() => {
    return games.find((g) => g.id === selectedGameId) || null;
  }, [games, selectedGameId]);

  const existingFolders = useMemo(() => {
    return currentGame?.folders || [];
  }, [currentGame]);

  // Available tags across all clips
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    allClips.forEach((c) => {
      c.tags?.forEach((t) => tagSet.add(t.tag.name));
    });
    return Array.from(tagSet).sort();
  }, [allClips]);

  // Available clips for current game for manual picking
  const gameClips = useMemo(() => {
    if (!selectedGameId) return [];
    return allClips.filter((c) => c.game?.id === selectedGameId && !c.isTrash);
  }, [allClips, selectedGameId]);

  // Fetch live preview of matching clips
  const fetchPreview = useCallback(async () => {
    if (!selectedGameId || !isOpen) return;
    setIsLoadingPreview(true);
    try {
      const payload: any = {
        previewOnly: true,
        gameId: selectedGameId,
      };

      if (criteriaType === "manual") {
        payload.clipIds = Array.from(selectedClipIds);
      } else if (criteriaType === "date") {
        if (dateFrom) payload.dateFrom = dateFrom;
        if (dateTo) payload.dateTo = dateTo;
      } else if (criteriaType === "tag") {
        if (selectedTag) payload.tags = [selectedTag];
      } else if (criteriaType === "query") {
        if (searchQuery.trim()) payload.query = searchQuery.trim();
      }

      const res = await fetch("/api/clips/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setPreviewClips(data.clips || []);
        setPreviewCount(data.count || 0);
      }
    } catch (err) {
      console.error("Preview fetch error:", err);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [selectedGameId, criteriaType, dateFrom, dateTo, selectedTag, searchQuery, selectedClipIds, isOpen]);

  useEffect(() => {
    if (isOpen && selectedGameId) {
      const timer = setTimeout(() => {
        fetchPreview();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [fetchPreview, isOpen, selectedGameId]);

  // Execute Organize Operation
  const handleApplyOrganize = async () => {
    const finalFolderName = isCustomFolder ? customFolderInput.trim() : targetFolderName;
    if (isCustomFolder && !finalFolderName) {
      alert("Please enter a folder name");
      return;
    }

    setIsSubmitting(true);
    setResultMessage(null);

    try {
      const payload: any = {
        gameId: selectedGameId,
        folderName: finalFolderName === "__none__" ? null : finalFolderName,
      };

      if (criteriaType === "manual") {
        payload.clipIds = Array.from(selectedClipIds);
      } else if (criteriaType === "date") {
        if (dateFrom) payload.dateFrom = dateFrom;
        if (dateTo) payload.dateTo = dateTo;
      } else if (criteriaType === "tag") {
        if (selectedTag) payload.tags = [selectedTag];
      } else if (criteriaType === "query") {
        if (searchQuery.trim()) payload.query = searchQuery.trim();
      }

      const res = await fetch("/api/clips/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setResultMessage({ type: "success", text: data.message });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1200);
      } else {
        setResultMessage({ type: "error", text: data.error || "Failed to organize clips" });
      }
    } catch (err: any) {
      setResultMessage({ type: "error", text: err.message || "Operation failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-2xl bg-[#0f1117] border border-outline-variant/60 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-outline-variant/30 flex items-center justify-between bg-[#0b0c10]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">folder_special</span>
            </div>
            <div>
              <h2 className="font-semibold text-base text-on-surface tracking-tight">
                Smart Folder Organizer
              </h2>
              <p className="text-xs text-zinc-400 font-mono">
                Sort footage of a game into seasons, matches, or custom folders
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-surface-container transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 no-scrollbar text-xs font-sans">
          {/* Result Alert Message */}
          {resultMessage && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
                resultMessage.type === "success"
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                  : "bg-rose-950/40 border-rose-500/40 text-rose-300"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {resultMessage.type === "success" ? "check_circle" : "error"}
              </span>
              <span>{resultMessage.text}</span>
            </div>
          )}

          {/* 1. Target Game Selection */}
          <div className="space-y-1.5">
            <label className="block text-zinc-300 font-medium font-mono uppercase tracking-wider text-[11px]">
              1. Target Game Category
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {games.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setSelectedGameId(g.id);
                    setTargetFolderName("");
                    setIsCustomFolder(false);
                    setSelectedClipIds(new Set());
                  }}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    selectedGameId === g.id
                      ? "bg-primary/15 border-primary text-on-surface font-semibold shadow-xs"
                      : "bg-surface-container-low border-outline-variant/30 text-zinc-400 hover:border-outline-variant hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: g.accentColor || "#007AFF" }}
                    />
                    <span className="truncate">{g.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                    {g.clipCount || 0} clips
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Target Folder Destination */}
          <div className="space-y-2 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <label className="block text-zinc-300 font-medium font-mono uppercase tracking-wider text-[11px]">
              2. Target Subfolder Name
            </label>

            <div className="flex flex-wrap gap-2">
              {/* Existing Folders Chips */}
              {existingFolders.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => {
                    setTargetFolderName(f.name);
                    setIsCustomFolder(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                    !isCustomFolder && targetFolderName === f.name
                      ? "bg-primary text-on-primary border-primary font-bold shadow-xs"
                      : "bg-surface-container border-outline-variant/30 text-zinc-300 hover:border-primary/50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">folder</span>
                  <span>{f.name}</span>
                  <span className="text-[10px] opacity-75">({f.clipCount})</span>
                </button>
              ))}

              {/* Remove from folder option */}
              <button
                type="button"
                onClick={() => {
                  setTargetFolderName("__none__");
                  setIsCustomFolder(false);
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                  !isCustomFolder && targetFolderName === "__none__"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold shadow-xs"
                    : "bg-surface-container border-outline-variant/30 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">folder_off</span>
                <span>Unfiled / Root (Remove Folder)</span>
              </button>

              {/* Create New Folder Pill */}
              <button
                type="button"
                onClick={() => {
                  setIsCustomFolder(true);
                  setTargetFolderName("");
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                  isCustomFolder
                    ? "bg-primary text-on-primary border-primary font-bold shadow-xs"
                    : "bg-surface-container-high border-outline-variant/40 text-primary hover:brightness-110"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">create_new_folder</span>
                <span>+ New Folder</span>
              </button>
            </div>

            {/* Custom Folder Input Box */}
            {isCustomFolder && (
              <div className="pt-2">
                <input
                  type="text"
                  autoFocus
                  value={customFolderInput}
                  onChange={(e) => setCustomFolderInput(e.target.value)}
                  placeholder="e.g. Season-19, Scrims & Finals, Clutch Highlights..."
                  className="w-full px-3 py-2 rounded-lg bg-surface-container border border-primary/50 text-on-surface font-mono text-xs focus:outline-none focus:border-primary"
                />
              </div>
            )}
          </div>

          {/* 3. Match & Filter Criteria */}
          <div className="space-y-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <div className="flex items-center justify-between">
              <label className="text-zinc-300 font-medium font-mono uppercase tracking-wider text-[11px]">
                3. Video Selection Method
              </label>
              <span className="text-[11px] font-mono text-zinc-500">
                Matches {previewCount} video{previewCount === 1 ? "" : "s"}
              </span>
            </div>

            {/* Criteria Mode Switcher */}
            <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-surface-container border border-outline-variant/30 font-mono text-xs">
              <button
                type="button"
                onClick={() => setCriteriaType("date")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  criteriaType === "date"
                    ? "bg-primary text-on-primary font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                <span>Date Range</span>
              </button>
              <button
                type="button"
                onClick={() => setCriteriaType("tag")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  criteriaType === "tag"
                    ? "bg-primary text-on-primary font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">label</span>
                <span>By Tag</span>
              </button>
              <button
                type="button"
                onClick={() => setCriteriaType("query")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  criteriaType === "query"
                    ? "bg-primary text-on-primary font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">search</span>
                <span>Title / Keyword</span>
              </button>
              <button
                type="button"
                onClick={() => setCriteriaType("manual")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  criteriaType === "manual"
                    ? "bg-primary text-on-primary font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">checklist</span>
                <span>Pick Manually</span>
              </button>
              <button
                type="button"
                onClick={() => setCriteriaType("all")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  criteriaType === "all"
                    ? "bg-primary text-on-primary font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">done_all</span>
                <span>All In Game</span>
              </button>
            </div>

            {/* Criteria Fields */}
            {criteriaType === "date" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-zinc-400 font-mono mb-1">
                    Start Date (Recorded After)
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-mono text-xs focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 font-mono mb-1">
                    End Date (Recorded Before)
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-mono text-xs focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}

            {criteriaType === "tag" && (
              <div className="pt-1">
                <label className="block text-[11px] text-zinc-400 font-mono mb-1">
                  Select Matching Tag
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {availableTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTag(selectedTag === t ? "" : t)}
                      className={`px-2.5 py-1 rounded-full border text-xs font-mono transition-colors cursor-pointer ${
                        selectedTag === t
                          ? "bg-primary text-on-primary border-primary font-bold shadow-xs"
                          : "bg-surface-container border-outline-variant/30 text-zinc-300 hover:border-primary/40"
                      }`}
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {criteriaType === "query" && (
              <div className="pt-1">
                <label className="block text-[11px] text-zinc-400 font-mono mb-1">
                  Filename or Title Contains
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. S19, Final, Clutch, RPReplay..."
                  className="w-full px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-mono text-xs focus:outline-none focus:border-primary"
                />
              </div>
            )}

            {criteriaType === "manual" && (
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span>Select clips to move ({selectedClipIds.size} selected)</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedClipIds.size === gameClips.length) {
                        setSelectedClipIds(new Set());
                      } else {
                        setSelectedClipIds(new Set(gameClips.map((c) => c.id)));
                      }
                    }}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    {selectedClipIds.size === gameClips.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {gameClips.map((clip) => {
                    const isSelected = selectedClipIds.has(clip.id);
                    return (
                      <div
                        key={clip.id}
                        onClick={() => {
                          const next = new Set(selectedClipIds);
                          if (next.has(clip.id)) next.delete(clip.id);
                          else next.add(clip.id);
                          setSelectedClipIds(next);
                        }}
                        className={`p-2 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/15 border-primary text-on-surface"
                            : "bg-surface-container border-outline-variant/20 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              isSelected ? "bg-primary border-primary text-white" : "border-zinc-500"
                            }`}
                          >
                            {isSelected && <span className="material-symbols-outlined text-[12px]">check</span>}
                          </span>
                          <span className="truncate font-medium text-xs text-on-surface">{clip.title}</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                          {clip.folder ? `📁 ${clip.folder}` : "unfiled"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4. Live Match Preview Strip */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
                Preview of Matching Footage ({previewCount})
              </span>
              {isLoadingPreview && (
                <span className="text-primary font-mono text-[10px] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                  Updating preview...
                </span>
              )}
            </div>

            {previewClips.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                {previewClips.map((clip) => (
                  <div
                    key={clip.id}
                    className="p-1.5 rounded-lg bg-surface-container border border-outline-variant/30 flex flex-col gap-1 min-w-0"
                  >
                    <div className="relative aspect-video rounded overflow-hidden bg-black">
                      <img
                        src={`/api/clips/${clip.id}/thumbnail`}
                        alt={clip.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[11px] text-zinc-200 truncate font-medium">
                      {clip.title}
                    </span>
                    <span className="text-[9px] text-zinc-500 font-mono truncate">
                      {clip.folder ? `📁 ${clip.folder}` : "no folder"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-center text-zinc-500 text-xs font-mono">
                No videos match the selected criteria in this game.
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-outline-variant/30 flex items-center justify-between gap-3 bg-[#0b0c10]">
          <span className="text-xs text-zinc-400 font-mono truncate">
            Target:{" "}
            <strong className="text-primary">
              {isCustomFolder
                ? customFolderInput.trim() || "(enter folder)"
                : targetFolderName === "__none__"
                ? "Remove from folder"
                : targetFolderName || "(select folder)"}
            </strong>
          </span>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-zinc-300 text-xs font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                isSubmitting ||
                previewCount === 0 ||
                (!targetFolderName && !isCustomFolder) ||
                (isCustomFolder && !customFolderInput.trim())
              }
              onClick={handleApplyOrganize}
              className="px-4 py-2 rounded-lg bg-primary hover:brightness-110 text-on-primary text-xs font-semibold cursor-pointer transition-all active:scale-95 shadow-md flex items-center gap-1.5 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">drive_file_move</span>
              <span>
                {isSubmitting
                  ? "Organizing..."
                  : `Move ${previewCount} Video${previewCount === 1 ? "" : "s"}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
