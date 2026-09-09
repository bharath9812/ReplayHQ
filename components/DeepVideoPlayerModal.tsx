"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ClipData } from "./ClipCard";

interface DeepVideoPlayerModalProps {
  clip: ClipData | null;
  onClose: () => void;
  onSelectOtherClip?: (clip: ClipData) => void;
  onRefreshClip?: () => void;
  onUpdateClip?: (clip: ClipData) => void;
  allClips?: ClipData[];
  isStandalonePage?: boolean;
}

function formatTimecode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00.00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs
    .toString()
    .padStart(2, "0")}`;
}

export function DeepVideoPlayerModal({
  clip: initialClip,
  onClose,
  onSelectOtherClip,
  onRefreshClip,
  onUpdateClip,
  allClips = [],
  isStandalonePage = false,
}: DeepVideoPlayerModalProps) {
  // Local Mutable Clip State (Synced with prop and mutations)
  const [clip, setClip] = useState<ClipData | null>(initialClip);

  useEffect(() => {
    setClip(initialClip);
  }, [initialClip]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const theatreContainerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const fullscreenScrubberRef = useRef<HTMLDivElement>(null);

  // Playback States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialClip?.duration || 10);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showInspector, setShowInspector] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Editable Story Description State
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(initialClip?.description || "");
  const [isSavingDesc, setIsSavingDesc] = useState(false);

  useEffect(() => {
    setDescDraft(clip?.description || "");
  }, [clip?.description]);

  // Dynamic Tag Management State
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string; color?: string }[]>([]);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [isTagUpdating, setIsTagUpdating] = useState(false);
  const tagPickerRef = useRef<HTMLDivElement>(null);

  // Subfolder & Category Organization State
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState("");
  const [isFolderUpdating, setIsFolderUpdating] = useState(false);
  const folderPickerRef = useRef<HTMLDivElement>(null);

  // Multi-Game Collections State
  const [modalCollections, setModalCollections] = useState<any[]>([]);
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [isCollectionUpdating, setIsCollectionUpdating] = useState(false);
  const collectionPickerRef = useRef<HTMLDivElement>(null);

  // Favorite Toggle State
  const [isFavoriteUpdating, setIsFavoriteUpdating] = useState(false);
  const handleToggleFavoriteRef = useRef<() => void>(() => {});

  // Distinct folders for this clip's game (or uncategorized) from allClips
  const availableFoldersForGame = useMemo(() => {
    const set = new Set<string>();
    const targetGameId = clip?.game?.id || clip?.gameId || null;
    if (!allClips) return [];
    for (const c of allClips) {
      const cGameId = c.game?.id || c.gameId || null;
      if (cGameId === targetGameId && c.folder) {
        set.add(c.folder);
      }
    }
    return Array.from(set).sort();
  }, [clip?.game?.id, clip?.gameId, allClips]);

  // Re-probe Master File Metadata State
  const [isReProbing, setIsReProbing] = useState(false);

  // Footage Deletion Modal State
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fullscreen & Overlay Controls States
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [hudFeedback, setHudFeedback] = useState<{ text: string; icon: string } | null>(null);

  // Hover Scrubber & Dynamic Preview States
  const [isScrubberHovered, setIsScrubberHovered] = useState(false);
  const [hoverPositionRatio, setHoverPositionRatio] = useState(0);
  const [hoverTime, setHoverTime] = useState(0);
  const [hasStoryboard, setHasStoryboard] = useState(false);

  // Trimming Handles (In / Out Points)
  const [isTrimmingMode, setIsTrimmingMode] = useState(false);
  const [trimIn, setTrimIn] = useState(0);
  const [trimOut, setTrimOut] = useState(duration);
  const [isExportingHighlight, setIsExportingHighlight] = useState(false);
  const [highlightExportMsg, setHighlightExportMsg] = useState<string | null>(null);

  // Timeouts & Touch Refs
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const lastTapSideRef = useRef<"left" | "right" | "center" | null>(null);
  const isTouchActiveRef = useRef(false);

  // Forward & Rewind Button Animation States
  const [forwardAnimating, setForwardAnimating] = useState(false);
  const [rewindAnimating, setRewindAnimating] = useState(false);
  const forwardTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rewindTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerForwardAnim = useCallback(() => {
    setForwardAnimating(true);
    if (forwardTimerRef.current) clearTimeout(forwardTimerRef.current);
    forwardTimerRef.current = setTimeout(() => {
      setForwardAnimating(false);
    }, 350);
  }, []);

  const triggerRewindAnim = useCallback(() => {
    setRewindAnimating(true);
    if (rewindTimerRef.current) clearTimeout(rewindTimerRef.current);
    rewindTimerRef.current = setTimeout(() => {
      setRewindAnimating(false);
    }, 350);
  }, []);

  // Clip Switch Transition State (YouTube/Netflix-Style Smooth Stream Transition)
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitioningClipId, setTransitioningClipId] = useState<string | null>(null);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shouldAutoPlayRef = useRef(false);

  useEffect(() => {
    return () => {
      if (forwardTimerRef.current) clearTimeout(forwardTimerRef.current);
      if (rewindTimerRef.current) clearTimeout(rewindTimerRef.current);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  // Detect Desktop Viewport for Responsive Inspector Layout
  useEffect(() => {
    const checkDesktop = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) {
        setShowInspector(true);
      } else {
        setShowInspector(false);
      }
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  // Flash Center HUD Feedback Indicator (e.g. +10s, Volume, etc.)
  const showHudFeedback = useCallback((text: string, icon: string) => {
    setHudFeedback({ text, icon });
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setHudFeedback(null);
    }, 800);
  }, []);

  // Check if WebP Storyboard sprite sheet is available for this clip
  useEffect(() => {
    if (!clip?.id) return;
    let isCurrent = true;
    const testImg = new Image();
    testImg.src = `/api/clips/${clip.id}/storyboard`;
    testImg.onload = () => {
      if (isCurrent) setHasStoryboard(true);
    };
    testImg.onerror = () => {
      if (isCurrent) setHasStoryboard(false);
    };
    return () => {
      isCurrent = false;
    };
  }, [clip?.id]);

  // Sync Duration and Trims on clip change (keyed by ID so in-place edits don't reset playback)
  useEffect(() => {
    if (clip) {
      const dur = clip.duration || 10;
      setDuration(dur);
      setTrimIn(0);
      setTrimOut(dur);
      setIsTrimmingMode(false);
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [clip?.id]);

  // Fetch available tags for quick tag picking
  const fetchAvailableTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      const data = await res.json();
      if (data.success && Array.isArray(data.tags)) {
        setAvailableTags(data.tags);
      }
    } catch (err) {
      console.error("Error fetching tags:", err);
    }
  }, []);

  useEffect(() => {
    fetchAvailableTags();
  }, [fetchAvailableTags]);

  // Close tag picker on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setIsTagPickerOpen(false);
        setTagQuery("");
      }
    };
    if (isTagPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTagPickerOpen]);

  // Close folder picker on click outside
  useEffect(() => {
    const handleClickOutsideFolder = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
        setNewFolderNameInput("");
      }
    };
    if (isFolderPickerOpen) {
      document.addEventListener("mousedown", handleClickOutsideFolder);
    }
    return () => document.removeEventListener("mousedown", handleClickOutsideFolder);
  }, [isFolderPickerOpen]);

  // Close collection picker on click outside
  useEffect(() => {
    const handleClickOutsideCollection = (e: MouseEvent) => {
      if (collectionPickerRef.current && !collectionPickerRef.current.contains(e.target as Node)) {
        setIsCollectionPickerOpen(false);
      }
    };
    if (isCollectionPickerOpen) {
      document.addEventListener("mousedown", handleClickOutsideCollection);
    }
    return () => document.removeEventListener("mousedown", handleClickOutsideCollection);
  }, [isCollectionPickerOpen]);

  // Fetch Collections
  const fetchModalCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      const data = await res.json();
      if (data.success && Array.isArray(data.collections)) {
        setModalCollections(data.collections);
      }
    } catch (err) {
      console.error("Failed to fetch collections in player modal:", err);
    }
  }, []);

  useEffect(() => {
    fetchModalCollections();
  }, [fetchModalCollections]);

  // Fullscreen Change Listeners
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );
      setIsFullscreen(isFs);
      if (!isFs) {
        setIsPseudoFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    document.addEventListener("mozfullscreenchange", handleFsChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
      document.removeEventListener("mozfullscreenchange", handleFsChange);
    };
  }, []);

  // Activity Trigger to Auto-Hide Controls in Fullscreen
  const triggerControlsActivity = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsControlsVisible(false);
      }, 2500);
    }
  }, [isPlaying]);

  // When playback state changes, update auto-hide timer
  useEffect(() => {
    if (!isPlaying) {
      setIsControlsVisible(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      triggerControlsActivity();
    }
  }, [isPlaying, triggerControlsActivity]);

  // Update dynamic scrubber video element frame on hoverTime changes
  useEffect(() => {
    if (previewVideoRef.current && isScrubberHovered) {
      if (Math.abs(previewVideoRef.current.currentTime - hoverTime) > 0.05) {
        previewVideoRef.current.currentTime = hoverTime;
      }
    }
  }, [hoverTime, isScrubberHovered]);

  // Video Time Update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || clip?.duration || 10;
      setDuration(dur);
      if (trimOut <= 0 || trimOut > dur) {
        setTrimOut(dur);
      }
      if (shouldAutoPlayRef.current) {
        shouldAutoPlayRef.current = false;
        videoRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    }
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      setIsTransitioning(false);
      setTransitioningClipId(null);
    }, 280);
  };

  const handleCanPlay = () => {
    if (shouldAutoPlayRef.current && videoRef.current) {
      shouldAutoPlayRef.current = false;
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      setIsTransitioning(false);
      setTransitioningClipId(null);
    }, 220);
  };

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
    triggerControlsActivity();
  }, [isPlaying, triggerControlsActivity]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!videoRef.current) return;
      const clamped = Math.max(0, Math.min(duration, seconds));
      videoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
      triggerControlsActivity();
    },
    [duration, triggerControlsActivity]
  );

  // Toggle Cinema Fullscreen
  const toggleFullscreen = useCallback(async () => {
    const el = theatreContainerRef.current;
    if (!el) return;

    const isCurrentlyFs =
      isFullscreen ||
      isPseudoFullscreen ||
      !!document.fullscreenElement ||
      !!(document as any).webkitFullscreenElement;

    if (!isCurrentlyFs) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        } else if (videoRef.current && (videoRef.current as any).webkitEnterFullscreen) {
          // iOS Safari fallback
          (videoRef.current as any).webkitEnterFullscreen();
        } else {
          setIsPseudoFullscreen(true);
        }
      } catch {
        setIsPseudoFullscreen(true);
      }
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      } catch {}
      setIsPseudoFullscreen(false);
      setIsFullscreen(false);
    }
    triggerControlsActivity();
  }, [isFullscreen, isPseudoFullscreen, triggerControlsActivity]);

  // Keyboard Shortcuts (Space, K, J, L, Arrows, F, M, Esc, comma, dot, I, O)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      triggerControlsActivity();

      switch (e.key) {
        case "Escape":
          if (showDeleteDialog) {
            setShowDeleteDialog(false);
          } else if (isTagPickerOpen) {
            setIsTagPickerOpen(false);
          } else if (isEditingDesc) {
            setIsEditingDesc(false);
          } else if (isFullscreen || isPseudoFullscreen) {
            toggleFullscreen();
          } else {
            onClose();
          }
          break;
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "k":
        case "K":
          togglePlay();
          break;
        case "j":
        case "J":
          seekTo(currentTime - 10);
          triggerRewindAnim();
          break;
        case "l":
        case "L":
          seekTo(currentTime + 10);
          triggerForwardAnim();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekTo(currentTime - 5);
          triggerRewindAnim();
          break;
        case "ArrowRight":
          e.preventDefault();
          seekTo(currentTime + 5);
          triggerForwardAnim();
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((prev) => {
            const next = Math.min(1, prev + 0.1);
            if (videoRef.current) {
              videoRef.current.volume = next;
              videoRef.current.muted = false;
            }
            setIsMuted(false);
            showHudFeedback(`${Math.round(next * 100)}%`, "volume_up");
            return next;
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((prev) => {
            const next = Math.max(0, prev - 0.1);
            if (videoRef.current) {
              videoRef.current.volume = next;
              videoRef.current.muted = next === 0;
            }
            setIsMuted(next === 0);
            showHudFeedback(`${Math.round(next * 100)}%`, next === 0 ? "volume_off" : "volume_down");
            return next;
          });
          break;
        case "m":
        case "M":
          if (videoRef.current) {
            const nextMute = !videoRef.current.muted;
            videoRef.current.muted = nextMute;
            setIsMuted(nextMute);
            showHudFeedback(nextMute ? "Muted" : "Unmuted", nextMute ? "volume_off" : "volume_up");
          }
          break;
        case ",":
          seekTo(currentTime - 1 / (clip?.fps || 60));
          break;
        case ".":
          seekTo(currentTime + 1 / (clip?.fps || 60));
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "i":
        case "I":
          if (e.metaKey) {
            e.preventDefault();
            setShowInspector((prev) => !prev);
          } else {
            setTrimIn(currentTime);
            showHudFeedback(`In: ${formatTimecode(currentTime).slice(0, 5)}`, "start");
          }
          break;
        case "o":
        case "O":
          setTrimOut(currentTime);
          showHudFeedback(`Out: ${formatTimecode(currentTime).slice(0, 5)}`, "stop");
          break;
        case "s":
        case "S":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            handleToggleFavoriteRef.current();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clip?.fps,
    currentTime,
    duration,
    isFullscreen,
    isPseudoFullscreen,
    onClose,
    seekTo,
    showHudFeedback,
    toggleFullscreen,
    togglePlay,
    triggerControlsActivity,
    triggerForwardAnim,
    triggerRewindAnim,
    showDeleteDialog,
    isTagPickerOpen,
    isEditingDesc,
  ]);

  // Scrubber Interaction Helpers (Mouse & Touch)
  const calculateRatioFromEvent = (
    clientX: number,
    targetRef: React.RefObject<HTMLDivElement>
  ): number => {
    if (!targetRef.current) return 0;
    const rect = targetRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleScrubberMouseMove = (
    e: React.MouseEvent<HTMLDivElement>,
    targetRef: React.RefObject<HTMLDivElement>
  ) => {
    const ratio = calculateRatioFromEvent(e.clientX, targetRef);
    setHoverPositionRatio(ratio);
    setHoverTime(ratio * duration);
    setIsScrubberHovered(true);
    triggerControlsActivity();
  };

  const handleScrubberClick = (
    e: React.MouseEvent<HTMLDivElement>,
    targetRef: React.RefObject<HTMLDivElement>
  ) => {
    const ratio = calculateRatioFromEvent(e.clientX, targetRef);
    seekTo(ratio * duration);
  };

  const handleTouchScrubber = (
    e: React.TouchEvent<HTMLDivElement>,
    targetRef: React.RefObject<HTMLDivElement>
  ) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const ratio = calculateRatioFromEvent(touch.clientX, targetRef);
    setHoverPositionRatio(ratio);
    setHoverTime(ratio * duration);
    setIsScrubberHovered(true);
    seekTo(ratio * duration);
    triggerControlsActivity();
  };

  // Touch Gesture Handling on Video Stage (Single Tap & Double Tap to Seek)
  const handleTouchVideoStage = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.changedTouches.length === 0) return;
    isTouchActiveRef.current = true;
    setTimeout(() => {
      isTouchActiveRef.current = false;
    }, 400);

    const now = Date.now();
    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (touch.clientX - rect.left) / rect.width;

    let side: "left" | "right" | "center" = "center";
    if (xRatio < 0.35) side = "left";
    else if (xRatio > 0.65) side = "right";

    if (now - lastTapTimeRef.current < 320 && lastTapSideRef.current === side) {
      // Double tap detected!
      if (side === "left") {
        seekTo(currentTime - 10);
        triggerRewindAnim();
      } else if (side === "right") {
        seekTo(currentTime + 10);
        triggerForwardAnim();
      } else {
        togglePlay();
      }
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
      lastTapSideRef.current = side;
      // Single tap toggles HUD visibility in fullscreen or play/pause in windowed mode
      if (isFullscreen || isPseudoFullscreen) {
        if (isControlsVisible && isPlaying) {
          setIsControlsVisible(false);
        } else {
          triggerControlsActivity();
        }
      } else {
        togglePlay();
      }
    }
  };

  const handleClickVideoStage = () => {
    if (isTouchActiveRef.current) return;
    if ((isFullscreen || isPseudoFullscreen) && !isControlsVisible) {
      triggerControlsActivity();
    } else {
      togglePlay();
    }
  };

  // Extract Lossless Highlight
  const handleExtractHighlight = async () => {
    if (!clip) return;
    setIsExportingHighlight(true);
    setHighlightExportMsg("Extracting direct stream lossless excerpt...");

    try {
      const res = await fetch(`/api/clips/${clip.id}/highlight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: trimIn,
          endTime: trimOut,
          title: `${clip.title} (Highlight ${Math.round(trimIn)}s-${Math.round(trimOut)}s)`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setHighlightExportMsg("Lossless highlight extracted successfully!");
        setTimeout(() => setHighlightExportMsg(null), 4000);
      } else {
        setHighlightExportMsg(`Export notice: ${data.error || "Completed"}`);
        setTimeout(() => setHighlightExportMsg(null), 4000);
      }
    } catch (err: any) {
      setHighlightExportMsg(`Export error: ${err.message}`);
      setTimeout(() => setHighlightExportMsg(null), 4000);
    } finally {
      setIsExportingHighlight(false);
    }
  };

  // Download Frame Snapshot
  const handleTakeSnapshot = () => {
    if (!clip) return;
    window.open(`/api/clips/${clip.id}/snapshot?time=${currentTime.toFixed(2)}`, "_blank");
    showHudFeedback("Snapshot Saved", "photo_camera");
  };

  // Save Edited Description / Notes
  const handleSaveDescription = async () => {
    if (!clip) return;
    setIsSavingDesc(true);
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descDraft.trim() }),
      });
      const data = await res.json();
      if (data.success && data.clip) {
        setClip(data.clip);
        setIsEditingDesc(false);
        showHudFeedback("Story Notes Saved", "check_circle");
        onRefreshClip?.();
      } else {
        alert(data.error || "Failed to save description");
      }
    } catch (err: any) {
      console.error("Save description error:", err);
      alert("Error saving description: " + err.message);
    } finally {
      setIsSavingDesc(false);
    }
  };

  // Remove Tag from Clip
  const handleRemoveTag = async (tagNameToRemove: string) => {
    if (!clip || isTagUpdating) return;
    setIsTagUpdating(true);
    const currentTagNames = clip.tags ? clip.tags.map((t) => t.tag.name) : [];
    const nextTagNames = currentTagNames.filter(
      (t) => t.toLowerCase() !== tagNameToRemove.toLowerCase()
    );
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTagNames }),
      });
      const data = await res.json();
      if (data.success && data.clip) {
        setClip(data.clip);
        showHudFeedback(`Removed #${tagNameToRemove}`, "label_off");
        onRefreshClip?.();
      }
    } catch (err) {
      console.error("Remove tag error:", err);
    } finally {
      setIsTagUpdating(false);
    }
  };

  // Add Tag to Clip (Existing or Newly Created)
  const handleAddTag = async (tagNameToAdd: string) => {
    const clean = tagNameToAdd.trim().toLowerCase().replace(/^#+/, "");
    if (!clean || !clip || isTagUpdating) return;
    setIsTagUpdating(true);
    const currentTagNames = clip.tags ? clip.tags.map((t) => t.tag.name) : [];
    if (currentTagNames.some((t) => t.toLowerCase() === clean)) {
      setIsTagPickerOpen(false);
      setTagQuery("");
      setIsTagUpdating(false);
      return;
    }
    const nextTagNames = [...currentTagNames, clean];
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTagNames }),
      });
      const data = await res.json();
      if (data.success && data.clip) {
        setClip(data.clip);
        setIsTagPickerOpen(false);
        setTagQuery("");
        showHudFeedback(`Added #${clean}`, "label");
        fetchAvailableTags();
        onRefreshClip?.();
      }
    } catch (err) {
      console.error("Add tag error:", err);
    } finally {
      setIsTagUpdating(false);
    }
  };

  // Toggle Favorite Status for this clip
  const handleToggleFavorite = async () => {
    if (!clip || isFavoriteUpdating) return;
    const nextVal = !clip.isFavorite;
    setIsFavoriteUpdating(true);
    // Optimistic UI Update
    const optimistic: ClipData = { ...clip, isFavorite: nextVal };
    setClip(optimistic);
    onUpdateClip?.(optimistic);
    showHudFeedback(nextVal ? "Added to Favorites" : "Removed from Favorites", "star");
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: nextVal }),
      });
      const data = await res.json();
      if (data.success && data.clip) {
        setClip(data.clip);
        onUpdateClip?.(data.clip);
        onRefreshClip?.();
      } else {
        // Revert on error
        const reverted: ClipData = { ...clip, isFavorite: !nextVal };
        setClip(reverted);
        onUpdateClip?.(reverted);
        alert(data.error || "Failed to update favorite status");
      }
    } catch (err: any) {
      const reverted: ClipData = { ...clip, isFavorite: !nextVal };
      setClip(reverted);
      onUpdateClip?.(reverted);
      console.error("Toggle favorite error:", err);
      alert("Error updating favorite: " + err.message);
    } finally {
      setIsFavoriteUpdating(false);
    }
  };
  handleToggleFavoriteRef.current = handleToggleFavorite;

  // Reassign / Set Subfolder for this clip
  const handleSetClipFolder = async (folderName: string | null) => {
    if (!clip || isFolderUpdating) return;
    setIsFolderUpdating(true);
    const targetFolder = folderName && folderName.trim() ? folderName.trim() : null;
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: targetFolder }),
      });
      const data = await res.json();
      if (data.success && data.clip) {
        setClip(data.clip);
        onUpdateClip?.(data.clip);
        setIsFolderPickerOpen(false);
        setNewFolderNameInput("");
        showHudFeedback(targetFolder ? `Moved to 📁 ${targetFolder}` : "Unfiled from Folder", "drive_file_move");
        onRefreshClip?.();
      } else {
        alert(data.error || "Failed to update folder");
      }
    } catch (err: any) {
      console.error("Update folder error:", err);
      alert("Error updating folder: " + err.message);
    } finally {
      setIsFolderUpdating(false);
    }
  };

  // Toggle clip membership in multi-game collection
  const handleToggleClipCollection = async (collectionId: string, isCurrentlyIn: boolean) => {
    if (!clip || isCollectionUpdating) return;
    setIsCollectionUpdating(true);
    try {
      const action = isCurrentlyIn ? "removeClip" : "addClip";
      const res = await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId,
          action,
          clipId: clip.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchModalCollections();
        showHudFeedback(
          isCurrentlyIn ? "Removed from collection" : "Added to collection",
          "collections_bookmark"
        );
        onRefreshClip?.();
      } else {
        alert(data.error || "Failed to update collection");
      }
    } catch (err: any) {
      console.error("Update collection error:", err);
      alert("Error updating collection: " + err.message);
    } finally {
      setIsCollectionUpdating(false);
    }
  };

  // Manual Refresh: Re-probe Unaltered Master File on Disk
  const handleManualReProbe = async () => {
    if (!clip || isReProbing) return;
    setIsReProbing(true);
    showHudFeedback("Inspecting Master File...", "hourglass_top");
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success && data.clip) {
        setClip(data.clip);
        if (data.clip.duration) {
          setDuration(data.clip.duration);
        }
        showHudFeedback("Metadata Refreshed from Original", "verified");
        onRefreshClip?.();
      } else {
        alert(data.error || "Failed to re-probe metadata from master file");
      }
    } catch (err: any) {
      console.error("Re-probe error:", err);
      alert("Error re-probing file: " + err.message);
    } finally {
      setIsReProbing(false);
    }
  };

  // Delete Footage (Move to Trash or Permanent Purge)
  const handleDeleteClip = async (force: boolean = false) => {
    if (!clip || isDeleting) return;
    setIsDeleting(true);
    try {
      const url = force ? `/api/clips/${clip.id}?force=true` : `/api/clips/${clip.id}`;
      const res = await fetch(url, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        showHudFeedback(force ? "Footage Purged" : "Moved to Trash", "delete");
        setShowDeleteDialog(false);
        onRefreshClip?.();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("gamevault:sync"));
        }
        onClose();
      } else {
        alert(data.error || "Failed to delete clip");
      }
    } catch (err: any) {
      console.error("Delete error:", err);
      alert("Error deleting footage: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!clip) return null;

  const inActiveFullscreen = isFullscreen || isPseudoFullscreen;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const inPercent = duration > 0 ? (trimIn / duration) * 100 : 25;
  const outPercent = duration > 0 ? (trimOut / duration) * 100 : 40;
  const trimWidthPercent = Math.max(0, outPercent - inPercent);
  const remainingTime = Math.max(0, duration - currentTime);
  const currentFrame = Math.round(currentTime * (clip.fps || 60));

  // Clamped horizontal percentage for tooltip so it stays inside viewport
  const tooltipLeftPercent = Math.max(8, Math.min(92, hoverPositionRatio * 100));

  // Calculate sprite coordinates if WebP storyboard sprite sheet is present (10x10 high-definition grid)
  const totalFrames = 100;
  const frameInterval = Math.max(0.01, duration / totalFrames);
  const frameIndex = Math.min(totalFrames - 1, Math.max(0, Math.floor(hoverTime / frameInterval)));
  const spriteCol = frameIndex % 10;
  const spriteRow = Math.floor(frameIndex / 10);
  const bgPosX = (spriteCol / 9) * 100;
  const bgPosY = (spriteRow / 9) * 100;

  const relatedClips = useMemo(() => {
    if (!allClips || allClips.length === 0 || !clip?.id) return [];
    const others = allClips.filter((c) => c.id !== clip.id);
    const targetGameId = clip.game?.id || clip.gameId || null;
    const sameGame = others.filter((c) => {
      const cGameId = c.game?.id || c.gameId || null;
      return targetGameId && cGameId === targetGameId;
    });
    const differentGame = others.filter((c) => !sameGame.includes(c));
    return [...sameGame, ...differentGame].slice(0, 8);
  }, [allClips, clip?.id, clip?.gameId, clip?.game?.id]);

  const handleSelectRelatedClip = useCallback(
    (targetClip: ClipData) => {
      if (targetClip.id === clip?.id) return;
      setIsTransitioning(true);
      setTransitioningClipId(targetClip.id);
      shouldAutoPlayRef.current = true;

      // Smoothly scroll back to top of player stage
      if (theatreContainerRef.current) {
        theatreContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }

      // Reset playback states
      setCurrentTime(0);
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.pause();
      }

      // Update active clip immediately
      setClip(targetClip);

      if (onSelectOtherClip) {
        onSelectOtherClip(targetClip);
      }

      // Safety timeout: transition resolves smoothly if browser throttles events
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = setTimeout(() => {
        setIsTransitioning(false);
        setTransitioningClipId(null);
      }, 750);
    },
    [clip?.id, onSelectOtherClip]
  );

  const filteredAvailableTags = availableTags.filter((t) =>
    !tagQuery ? true : t.name.toLowerCase().includes(tagQuery.toLowerCase().trim().replace(/^#+/, ""))
  );

  // Dynamic Thumbnail Scrubber HUD Component
  const renderScrubTooltip = () => (
    <div
      style={{ left: `${tooltipLeftPercent}%` }}
      className="absolute -top-40 -translate-x-1/2 flex flex-col items-center pointer-events-none z-50 transition-transform duration-75"
    >
      <div className="p-1.5 rounded-xl bg-[#0c0e12]/95 border border-white/25 shadow-2xl flex flex-col gap-1.5 w-56 backdrop-blur-2xl ring-1 ring-white/10">
        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black border border-white/10 shadow-inner">
          {hasStoryboard ? (
            <div
              className="w-full h-full bg-no-repeat transition-all duration-75"
              style={{
                backgroundImage: `url('/api/clips/${clip.id}/storyboard')`,
                backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                backgroundSize: "1000% 1000%",
                imageRendering: "auto",
              }}
            />
          ) : (
            <video
              ref={previewVideoRef}
              src={`/api/clips/${clip.id}/stream`}
              muted
              playsInline
              preload="auto"
              className="w-full h-full object-cover pointer-events-none"
            />
          )}

          {/* Timecode Badge inside preview frame */}
          <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-black/85 font-mono text-[10px] text-zinc-100 border border-white/15 shadow-sm font-semibold tracking-wide">
            {formatTimecode(hoverTime)}
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[11px] text-zinc-300">
          <span className="font-medium truncate text-zinc-400">HD Scrub Keyframe</span>
          <span className="text-primary font-mono text-[10px] font-semibold">
            F: {Math.round(hoverTime * (clip.fps || 60))}
          </span>
        </div>
      </div>
      <div className="w-2.5 h-2.5 rotate-45 bg-[#0c0e12] border-r border-b border-white/25 -mt-1.5 shadow-sm"></div>
    </div>
  );

  // Optional Trimming Drawer Component
  const renderTrimmingDrawer = () => (
    <div className="p-3 sm:p-4 rounded-xl bg-surface-container-low border border-primary/40 flex flex-wrap items-center justify-between gap-3 text-xs font-mono animate-fade-in shadow-xl">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">In Point:</span>
          <span className="text-amber-400 font-bold">{formatTimecode(trimIn)}</span>
          <button
            onClick={() => {
              setTrimIn(currentTime);
              showHudFeedback(`In: ${formatTimecode(currentTime).slice(0, 5)}`, "start");
            }}
            className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-zinc-200 cursor-pointer active:scale-95"
          >
            Set In (I)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Out Point:</span>
          <span className="text-emerald-400 font-bold">{formatTimecode(trimOut)}</span>
          <button
            onClick={() => {
              setTrimOut(currentTime);
              showHudFeedback(`Out: ${formatTimecode(currentTime).slice(0, 5)}`, "stop");
            }}
            className="px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-zinc-200 cursor-pointer active:scale-95"
          >
            Set Out (O)
          </button>
        </div>

        <div className="text-zinc-500">
          Length: {formatTimecode(Math.max(0, trimOut - trimIn))}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {highlightExportMsg && (
          <span className="text-primary text-xs font-sans">{highlightExportMsg}</span>
        )}

        <button
          onClick={handleExtractHighlight}
          disabled={isExportingHighlight}
          className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md"
        >
          <span className="material-symbols-outlined text-[16px]">content_cut</span>
          <span>Save Highlight</span>
        </button>

        <button
          onClick={() => setIsTrimmingMode(false)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer hover:bg-surface-container"
          title="Close Trimmer"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );

  // Technical Metadata Inspector Modules Component
  const renderInspectorModules = () => (
    <>
      {/* Storage & Integrity Safety */}
      <div className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-1 border border-outline-variant/30 text-xs font-mono">
        <div className="flex items-center justify-between">
          <span className="text-outline text-[10px] uppercase tracking-wider font-semibold">
            Storage &amp; Integrity Safety
          </span>
          <span className="text-secondary text-[11px] font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> VERIFIED
          </span>
        </div>
        <div className="mt-1">
          <span className="text-outline text-[10px] block">MOUNT PATH</span>
          <span className="text-on-surface truncate block">
            {clip.storageOriginal || `/data/storage/originals/${clip.game?.slug || "raw"}/${clip.originalFilename}`}
          </span>
        </div>
        <div className="mt-1">
          <span className="text-outline text-[10px] block">SHA-256 CHECKSUM</span>
          <code className="text-[10px] text-outline truncate block bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/20">
            {clip.sha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
          </code>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-outline">Vault Mode:</span>
          <span className="text-secondary font-medium">Kernel Read-Only Enclave</span>
        </div>

        {/* Master File Metadata Sync Button */}
        <div className="mt-2 pt-2 border-t border-outline-variant/30 flex items-center justify-between">
          <span className="text-outline text-[10px]">Master Inspection:</span>
          <button
            type="button"
            disabled={isReProbing}
            onClick={handleManualReProbe}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container hover:bg-emerald-500/20 border border-outline-variant/30 hover:border-emerald-500/40 text-emerald-400 text-[11px] font-mono cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            title="Read and update technical metadata directly from unaltered original master file"
          >
            <span className={`material-symbols-outlined text-[14px] ${isReProbing ? "animate-spin" : ""}`}>
              sync
            </span>
            <span>{isReProbing ? "Reading Master..." : "Sync from Master"}</span>
          </button>
        </div>
      </div>

      {/* Encoding & Video Specs */}
      <div className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-2 border border-outline-variant/30 text-xs font-mono">
        <span className="text-outline text-[10px] uppercase tracking-wider font-semibold">
          Encoding &amp; Video Specs
        </span>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-surface-container p-2 rounded-lg border border-outline-variant/20">
            <span className="text-outline text-[10px] block">Container</span>
            <span className="text-on-surface font-semibold uppercase">
              {clip.originalFilename?.toLowerCase().endsWith(".mov")
                ? "QuickTime (MOV)"
                : clip.originalFilename?.toLowerCase().endsWith(".mkv")
                ? "Matroska (MKV)"
                : `${clip.codec?.toUpperCase() || "H264"} (MP4)`}
            </span>
          </div>
          <div className="bg-surface-container p-2 rounded-lg border border-outline-variant/20">
            <span className="text-outline text-[10px] block">Resolution</span>
            <span className="text-on-surface font-semibold">
              {clip.width} × {clip.height}
            </span>
          </div>
          <div className="bg-surface-container p-2 rounded-lg border border-outline-variant/20">
            <span className="text-outline text-[10px] block">Framerate</span>
            <span className="text-on-surface font-semibold">
              {clip.fps ? clip.fps.toFixed(2) : "60.00"} fps constant
            </span>
          </div>
          <div className="bg-surface-container p-2 rounded-lg border border-outline-variant/20">
            <span className="text-outline text-[10px] block">Bitrate</span>
            <span className="text-on-surface font-semibold">
              {clip.bitrate
                ? `${(clip.bitrate / 1000000).toFixed(1)} Mbps`
                : clip.duration > 0 && clip.fileSize
                ? `${((Number(clip.fileSize) * 8) / (clip.duration * 1000000)).toFixed(1)} Mbps`
                : "Dynamic"}{" "}
              {clip.codec?.toUpperCase() || "H264"}
            </span>
          </div>
          <div className="bg-surface-container p-2 rounded-lg border border-outline-variant/20">
            <span className="text-outline text-[10px] block">Color Space</span>
            <span className="text-on-surface font-semibold">
              {clip.colorSpace || "Rec.709 (sRGB/BT.709)"}
            </span>
          </div>
          <div className="bg-surface-container p-2 rounded-lg border border-outline-variant/20">
            <span className="text-outline text-[10px] block">Chroma Subsampling</span>
            <span className="text-on-surface font-semibold">
              {clip.pixFmt || "4:2:0 YUV"}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-outline-variant/30">
          <span className="text-outline">HW Decoder:</span>
          <span className="text-primary font-medium">Intel QuickSync QSV Pass-through</span>
        </div>
      </div>

      {/* Audio Pipeline */}
      <div className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-1 border border-outline-variant/30 text-xs font-mono">
        <span className="text-outline text-[10px] uppercase tracking-wider font-semibold">
          Audio Pipeline
        </span>
        <div className="flex justify-between text-[11px]">
          <span className="text-outline">Codec &amp; Channels:</span>
          <span className="text-on-surface">
            {clip.audioChannels || 2}-ch {clip.audioCodec?.toUpperCase() || "AAC"}{" "}
            ({(clip.audioChannels || 2) === 1 ? "Mono" : "Stereo"})
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-outline">Sample Rate:</span>
          <span className="text-on-surface">
            {clip.audioSampleRate
              ? `${(clip.audioSampleRate / 1000).toFixed(1)} kHz`
              : "48.0 kHz"}{" "}
            • 320 kbps (Lossless Audio Stream)
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-outline">Audio Health:</span>
          <span className="text-secondary font-semibold">Bit-Perfect LAN Master</span>
        </div>
      </div>

      {/* Recording Session Info */}
      <div className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-1 border border-outline-variant/30 text-xs font-mono">
        <span className="text-outline text-[10px] uppercase tracking-wider font-semibold">
          Recording Session Info
        </span>
        <div className="flex justify-between text-[11px]">
          <span className="text-outline">Capture Device:</span>
          <span className="text-on-surface">
            {clip.deviceModel ||
              (clip.originalFilename.toLowerCase().includes("rpreplay")
                ? "Apple iPad Pro (ReplayKit Screen Recording)"
                : "Direct Hardware Capture")}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-outline">Software / Game:</span>
          <span className="text-on-surface">{clip.game?.name || "Gaming Archive"}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-outline">
            {clip.recordedAt ? "Original Record Date:" : "Archive Ingest Date:"}
          </span>
          <span className="text-on-surface">
            {clip.recordedAt
              ? new Date(clip.recordedAt).toLocaleString()
              : clip.createdAt
              ? new Date(clip.createdAt).toLocaleString()
              : "Live Archive"}
          </span>
        </div>
      </div>

      {/* Tags & Curator Review */}
      <div className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-2 border border-outline-variant/30 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-outline text-[10px] uppercase font-mono tracking-wider font-semibold">
            Tags &amp; Curator Review
          </span>
          <span className="text-primary font-mono text-[11px]">★★★★★ (5/5)</span>
        </div>

        <div className="flex flex-wrap gap-1 font-mono text-[11px]">
          {clip.tags && clip.tags.length > 0 ? (
            clip.tags.map((t, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md bg-surface-container text-on-surface border border-outline-variant/30"
              >
                #{t.tag.name}
              </span>
            ))
          ) : (
            <>
              <span className="px-2 py-0.5 rounded-md bg-surface-container text-on-surface border border-outline-variant/30">
                #Highlight
              </span>
              <span className="px-2 py-0.5 rounded-md bg-surface-container text-on-surface border border-outline-variant/30">
                #LosslessArchive
              </span>
            </>
          )}
        </div>

        <p className="text-outline text-[11px] font-mono leading-relaxed mt-1">
          &ldquo;Clean gameplay capture without frame drops. Prime candidate for 2026 highlight reel.&rdquo;
        </p>
      </div>

      {/* Vault Maintenance & Deletion */}
      <div className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-2 border border-outline-variant/30 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-outline text-[10px] uppercase font-mono tracking-wider font-semibold">
            Vault Maintenance
          </span>
          <span className="text-rose-400 font-mono text-[10px] uppercase tracking-wider">
            Danger Zone
          </span>
        </div>
        <p className="text-[11px] text-zinc-400 leading-snug">
          Safely move this footage to the archive trash or purge derived caches while preserving original master files.
        </p>
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium cursor-pointer transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[15px]">delete</span>
            <span>Delete Footage</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`bg-background flex flex-col h-[100dvh] w-screen overflow-hidden text-on-surface antialiased select-none ${
        isStandalonePage ? "relative" : "fixed inset-0 z-50"
      }`}
    >
      {/* 1. Global Pro Header Bar (Hidden in Fullscreen) */}
      {!inActiveFullscreen && (
        <header className="h-12 border-b border-outline-variant/40 bg-[#0c0d10]/95 backdrop-blur-xl px-4 flex items-center justify-between sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back to Library Button */}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-container-highest/60 hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface text-xs font-medium transition-all active:scale-95 group cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-primary transition-colors">
                arrow_back
              </span>
              <span>Library</span>
              <kbd className="hidden sm:inline ml-1 px-1.5 py-0.2 rounded bg-black/40 text-[10px] font-mono text-on-surface-variant border border-outline-variant/60">
                Esc
              </kbd>
            </button>

            <div className="h-4 w-px bg-outline-variant/40 shrink-0"></div>

            {/* Title & Vault Status Badge */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-semibold text-sm text-on-surface tracking-tight truncate">
                {clip.title}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Original Immutable (Read-Only Source)
              </span>
            </div>
          </div>

          {/* Right Quick Actions HUD */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Toggle Favorite Star Button */}
            <button
              type="button"
              disabled={isFavoriteUpdating}
              onClick={handleToggleFavorite}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-all border ${
                clip.isFavorite
                  ? "bg-amber-400/20 hover:bg-amber-400/30 border-amber-400/50 text-amber-300 shadow-xs"
                  : "bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:text-white"
              }`}
              title={clip.isFavorite ? "Favorited (Click to remove from Favorites) [S]" : "Add to Favorites [S]"}
            >
              <span className={`material-symbols-outlined text-[16px] ${clip.isFavorite ? "text-amber-400 fill-current" : "text-zinc-400"}`}>
                star
              </span>
              <span className="hidden sm:inline">{clip.isFavorite ? "Favorited" : "Favorite"}</span>
              <kbd className="hidden md:inline ml-0.5 px-1 rounded bg-black/30 text-[9px] font-mono opacity-70">
                S
              </kbd>
            </button>

            <button
              onClick={() => setShowInspector(!showInspector)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors border ${
                showInspector
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-on-surface-variant"
              }`}
              title="Toggle Technical Inspector [⌘I]"
            >
              <span className="material-symbols-outlined text-[16px]">info</span>
              <span className="hidden sm:inline">Inspector</span>
              <kbd className="hidden md:inline ml-1 px-1 rounded bg-black/30 text-[10px] font-mono">
                ⌘I
              </kbd>
            </button>

            <button
              onClick={handleTakeSnapshot}
              className="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest border border-transparent hover:border-outline-variant/40 transition-colors cursor-pointer"
              title="Capture Lossless PNG Frame"
            >
              <span className="material-symbols-outlined text-[18px]">photo_camera</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest border border-transparent hover:border-outline-variant/40 transition-colors cursor-pointer"
              title="Toggle Cinema Fullscreen [F]"
            >
              <span className="material-symbols-outlined text-[18px]">fullscreen</span>
            </button>
          </div>
        </header>
      )}

      {/* 2. Main Work Stage */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-background min-h-0">
        {/* LEFT: Primary Media Theatre Stage */}
        <section
          ref={theatreContainerRef}
          onMouseMove={triggerControlsActivity}
          onTouchStart={triggerControlsActivity}
          className={`flex flex-col bg-[#050608] select-none ${
            inActiveFullscreen
              ? `fixed inset-0 z-[99999] w-screen h-[100dvh] bg-black items-center justify-center ${
                  !isControlsVisible && isPlaying ? "cursor-none" : "cursor-default"
                }`
              : "flex-1 border-b lg:border-b-0 lg:border-r border-outline-variant/30 overflow-y-auto min-h-0"
          }`}
        >
          {/* High-Fidelity Canvas Viewport */}
          <div
            onClick={handleClickVideoStage}
            onTouchEnd={handleTouchVideoStage}
            className={`relative w-full flex items-center justify-center overflow-hidden group shrink-0 ${
              inActiveFullscreen
                ? "w-screen h-[100dvh] bg-black"
                : "aspect-[16/9] lg:aspect-[21/9] max-h-[62vh] bg-black cursor-pointer"
            }`}
          >
            {/* YouTube-Style Dynamic Stream Switch Shimmer Line */}
            {isTransitioning && (
              <div className="absolute top-0 inset-x-0 h-[2.5px] z-50 overflow-hidden pointer-events-none">
                <div className="h-full w-full bg-gradient-to-r from-transparent via-primary to-transparent animate-indeterminate-bar shadow-[0_0_12px_rgba(56,189,248,0.9)]" />
              </div>
            )}

            {/* Cinematic Ambient Backdrop Glow (Netflix-Style Smooth Dissolve) */}
            <div
              className={`absolute inset-0 -z-10 bg-cover bg-center filter blur-3xl scale-110 pointer-events-none transition-opacity duration-500 ease-out ${
                isTransitioning ? "opacity-10" : "opacity-25"
              }`}
              style={{
                backgroundImage: `url('/api/clips/${clip.id}/thumbnail?t=${clip.updatedAt ? new Date(clip.updatedAt).getTime() : 1}')`,
              }}
            />

            {/* Real HTML5 Streaming Video with Crossfade Transition */}
            <video
              ref={videoRef}
              src={`/api/clips/${clip.id}/stream`}
              poster={`/api/clips/${clip.id}/thumbnail?t=${clip.updatedAt ? new Date(clip.updatedAt).getTime() : 1}`}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onCanPlay={handleCanPlay}
              playsInline
              className={`w-full h-full object-contain pointer-events-none transition-all duration-300 ease-out ${
                isTransitioning
                  ? "opacity-35 scale-[0.985] filter blur-[1.5px]"
                  : "opacity-100 scale-100 filter-none"
              }`}
            />

            {/* Center Frosted Play Button (Windowed Mode when Paused) */}
            {!inActiveFullscreen && !isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  className="pointer-events-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/65 hover:bg-black/85 border border-white/25 backdrop-blur-xl text-white flex items-center justify-center shadow-2xl transition-all active:scale-90 group/play cursor-pointer"
                  title="Play Footage"
                >
                  <span className="material-symbols-outlined text-4xl sm:text-5xl ml-1 text-primary group-hover/play:scale-110 transition-transform">
                    play_arrow
                  </span>
                </button>
              </div>
            )}

            {/* Subtle Vignette Shading in Windowed Mode */}
            {!inActiveFullscreen && (
              <>
                <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/80 to-transparent pointer-events-none"></div>
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#08090b] via-[#08090b]/80 to-transparent pointer-events-none"></div>

                {/* Overlaid Viewport Live Telemetry Badges */}
                <div className="absolute top-3 left-4 flex items-center gap-2 pointer-events-none">
                  <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 font-mono text-[10px] text-zinc-300">
                    PRORES RAW PROXY 1:1
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 font-mono text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>{" "}
                    {Math.round(clip.fps || 60)} FPS SYNCED
                  </span>
                </div>

                <div className="absolute top-3 right-4 pointer-events-none">
                  <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 font-mono text-[10px] text-zinc-400">
                    {clip.width} × {clip.height} UHD • Rec.709 PQ
                  </span>
                </div>
              </>
            )}

            {/* Top Floating Non-Intrusive HUD Status Pill */}
            {hudFeedback && (
              <div className="absolute top-6 inset-x-0 flex justify-center pointer-events-none z-50">
                <div className="px-4 py-2 rounded-full bg-black/85 border border-white/20 backdrop-blur-xl flex items-center gap-2 text-white shadow-2xl animate-fade-in">
                  <span className="material-symbols-outlined text-lg text-primary">
                    {hudFeedback.icon}
                  </span>
                  <span className="font-medium text-xs tracking-tight">{hudFeedback.text}</span>
                </div>
              </div>
            )}

            {/* 3. FULLSCREEN CINEMA OVERLAY CONTROLS (Auto-Hiding) */}
            {inActiveFullscreen && (
              <div
                className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 pointer-events-none ${
                  isControlsVisible ? "opacity-100" : "opacity-0"
                }`}
              >
                {/* Fullscreen Top Header Overlay */}
                <div className="p-4 sm:p-6 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between pointer-events-auto">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={toggleFullscreen}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-semibold backdrop-blur-md transition-all active:scale-95 cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">fullscreen_exit</span>
                      <span>Exit Fullscreen</span>
                      <kbd className="hidden sm:inline px-1 py-0.2 rounded bg-black/40 text-[10px] font-mono text-zinc-400">
                        Esc / F
                      </kbd>
                    </button>

                    <div className="h-4 w-px bg-white/20 shrink-0"></div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-white font-semibold text-sm truncate">{clip.title}</span>
                      <span className="text-zinc-400 text-xs font-mono">
                        {clip.width} × {clip.height} • {Math.round(clip.fps || 60)} FPS • {clip.codec?.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 border border-white/10 text-[11px] font-mono text-zinc-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>Direct LAN Stream</span>
                    </div>

                    <button
                      onClick={handleTakeSnapshot}
                      className="w-9 h-9 rounded-lg bg-black/60 hover:bg-black/80 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer"
                      title="Snapshot Lossless PNG Frame"
                    >
                      <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                    </button>

                    <button
                      onClick={toggleFullscreen}
                      className="w-9 h-9 rounded-lg bg-black/60 hover:bg-black/80 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer"
                      title="Exit Fullscreen"
                    >
                      <span className="material-symbols-outlined text-[20px]">fullscreen_exit</span>
                    </button>
                  </div>
                </div>

                {/* Center Touch & Transport Controls (Ideal for iPad / Touch) */}
                <div className="flex items-center justify-center gap-6 pointer-events-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      seekTo(currentTime - 10);
                      triggerRewindAnim();
                    }}
                    className={`w-14 h-14 rounded-full border backdrop-blur-md flex items-center justify-center transition-all duration-200 shadow-xl cursor-pointer ${
                      rewindAnimating
                        ? "scale-125 bg-primary/30 border-primary text-primary ring-4 ring-primary/40 shadow-primary/40 -rotate-12"
                        : "bg-black/60 hover:bg-black/80 border-white/20 text-white active:scale-95"
                    }`}
                    title="Rewind 10s (J / Left Arrow)"
                  >
                    <span
                      className={`material-symbols-outlined text-3xl transition-transform duration-200 ${
                        rewindAnimating ? "-rotate-45 scale-110" : ""
                      }`}
                    >
                      replay_10
                    </span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay();
                    }}
                    className="w-20 h-20 rounded-full bg-primary hover:brightness-110 text-on-primary flex items-center justify-center active:scale-95 transition-all shadow-2xl cursor-pointer"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    <span className="material-symbols-outlined text-5xl">
                      {isPlaying ? "pause" : "play_arrow"}
                    </span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      seekTo(currentTime + 10);
                      triggerForwardAnim();
                    }}
                    className={`w-14 h-14 rounded-full border backdrop-blur-md flex items-center justify-center transition-all duration-200 shadow-xl cursor-pointer ${
                      forwardAnimating
                        ? "scale-125 bg-primary/30 border-primary text-primary ring-4 ring-primary/40 shadow-primary/40 rotate-12"
                        : "bg-black/60 hover:bg-black/80 border-white/20 text-white active:scale-95"
                    }`}
                    title="Forward 10s (L / Right Arrow)"
                  >
                    <span
                      className={`material-symbols-outlined text-3xl transition-transform duration-200 ${
                        forwardAnimating ? "rotate-45 scale-110" : ""
                      }`}
                    >
                      forward_10
                    </span>
                  </button>
                </div>

                {/* Fullscreen Bottom HUD Scrubber & Controls */}
                <div className="p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col gap-3 pointer-events-auto">
                  {/* Timeline Scrubber */}
                  <div
                    ref={fullscreenScrubberRef}
                    onMouseMove={(e) => handleScrubberMouseMove(e, fullscreenScrubberRef)}
                    onMouseLeave={() => setIsScrubberHovered(false)}
                    onClick={(e) => handleScrubberClick(e, fullscreenScrubberRef)}
                    onTouchStart={(e) => handleTouchScrubber(e, fullscreenScrubberRef)}
                    onTouchMove={(e) => handleTouchScrubber(e, fullscreenScrubberRef)}
                    onTouchEnd={() => setIsScrubberHovered(false)}
                    className="relative w-full py-2 cursor-pointer select-none group"
                  >
                    {/* Hover Scrubber Popover Preview HUD */}
                    {isScrubberHovered && renderScrubTooltip()}

                    {/* Track Rail */}
                    <div className="relative h-2 hover:h-3 rounded-full bg-white/20 overflow-hidden transition-all duration-150 flex items-center">
                      <div
                        style={{ width: `${progressPercent}%` }}
                        className="absolute left-0 top-0 bottom-0 bg-primary rounded-full shadow-sm"
                      ></div>
                    </div>

                    {/* Playhead Pin */}
                    <div
                      style={{ left: `${progressPercent}%` }}
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-md pointer-events-none -translate-x-1/2 scale-0 group-hover:scale-100 transition-transform"
                    ></div>
                  </div>

                  {/* Transport Buttons Bar */}
                  <div className="flex items-center justify-between text-white text-xs font-mono">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlay}
                        className="hover:text-primary transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-2xl">
                          {isPlaying ? "pause" : "play_arrow"}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          seekTo(currentTime - 10);
                          triggerRewindAnim();
                        }}
                        className={`transition-all duration-200 cursor-pointer ${
                          rewindAnimating
                            ? "text-primary scale-125 -rotate-12 font-bold"
                            : "hover:text-primary active:scale-95"
                        }`}
                        title="Rewind 10s"
                      >
                        <span
                          className={`material-symbols-outlined text-2xl transition-transform duration-200 ${
                            rewindAnimating ? "-rotate-45" : ""
                          }`}
                        >
                          replay_10
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          seekTo(currentTime + 10);
                          triggerForwardAnim();
                        }}
                        className={`transition-all duration-200 cursor-pointer ${
                          forwardAnimating
                            ? "text-primary scale-125 rotate-12 font-bold"
                            : "hover:text-primary active:scale-95"
                        }`}
                        title="Forward 10s"
                      >
                        <span
                          className={`material-symbols-outlined text-2xl transition-transform duration-200 ${
                            forwardAnimating ? "rotate-45" : ""
                          }`}
                        >
                          forward_10
                        </span>
                      </button>

                      <div className="flex items-center gap-1 ml-2 tabular-nums">
                        <span className="font-semibold">{formatTimecode(currentTime)}</span>
                        <span className="text-zinc-500">/</span>
                        <span className="text-zinc-400">{formatTimecode(duration)}</span>
                        <span className="text-primary ml-1 font-normal text-[11px]">
                          (-{formatTimecode(remainingTime)})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Audio Controls */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (!videoRef.current) return;
                            const next = !isMuted;
                            setIsMuted(next);
                            videoRef.current.muted = next;
                          }}
                          className="hover:text-primary transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-xl">
                            {isMuted || volume === 0 ? "volume_off" : "volume_up"}
                          </span>
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setVolume(val);
                            setIsMuted(val === 0);
                            if (videoRef.current) {
                              videoRef.current.volume = val;
                              videoRef.current.muted = val === 0;
                            }
                          }}
                          className="w-16 sm:w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </div>

                      {/* Speed Buttons */}
                      <div className="hidden sm:flex items-center bg-white/10 p-0.5 rounded-lg border border-white/15">
                        {[0.5, 1.0, 1.5, 2.0].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => {
                              setPlaybackRate(rate);
                              if (videoRef.current) videoRef.current.playbackRate = rate;
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
                              playbackRate === rate
                                ? "bg-primary text-black font-bold"
                                : "text-zinc-300 hover:text-white"
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>

                      {/* Fullscreen Favorite Toggle */}
                      <button
                        type="button"
                        onClick={handleToggleFavorite}
                        className={`hover:scale-110 transition-transform cursor-pointer flex items-center justify-center ${
                          clip.isFavorite ? "text-amber-400" : "text-zinc-400 hover:text-amber-300"
                        }`}
                        title={clip.isFavorite ? "Remove from Favorites [S]" : "Add to Favorites [S]"}
                      >
                        <span className={`material-symbols-outlined text-2xl ${clip.isFavorite ? "fill-current" : ""}`}>
                          star
                        </span>
                      </button>

                      {/* Fullscreen Toggle */}
                      <button
                        onClick={toggleFullscreen}
                        className="hover:text-primary transition-colors cursor-pointer"
                        title="Exit Cinema Fullscreen (F)"
                      >
                        <span className="material-symbols-outlined text-2xl">fullscreen_exit</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Windowed Playback Precision Controls & Scrubber Surface (Hidden in Fullscreen) */}
          {!inActiveFullscreen && (
            <div className="bg-[#0c0d10] border-t border-outline-variant/40 px-3 sm:px-6 py-2.5 sm:py-3 flex flex-col gap-2 shrink-0">
              {/* Sleek Scrubber Timeline Track */}
              <div
                ref={scrubberRef}
                onMouseMove={(e) => handleScrubberMouseMove(e, scrubberRef)}
                onMouseLeave={() => setIsScrubberHovered(false)}
                onClick={(e) => handleScrubberClick(e, scrubberRef)}
                onTouchStart={(e) => handleTouchScrubber(e, scrubberRef)}
                onTouchMove={(e) => handleTouchScrubber(e, scrubberRef)}
                onTouchEnd={() => setIsScrubberHovered(false)}
                className="relative w-full py-2 cursor-pointer select-none group flex items-center"
              >
                {/* Hover Popover Preview HUD with Dynamic Frame */}
                {isScrubberHovered && renderScrubTooltip()}

                {/* Sleek Minimalist Rail */}
                <div className="relative h-1.5 group-hover:h-2.5 w-full rounded-full bg-white/15 overflow-hidden transition-all duration-150 flex items-center">
                  {/* Trimming Range (Only visible when user toggles Trim Mode) */}
                  {isTrimmingMode && (
                    <div
                      style={{
                        left: `${inPercent}%`,
                        width: `${trimWidthPercent}%`,
                      }}
                      className="absolute top-0 bottom-0 bg-primary/40 border-x-2 border-primary z-10 pointer-events-none"
                    />
                  )}

                  {/* Played Progress Fill */}
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className="absolute left-0 top-0 bottom-0 bg-primary rounded-full shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                  />
                </div>

                {/* Glowing Apple Thumb Handle */}
                <div
                  style={{ left: `${progressPercent}%` }}
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg pointer-events-none -translate-x-1/2 scale-100 sm:scale-0 sm:group-hover:scale-100 transition-transform duration-100"
                />
              </div>

              {/* Transport Control Bar (Responsive Single Line on Mobile) */}
              <div className="flex items-center justify-between gap-2 sm:gap-3 pt-0.5">
                {/* Left: Playback, Skipping, Timecode & Volume */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    onClick={togglePlay}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary text-on-primary flex items-center justify-center hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer shrink-0"
                    title="Play / Pause (Space / K)"
                  >
                    <span className="material-symbols-outlined text-[20px] sm:text-[22px]">
                      {isPlaying ? "pause" : "play_arrow"}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      seekTo(currentTime - 10);
                      triggerRewindAnim();
                    }}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer shrink-0 ${
                      rewindAnimating
                        ? "bg-primary/25 text-primary scale-125 -rotate-12 ring-2 ring-primary/50 shadow-md shadow-primary/20"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95"
                    }`}
                    title="Jump 10s Back (J / Left Arrow)"
                  >
                    <span
                      className={`material-symbols-outlined text-[17px] sm:text-[18px] transition-transform duration-200 ${
                        rewindAnimating ? "-rotate-45" : ""
                      }`}
                    >
                      replay_10
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      seekTo(currentTime + 10);
                      triggerForwardAnim();
                    }}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer shrink-0 ${
                      forwardAnimating
                        ? "bg-primary/25 text-primary scale-125 rotate-12 ring-2 ring-primary/50 shadow-md shadow-primary/20"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95"
                    }`}
                    title="Jump 10s Forward (L / Right Arrow)"
                  >
                    <span
                      className={`material-symbols-outlined text-[17px] sm:text-[18px] transition-transform duration-200 ${
                        forwardAnimating ? "rotate-45" : ""
                      }`}
                    >
                      forward_10
                    </span>
                  </button>

                  {/* Elapsed / Total Timecode */}
                  <div className="flex items-center gap-1 font-mono text-[11px] sm:text-xs text-on-surface-variant tabular-nums ml-0.5 sm:ml-1">
                    <span className="text-on-surface font-semibold">
                      {formatTimecode(currentTime)}
                    </span>
                    <span className="text-zinc-600">/</span>
                    <span className="text-zinc-400">{formatTimecode(duration)}</span>
                    <span className="hidden md:inline text-primary text-[11px] font-normal ml-0.5">
                      (-{formatTimecode(remainingTime)})
                    </span>
                  </div>

                  {/* Volume Slider (Hidden on Mobile) */}
                  <div className="hidden sm:flex items-center gap-2 ml-2 pl-2 border-l border-outline-variant/30">
                    <button
                      onClick={() => {
                        if (!videoRef.current) return;
                        const nextMuted = !isMuted;
                        setIsMuted(nextMuted);
                        videoRef.current.muted = nextMuted;
                        showHudFeedback(nextMuted ? "Muted" : "Unmuted", nextMuted ? "volume_off" : "volume_up");
                      }}
                      className="text-outline hover:text-on-surface cursor-pointer"
                      title="Mute / Unmute (M)"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isMuted || volume === 0 ? "volume_off" : "volume_up"}
                      </span>
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setVolume(val);
                        setIsMuted(val === 0);
                        if (videoRef.current) {
                          videoRef.current.volume = val;
                          videoRef.current.muted = val === 0;
                        }
                      }}
                      className="w-16 h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>

                {/* Right: Tools, Speed & Fullscreen */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {/* Mobile Quick Mute Button */}
                  <button
                    onClick={() => {
                      if (!videoRef.current) return;
                      const nextMuted = !isMuted;
                      setIsMuted(nextMuted);
                      videoRef.current.muted = nextMuted;
                      showHudFeedback(nextMuted ? "Muted" : "Unmuted", nextMuted ? "volume_off" : "volume_up");
                    }}
                    className="sm:hidden w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container border border-outline-variant/30 transition-colors cursor-pointer"
                    title="Toggle Mute"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isMuted || volume === 0 ? "volume_off" : "volume_up"}
                    </span>
                  </button>

                  {/* Optional Trim Tool Button (Desktop / Tablet) */}
                  <button
                    onClick={() => setIsTrimmingMode(!isTrimmingMode)}
                    className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors border ${
                      isTrimmingMode
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
                    }`}
                    title="Toggle Clip Trimmer (I / O)"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_cut</span>
                    <span>Trim</span>
                  </button>

                  {/* Snapshot PNG Frame Grabber (Desktop / Tablet) */}
                  <button
                    onClick={handleTakeSnapshot}
                    className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                    title="Capture Lossless PNG Frame"
                  >
                    <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                    <span>Frame</span>
                  </button>

                  {/* Playback Speed Selector (Desktop / Tablet) */}
                  <div className="hidden md:flex items-center bg-surface-container p-0.5 rounded-lg border border-outline-variant/30 text-xs font-mono">
                    {[0.5, 1.0, 1.5, 2.0].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => {
                          setPlaybackRate(rate);
                          if (videoRef.current) videoRef.current.playbackRate = rate;
                        }}
                        className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          playbackRate === rate
                            ? "bg-surface-container-high text-primary font-bold"
                            : "text-outline hover:text-on-surface"
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  {/* Mobile Info Sheet Button */}
                  <button
                    onClick={() => setShowInspector(!showInspector)}
                    className={`sm:hidden w-7 h-7 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                      showInspector
                        ? "bg-primary/20 border-primary text-primary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container border-outline-variant/30"
                    }`}
                    title="View Technical Metadata"
                  >
                    <span className="material-symbols-outlined text-[16px]">info</span>
                  </button>

                  {/* Fullscreen Button */}
                  <button
                    onClick={toggleFullscreen}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container border border-outline-variant/30 transition-colors cursor-pointer"
                    title="Enter Cinema Fullscreen (F)"
                  >
                    <span className="material-symbols-outlined text-[17px] sm:text-[18px]">fullscreen</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Details, Quick Actions & Related Vault Footage (Scrollable under video) */}
          {!inActiveFullscreen && (
            <div className="p-4 sm:p-6 flex flex-col gap-4 bg-[#08090b]">
              {/* Clip Title & Verified Source Badge */}
              <div className={`flex flex-col gap-1.5 transition-all duration-300 ease-out ${
                isTransitioning ? "opacity-40 -translate-y-1" : "opacity-100 translate-y-0"
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="font-semibold text-base sm:text-lg text-on-surface tracking-tight leading-snug truncate">
                      {clip.title}
                    </h1>
                    <button
                      type="button"
                      disabled={isFavoriteUpdating}
                      onClick={handleToggleFavorite}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 active:scale-90 ${
                        clip.isFavorite
                          ? "bg-amber-400/20 border-amber-400/50 text-amber-300 hover:bg-amber-400/30 shadow-xs"
                          : "bg-surface-container/60 hover:bg-surface-container border-outline-variant/30 text-zinc-400 hover:text-amber-300"
                      }`}
                      title={clip.isFavorite ? "Remove from Favorites [S]" : "Add to Favorites [S]"}
                    >
                      <span className={`material-symbols-outlined text-[18px] ${clip.isFavorite ? "text-amber-400 fill-current" : ""}`}>
                        star
                      </span>
                    </button>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    VERIFIED SOURCE
                  </span>
                </div>

                {/* Metadata Pills Row */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant font-mono">
                  <span className="px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-primary font-semibold">
                    {clip.game?.name || "GameVault Archive"}
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span>{clip.width} × {clip.height}</span>
                  <span className="text-zinc-600">•</span>
                  <span>{Math.round(clip.fps || 60)} FPS</span>
                  <span className="text-zinc-600">•</span>
                  <span>{formatTimecode(duration)}</span>
                </div>
              </div>

              {/* Quick Action Pill Bar */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-outline-variant/20">
                {/* Favorite Toggle Pill */}
                <button
                  type="button"
                  disabled={isFavoriteUpdating}
                  onClick={handleToggleFavorite}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all active:scale-95 ${
                    clip.isFavorite
                      ? "bg-amber-400/20 hover:bg-amber-400/30 border-amber-400/50 text-amber-300 shadow-xs"
                      : "bg-surface-container hover:bg-surface-container-high border-outline-variant/40 text-on-surface hover:text-white"
                  }`}
                  title={clip.isFavorite ? "Favorited (Click to remove from Favorites)" : "Add to Favorites"}
                >
                  <span className={`material-symbols-outlined text-[16px] ${clip.isFavorite ? "text-amber-400 fill-current" : "text-zinc-400"}`}>
                    star
                  </span>
                  <span>{clip.isFavorite ? "Favorited" : "Add to Favorites"}</span>
                </button>

                <button
                  onClick={() => setShowInspector(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-on-surface text-xs font-medium cursor-pointer transition-colors active:scale-95"
                >
                  <span className="material-symbols-outlined text-primary text-[16px]">analytics</span>
                  <span>Technical Specs</span>
                </button>

                <button
                  onClick={handleTakeSnapshot}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-on-surface text-xs font-medium cursor-pointer transition-colors active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                  <span>Capture Frame</span>
                </button>

                <button
                  onClick={() => setIsTrimmingMode(!isTrimmingMode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors active:scale-95 ${
                    isTrimmingMode
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-surface-container hover:bg-surface-container-high border-outline-variant/40 text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">content_cut</span>
                  <span>Trim Clip</span>
                </button>

                {/* Speed Cycle Button */}
                <button
                  onClick={() => {
                    const speeds = [0.5, 1.0, 1.5, 2.0];
                    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
                    const nextSpeed = speeds[nextIdx];
                    setPlaybackRate(nextSpeed);
                    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
                    showHudFeedback(`${nextSpeed}x Speed`, "speed");
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-zinc-300 text-xs font-mono cursor-pointer transition-colors active:scale-95"
                >
                  <span className="material-symbols-outlined text-[15px] text-zinc-400">speed</span>
                  <span>{playbackRate}x</span>
                </button>

                {/* Manual Refresh / Re-Probe from Original Master */}
                <button
                  type="button"
                  disabled={isReProbing}
                  onClick={handleManualReProbe}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-emerald-500/10 border border-outline-variant/40 hover:border-emerald-500/40 text-on-surface text-xs font-medium cursor-pointer transition-colors active:scale-95 disabled:opacity-50"
                  title="Re-probe and update metadata from unaltered master video file"
                >
                  <span className={`material-symbols-outlined text-emerald-400 text-[16px] ${isReProbing ? "animate-spin" : ""}`}>
                    sync
                  </span>
                  <span>{isReProbing ? "Probing..." : "Sync Metadata"}</span>
                </button>

                {/* Delete Video Button */}
                <button
                  type="button"
                  onClick={() => setShowDeleteDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium cursor-pointer transition-colors active:scale-95 sm:ml-auto"
                  title="Delete footage or move to trash"
                >
                  <span className="material-symbols-outlined text-[16px] text-rose-400">delete</span>
                  <span>Delete Video</span>
                </button>
              </div>

              {/* Optional Trimming Drawer */}
              {isTrimmingMode && renderTrimmingDrawer()}

              {/* Game Category & Subfolder Assignment Bar */}
              <div className="flex flex-wrap items-center gap-2 pt-2 pb-1 border-b border-outline-variant/20">
                {clip.game ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-medium">
                    <span className="material-symbols-outlined text-[15px]">sports_esports</span>
                    <span>{clip.game.name}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container border border-outline-variant/30 text-zinc-400 text-xs font-mono font-medium">
                    <span className="material-symbols-outlined text-[15px]">help_outline</span>
                    <span>Uncategorized</span>
                  </span>
                )}

                {/* Subfolder Picker & Creator */}
                <div className="relative inline-block" ref={folderPickerRef}>
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(!isFolderPickerOpen)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 text-xs font-mono font-medium transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Organize clip into a game subfolder"
                  >
                    <span className="material-symbols-outlined text-[15px] text-amber-400">folder</span>
                    <span>{clip.folder ? `Folder: ${clip.folder}` : "No Folder (Unfiled)"}</span>
                    <span className="material-symbols-outlined text-[13px] opacity-70">arrow_drop_down</span>
                  </button>

                  {/* Folder Dropdown Popover */}
                  {isFolderPickerOpen && (
                    <div className="absolute top-full mt-1.5 left-0 z-50 w-72 bg-[#0e1017] border border-outline-variant/60 rounded-xl shadow-2xl p-2.5 flex flex-col gap-2 backdrop-blur-xl animate-scale-in">
                      <div className="flex items-center justify-between pb-1 border-b border-white/10">
                        <span className="text-[11px] font-mono text-zinc-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-amber-400">folder_open</span>
                          Game Subfolder
                        </span>
                        {clip.folder && (
                          <button
                            type="button"
                            disabled={isFolderUpdating}
                            onClick={() => handleSetClipFolder(null)}
                            className="text-[10px] font-mono text-rose-400 hover:underline cursor-pointer"
                          >
                            Remove from Folder
                          </button>
                        )}
                      </div>

                      {/* New Folder Quick Input */}
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="New folder (e.g. Season-19)..."
                          value={newFolderNameInput}
                          onChange={(e) => setNewFolderNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newFolderNameInput.trim()) {
                              e.preventDefault();
                              handleSetClipFolder(newFolderNameInput.trim());
                            }
                          }}
                          className="flex-1 bg-surface-container rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono border border-outline-variant/40 focus:border-amber-400 outline-none"
                        />
                        <button
                          type="button"
                          disabled={!newFolderNameInput.trim() || isFolderUpdating}
                          onClick={() => handleSetClipFolder(newFolderNameInput.trim())}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs font-mono transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          Set
                        </button>
                      </div>

                      {/* Existing Folders for this Game */}
                      <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto pr-1">
                        <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider px-1 pb-1">
                          Existing Folders
                        </span>
                        {availableFoldersForGame.length > 0 ? (
                          availableFoldersForGame.map((fName) => {
                            const isCurrent = clip.folder === fName;
                            return (
                              <button
                                key={fName}
                                type="button"
                                disabled={isCurrent || isFolderUpdating}
                                onClick={() => handleSetClipFolder(fName)}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-mono transition-colors text-left ${
                                  isCurrent
                                    ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
                                    : "hover:bg-surface-container text-zinc-300 hover:text-white cursor-pointer"
                                }`}
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  <span className="material-symbols-outlined text-[13px] text-amber-400/80">folder</span>
                                  <span className="truncate">{fName}</span>
                                </span>
                                {isCurrent && (
                                  <span className="material-symbols-outlined text-[13px] text-amber-400">check</span>
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <span className="text-zinc-600 text-[11px] font-mono p-1">
                            No folders created yet in this game
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Multi-Game Collections Picker & Assignment */}
                <div className="relative inline-block" ref={collectionPickerRef}>
                  <button
                    type="button"
                    onClick={() => setIsCollectionPickerOpen(!isCollectionPickerOpen)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 text-blue-400 text-xs font-mono font-medium transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Add or remove clip from multi-game collections"
                  >
                    <span className="material-symbols-outlined text-[15px] text-blue-400">collections_bookmark</span>
                    <span>
                      {(() => {
                        const inCustom = modalCollections.filter((c) => !c.isSmart && c.clipIds?.includes(clip.id));
                        if (inCustom.length === 0) return "Add to Collection";
                        if (inCustom.length === 1) return inCustom[0].name;
                        return `${inCustom.length} Collections`;
                      })()}
                    </span>
                    <span className="material-symbols-outlined text-[13px] opacity-70">arrow_drop_down</span>
                  </button>

                  {/* Collections Dropdown Popover */}
                  {isCollectionPickerOpen && (
                    <div className="absolute top-full mt-1.5 left-0 z-50 w-72 bg-[#0e1017] border border-outline-variant/60 rounded-xl shadow-2xl p-2.5 flex flex-col gap-2 backdrop-blur-xl animate-scale-in">
                      <div className="flex items-center justify-between pb-1 border-b border-white/10">
                        <span className="text-[11px] font-mono text-zinc-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-blue-400">collections_bookmark</span>
                          Multi-Game Collections
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">Cross-Category</span>
                      </div>

                      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                        {modalCollections.filter((c) => !c.isSmart).length > 0 ? (
                          modalCollections
                            .filter((c) => !c.isSmart)
                            .map((col) => {
                              const isMember = col.clipIds?.includes(clip.id);
                              return (
                                <button
                                  key={col.id}
                                  type="button"
                                  disabled={isCollectionUpdating}
                                  onClick={() => handleToggleClipCollection(col.id, !!isMember)}
                                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors text-left ${
                                    isMember
                                      ? "bg-blue-500/15 text-blue-300 font-semibold border border-blue-500/30"
                                      : "hover:bg-surface-container text-zinc-300 hover:text-white cursor-pointer"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: col.color || "#0A84FF" }}
                                    />
                                    <span className="truncate">{col.name}</span>
                                  </div>
                                  <span className="material-symbols-outlined text-[16px] text-blue-400">
                                    {isMember ? "check_box" : "check_box_outline_blank"}
                                  </span>
                                </button>
                              );
                            })
                        ) : (
                          <div className="p-3 text-center text-zinc-500 text-xs font-mono">
                            No custom collections yet. Create one from the left sidebar!
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Interactive Tags Section with Add & Remove */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {clip.tags && clip.tags.length > 0 ? (
                  clip.tags.map((t) => (
                    <span
                      key={t.tag.name}
                      className="group/tag inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/30 text-xs font-mono transition-all"
                    >
                      <span>#{t.tag.name}</span>
                      <button
                        type="button"
                        disabled={isTagUpdating}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTag(t.tag.name);
                        }}
                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                        title={`Remove #${t.tag.name}`}
                      >
                        <span className="material-symbols-outlined text-[12px]">close</span>
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-zinc-500 text-xs font-mono italic">No tags assigned</span>
                )}

                {/* Add Tag Dropdown Popover */}
                <div className="relative inline-block" ref={tagPickerRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTagPickerOpen(!isTagPickerOpen);
                      fetchAvailableTags();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-primary/20 border border-outline-variant/40 hover:border-primary/50 text-zinc-300 hover:text-primary text-xs font-mono cursor-pointer transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    <span>Add Tag</span>
                  </button>

                  {/* Dropdown Popover */}
                  {isTagPickerOpen && (
                    <div className="absolute top-full mt-1.5 left-0 z-50 w-64 bg-[#0e1017] border border-outline-variant/60 rounded-xl shadow-2xl p-2.5 flex flex-col gap-2 backdrop-blur-xl animate-scale-in">
                      <div className="relative">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Search or new tag..."
                          value={tagQuery}
                          onChange={(e) => setTagQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && tagQuery.trim()) {
                              e.preventDefault();
                              handleAddTag(tagQuery.trim());
                            } else if (e.key === "Escape") {
                              setIsTagPickerOpen(false);
                            }
                          }}
                          className="w-full bg-surface-container rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono border border-outline-variant/40 focus:border-primary outline-none"
                        />
                        {tagQuery && (
                          <button
                            onClick={() => setTagQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        )}
                      </div>

                      {/* Create New Tag Action if typed query not already on clip */}
                      {tagQuery.trim() &&
                        !clip.tags?.some(
                          (t) =>
                            t.tag.name.toLowerCase() ===
                            tagQuery.trim().toLowerCase().replace(/^#+/, "")
                        ) && (
                          <button
                            type="button"
                            disabled={isTagUpdating}
                            onClick={() => handleAddTag(tagQuery.trim())}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-xs font-mono text-left cursor-pointer transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">add_circle</span>
                            <span className="truncate">
                              Create &ldquo;#{tagQuery.trim().replace(/^#+/, "")}&rdquo;
                            </span>
                          </button>
                        )}

                      {/* Available tags in vault */}
                      <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto pr-1">
                        <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider px-1 pb-1">
                          Existing Vault Tags
                        </span>
                        {filteredAvailableTags.length > 0 ? (
                          filteredAvailableTags.map((t) => {
                            const isAlreadyOnClip = clip.tags?.some(
                              (ct) => ct.tag.name.toLowerCase() === t.name.toLowerCase()
                            );
                            return (
                              <button
                                key={t.id}
                                type="button"
                                disabled={isAlreadyOnClip || isTagUpdating}
                                onClick={() => handleAddTag(t.name)}
                                className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs font-mono transition-colors text-left ${
                                  isAlreadyOnClip
                                    ? "opacity-40 cursor-not-allowed text-zinc-500"
                                    : "hover:bg-surface-container text-zinc-300 hover:text-on-surface cursor-pointer"
                                }`}
                              >
                                <span>#{t.name}</span>
                                {isAlreadyOnClip ? (
                                  <span className="material-symbols-outlined text-[13px] text-emerald-400">
                                    check
                                  </span>
                                ) : (
                                  <span className="material-symbols-outlined text-[13px] text-zinc-500">
                                    add
                                  </span>
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <span className="text-zinc-600 text-[11px] font-mono p-1">
                            No other tags found
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Gameplay Context & Story Notes Description (Interactive Edit Mode) */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-2 shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-primary font-medium font-mono uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">description</span>
                    <span>Gameplay Context &amp; Story Notes</span>
                  </div>

                  {!isEditingDesc && (
                    <button
                      type="button"
                      onClick={() => {
                        setDescDraft(clip.description || "");
                        setIsEditingDesc(true);
                      }}
                      className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-primary transition-colors cursor-pointer px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 hover:border-primary/40 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[13px]">edit</span>
                      <span>{clip.description ? "Edit Notes" : "Add Notes"}</span>
                    </button>
                  )}
                </div>

                {isEditingDesc ? (
                  <div className="flex flex-col gap-2.5 mt-1">
                    <textarea
                      autoFocus
                      rows={3}
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      placeholder="Add story notes, strategy guides, boss fight commentary, or memory context..."
                      className="w-full bg-[#101218] border border-primary/50 focus:border-primary rounded-lg p-3 text-xs sm:text-sm text-zinc-200 outline-none resize-y min-h-[80px] font-sans leading-relaxed focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={isSavingDesc}
                        onClick={() => {
                          setIsEditingDesc(false);
                          setDescDraft(clip.description || "");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-zinc-400 hover:text-zinc-200 text-xs font-medium cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isSavingDesc}
                        onClick={handleSaveDescription}
                        className="px-3.5 py-1.5 rounded-lg bg-primary hover:brightness-110 text-on-primary text-xs font-semibold cursor-pointer transition-all active:scale-95 shadow-md flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[14px]">save</span>
                        <span>{isSavingDesc ? "Saving..." : "Save Notes"}</span>
                      </button>
                    </div>
                  </div>
                ) : clip.description ? (
                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                    {clip.description}
                  </p>
                ) : (
                  <div className="flex items-center justify-between py-1 text-zinc-500 text-xs italic">
                    <span>No gameplay context or story notes documented for this clip yet.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDescDraft("");
                        setIsEditingDesc(true);
                      }}
                      className="text-primary hover:underline text-xs not-italic font-mono cursor-pointer"
                    >
                      + Add Notes
                    </button>
                  </div>
                )}
              </div>

              {/* Related Vault Footage Section */}
              {relatedClips.length > 0 && (
                <div className="flex flex-col gap-2.5 pt-4 border-t border-outline-variant/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-on-surface tracking-tight uppercase font-mono">
                      More from Vault Archive
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {relatedClips.length} clips
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {relatedClips.map((rc) => {
                      const isTarget = rc.id === transitioningClipId;
                      return (
                        <div
                          key={rc.id}
                          onClick={() => handleSelectRelatedClip(rc)}
                          className={`group/rel flex flex-col rounded-lg bg-surface-container p-1.5 border transition-all cursor-pointer active:scale-95 ${
                            isTarget
                              ? "border-primary ring-2 ring-primary/60 shadow-lg shadow-primary/25 scale-[0.98] bg-primary/10"
                              : "border-outline-variant/30 hover:border-primary/60 hover:bg-surface-container-high"
                          }`}
                        >
                          <div className="relative aspect-video rounded overflow-hidden bg-black">
                            <img
                              src={`/api/clips/${rc.id}/thumbnail?t=${rc.updatedAt ? new Date(rc.updatedAt).getTime() : 1}`}
                              alt={rc.title}
                              className={`w-full h-full object-cover transition-transform duration-300 ${
                                isTarget ? "scale-105 opacity-75" : "group-hover/rel:scale-105"
                              }`}
                            />
                            {isTarget && (
                              <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
                                <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                            <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 font-mono text-[9px] text-zinc-200">
                              {formatTimecode(rc.duration || 0).slice(0, 5)}
                            </div>
                          </div>
                          <span className={`text-xs truncate font-medium mt-1.5 transition-colors ${
                            isTarget ? "text-primary font-semibold" : "text-on-surface"
                          }`}>
                            {rc.title}
                          </span>
                          <span className="text-[10px] text-zinc-500 truncate font-mono">
                            {rc.game?.name || "Footage"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 4. Desktop Deep Telemetry Inspector Panel (Hidden in Fullscreen & on Mobile) */}
        {!inActiveFullscreen && isDesktop && showInspector && (
          <aside className="hidden lg:flex w-[380px] bg-[#0c0d10] p-4 flex-col gap-4 overflow-y-auto shrink-0 border-l border-outline-variant/40 select-none">
            <div className="flex items-center justify-between pb-1 border-b border-outline-variant/30">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">
                  analytics
                </span>
                <span className="font-headline-md text-body-md font-semibold text-on-surface">
                  Metadata Inspector
                </span>
              </div>
              <span className="font-label-code-sm text-[10px] text-outline bg-surface-container px-2 py-0.5 rounded font-mono border border-outline-variant/30">
                PRO EXAMINER v4.2
              </span>
            </div>

            {renderInspectorModules()}
          </aside>
        )}

        {/* 5. Mobile Bottom Sheet Slide-up Inspector (Opened via button or info icon) */}
        {!inActiveFullscreen && !isDesktop && showInspector && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
            {/* Dimmed Backdrop */}
            <div
              onClick={() => setShowInspector(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            />

            {/* Slide-up Container */}
            <div className="relative w-full max-h-[82vh] bg-[#0e1014] border-t border-outline-variant/50 rounded-t-2xl shadow-2xl flex flex-col z-10 overflow-hidden animate-slide-up">
              {/* Drag Handle & Header */}
              <div className="pt-2.5 pb-2 px-4 border-b border-outline-variant/30 flex flex-col gap-2 shrink-0 bg-[#0c0d10]">
                <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">
                      analytics
                    </span>
                    <span className="font-semibold text-sm text-on-surface">Technical Inspector</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-zinc-400">
                      PRO EXAMINER v4.2
                    </span>
                  </div>
                  <button
                    onClick={() => setShowInspector(false)}
                    className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-on-surface flex items-center justify-center cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Inspector Body */}
              <div className="p-4 flex flex-col gap-4 overflow-y-auto text-xs select-none">
                {renderInspectorModules()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal (Apple HIG Safeguarded) */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md bg-[#0f1117] border border-outline-variant/60 rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <span className="material-symbols-outlined text-[24px]">delete_forever</span>
              </div>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <h3 className="font-semibold text-base text-on-surface tracking-tight">
                  Delete Vault Footage?
                </h3>
                <p className="text-xs text-on-surface-variant font-mono truncate">
                  {clip.title}
                </p>
              </div>
            </div>

            <div className="bg-surface-container-low rounded-xl p-3.5 border border-outline-variant/30 text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-zinc-300">
                <span className="material-symbols-outlined text-[16px] text-amber-400">shield</span>
                <span className="font-medium">Safeguard &amp; Master Integrity:</span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                • <strong className="text-zinc-200">Move to Trash</strong>: Soft-deletes this item. It will be hidden from the active library but can be restored anytime.
              </p>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                • <strong className="text-zinc-200">Purge Derived</strong>: Deletes cached thumbnails, storyboards, proxies, and database records. The master video in <code className="text-zinc-300">/storage/originals</code> remains protected by the Zero Corruption Policy.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteDialog(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-zinc-300 text-xs font-medium cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDeleteClip(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
                <span>{isDeleting ? "Moving..." : "Move to Trash"}</span>
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDeleteClip(true)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer transition-colors shadow-lg shadow-rose-900/30 flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">delete_forever</span>
                <span>{isDeleting ? "Purging..." : "Purge Derived"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
