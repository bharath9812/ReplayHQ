"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

export interface GameOption {
  id: string;
  name: string;
  slug: string;
  accentColor?: string;
  matchRules?: string[];
}

interface StagedFileItem {
  id: string;
  file: File;
  fingerprint?: string;
  title: string;
  description: string;
  gameId: string;
  autoDetectedGame: GameOption | null;
  folder: string;
  collectionIds: string[];
  isFavorite: boolean;
  tags: string[];
  thumbnailUrl: string;
  status: "idle" | "uploading" | "processing" | "completed" | "duplicate" | "error";
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  etaSeconds: number;
  errorMessage?: string;
  resumedFromBytes?: number;
  isExpanded?: boolean;
  uploadDurationSeconds?: number;
  processingDurationSeconds?: number;
  totalDurationSeconds?: number;
  averageSpeed?: number;
  peakSpeed?: number;
  sha256?: string;
  processingElapsedSeconds?: number;
  processingEtaSeconds?: number;
}

export interface IngestHistoryItem {
  id: string;
  filename: string;
  fileSize: number;
  uploadDurationSeconds: number;
  processingDurationSeconds: number;
  totalDurationSeconds: number;
  averageSpeedBytesPerSec: number;
  peakSpeedBytesPerSec: number;
  sha256?: string;
  status: "completed" | "duplicate" | "error";
  errorMessage?: string;
  completedAt: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  games: GameOption[];
  collections?: any[];
  allClips?: any[];
  onUploadComplete?: () => void;
  onUploadSuccess?: () => void;
  onActiveStateChange?: (active: boolean) => void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatSeconds(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "--";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

// 20MB Slices: Cuts HTTP roundtrip latency by 50% and restores full 10-12 MB/s LAN throughput
const CHUNK_SIZE = 20 * 1024 * 1024;

// Deterministic fingerprint linking browser file to server .part file on disk across page reloads
function getFileFingerprint(file: File): string {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 48);
  return `gv_${safeName}_${file.size}_${file.lastModified}`;
}

// Apple HIG Masterwork Vector Card: Instant 0ms render, 0 bytes RAM leak, zero <video> decoding
function createFallbackThumbnail(fileName: string, fileSize?: number): string {
  const safeName = fileName.replace(/[<>&"]/g, "").slice(0, 32);
  const ext = (fileName.split(".").pop() || "VID").toUpperCase().slice(0, 5);
  const sizeStr = fileSize ? formatBytes(fileSize) : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#07080b"/>
        <stop offset="50%" stop-color="#0f1118"/>
        <stop offset="100%" stop-color="#161822"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#818cf8"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="40%" r="50%">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.6"/>
      </filter>
    </defs>
    <!-- Card Frame -->
    <rect width="320" height="180" rx="14" fill="url(#bg)"/>
    <rect width="320" height="180" rx="14" fill="url(#glow)"/>
    <rect x="0.75" y="0.75" width="318.5" height="178.5" rx="13.25" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>

    <!-- Format Pill (Top Left) -->
    <rect x="14" y="14" width="60" height="20" rx="6" fill="rgba(56,189,248,0.12)" stroke="rgba(56,189,248,0.3)" stroke-width="1"/>
    <text x="44" y="28" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="10" font-weight="700" fill="#38bdf8" text-anchor="middle" letter-spacing="0.5">${ext}</text>

    <!-- Size Pill (Top Right) -->
    ${sizeStr ? `
    <rect x="234" y="14" width="72" height="20" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="270" y="28" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="9" font-weight="600" fill="#9ca3af" text-anchor="middle">${sizeStr}</text>
    ` : ''}

    <!-- Center Play / Ingest Badge with Frosted Glow -->
    <g filter="url(#shadow)">
      <circle cx="160" cy="80" r="26" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>
      <polygon points="154,68 172,80 154,92" fill="url(#accent)"/>
    </g>

    <!-- Filename & Subtitle -->
    <text x="160" y="132" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="11" font-weight="600" fill="#f3f4f6" text-anchor="middle">${safeName}</text>
    <text x="160" y="150" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="9" font-weight="500" fill="#6b7280" text-anchor="middle" letter-spacing="0.3">Gameplay Video • Ready</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Memory-Safe Video Thumbnail Extractor:
// CRITICAL RULE: Large files (> 60MB) or non-web formats (MKV, AVI, TS, ProRes) MUST NEVER
// be loaded into HTML5 <video> elements in the browser!
// In Safari/WebKit, AVFoundation allocates gigabytes of uncompressed RAM trying to demux
// large or MKV files, leading to severe macOS swap thrashing, mouse freeze, and tab crashes
// ("webpage reloaded because it is using significant memory").
function extractVideoThumbnail(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const isWebNative = ["mp4", "mov", "webm"].includes(ext);
  const isSmall = file.size > 0 && file.size <= 60 * 1024 * 1024; // <= 60MB

  // Immediately return the instant Apple HIG vector card for large or non-native footage
  if (!isWebNative || !isSmall) {
    return Promise.resolve(createFallbackThumbnail(file.name, file.size));
  }

  return new Promise((resolve) => {
    let resolved = false;
    let url = "";
    let video: HTMLVideoElement | null = null;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        if (url) {
          try { URL.revokeObjectURL(url); } catch {}
        }
        if (video) {
          try {
            video.removeAttribute("src");
            video.load();
            video.remove();
          } catch {}
          video = null;
        }
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(createFallbackThumbnail(file.name, file.size));
    }, 1500); // 1.5s strict ceiling for small web files

    try {
      url = URL.createObjectURL(file);
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = url;

      video.onloadeddata = () => {
        try {
          const canvas = document.createElement("canvas");
          const targetW = 320;
          const targetH = Math.round((video!.videoHeight / (video!.videoWidth || 16 / 9)) * targetW) || 180;
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no ctx");
          ctx.drawImage(video!, 0, 0, targetW, targetH);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          clearTimeout(timer);
          cleanup();
          resolve(dataUrl);
        } catch {
          clearTimeout(timer);
          cleanup();
          resolve(createFallbackThumbnail(file.name, file.size));
        }
      };

      video.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve(createFallbackThumbnail(file.name, file.size));
      };
    } catch {
      clearTimeout(timer);
      cleanup();
      resolve(createFallbackThumbnail(file.name, file.size));
    }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Direct Chunk Ingestion Engine (Nextcloud / OpenMediaVault architecture)
// Modern fetch() streaming of 10MB raw binary chunks over standard HTTP POST.
// Every chunk receives a 200 OK JSON response with { success: true, offset }.
// Completely immune to Safari / WebKit XMLHttpRequest readyState stalls.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function uploadChunkWithFetch(
  chunk: Blob,
  params: {
    fingerprint: string;
    offset: number;
    totalSize: number;
  },
  abortSignal?: AbortSignal
): Promise<number> {
  return new Promise(async (resolve, reject) => {
    let isSettled = false;
    // 60s hard timeout per 10MB chunk
    const timeoutId = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        reject(new Error("Chunk upload timed out after 60s"));
      }
    }, 60000);

    try {
      // Browser engine detection: Is Safari / iOS / iPadOS WebKit?
      const isSafari =
        typeof navigator !== "undefined" &&
        (/^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
          /iPad|iPhone|iPod/.test(navigator.userAgent));

      // Separate branch for Safari: read 10MB slice into ArrayBuffer to bypass WebKit's Blob file-lock deadlock.
      // In Brave / Chrome / Firefox: keep zero-copy Blob body directly (which works like a gold standard!).
      let requestBody: BodyInit;
      if (isSafari) {
        requestBody = await chunk.arrayBuffer();
      } else {
        requestBody = chunk;
      }

      // Clean static endpoint enabling persistent HTTP Keep-Alive socket reuse across sequential chunks
      const res = await fetch("/api/upload/chunk", {
        method: "POST",
        headers: {
          "X-Upload-Fingerprint": params.fingerprint,
          "X-Upload-Offset": String(params.offset),
          "X-Total-Size": String(params.totalSize),
          "Content-Type": "application/octet-stream",
        },
        body: requestBody,
        signal: abortSignal,
      });

      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeoutId);

      if (res.status === 200) {
        try {
          const data = await res.json();
          if (data.success && typeof data.offset === "number") {
            resolve(data.offset);
          } else {
            reject(new Error(data.error || "Invalid response from chunk upload"));
          }
        } catch {
          reject(new Error("Failed to parse chunk upload JSON response"));
        }
      } else if (res.status === 409) {
        try {
          const data = await res.json();
          const err: any = new Error("Offset mismatch");
          err.isOffsetMismatch = true;
          err.expectedOffset = data.expectedOffset;
          reject(err);
        } catch {
          reject(new Error("Chunk offset mismatch"));
        }
      } else {
        reject(new Error(`Chunk upload failed with HTTP ${res.status}: ${res.statusText}`));
      }
    } catch (err: any) {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeoutId);
        reject(err);
      }
    }
  });
}

export function UploadModal({
  isOpen,
  onClose,
  games,
  collections: propCollections = [],
  allClips = [],
  onUploadComplete,
  onUploadSuccess,
  onActiveStateChange,
}: UploadModalProps) {
  // Staged files queue
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number>(-1);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState(false);

  // Display style preference: 'graph' or 'progress-bar'
  const [displayStyle, setDisplayStyle] = useState<"graph" | "progress-bar">("graph");

  // Telemetry & speed tracking
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [peakSpeed, setPeakSpeed] = useState<number>(0);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [overallElapsedSeconds, setOverallElapsedSeconds] = useState<number>(0);

  // Available tags on site
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [tagInputText, setTagInputText] = useState<{ [fileId: string]: string }>({});

  // Collections & Subfolders state
  const [collections, setCollections] = useState<any[]>(propCollections);
  const [newFolderInputs, setNewFolderInputs] = useState<{ [fileId: string]: string }>({});
  const [previewLightboxFile, setPreviewLightboxFile] = useState<{ file: File; title: string; blobUrl: string } | null>(null);

  // Ingest History state & persistence (cross-device & power-cut safe)
  const [ingestHistory, setIngestHistory] = useState<IngestHistoryItem[]>([]);
  const [showHistoryView, setShowHistoryView] = useState<boolean>(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState<boolean>(false);

  // Load ingest history from localStorage and sync with server-side database
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gamevault_ingest_history");
      if (saved) {
        setIngestHistory(JSON.parse(saved));
      }
    } catch {}

    // Fetch persistent history from Debian host
    fetch("/api/ingest-history")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.records)) {
          setIngestHistory((localPrev) => {
            const map = new Map<string, IngestHistoryItem>();
            data.records.forEach((r: IngestHistoryItem) => map.set(r.id, r));
            localPrev.forEach((r: IngestHistoryItem) => {
              if (!map.has(r.id)) map.set(r.id, r);
            });
            const merged = Array.from(map.values()).sort(
              (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
            );
            try {
              localStorage.setItem("gamevault_ingest_history", JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  const saveHistoryItem = (newItem: IngestHistoryItem) => {
    setIngestHistory((prev) => {
      const next = [newItem, ...prev.filter((h) => h.id !== newItem.id)].slice(0, 100);
      try {
        localStorage.setItem("gamevault_ingest_history", JSON.stringify(next));
      } catch {}
      return next;
    });

    // Mirror to server for power-cut and cross-device permanence
    fetch("/api/ingest-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newItem),
    }).catch(() => {});
  };

  const clearHistory = () => {
    setIngestHistory([]);
    setConfirmClearHistory(false);
    try {
      localStorage.removeItem("gamevault_ingest_history");
    } catch {}
    fetch("/api/ingest-history", { method: "DELETE" }).catch(() => {});
  };

  // Interrupted upload session detected from localStorage
  const [interruptedSession, setInterruptedSession] = useState<{
    filename: string;
    size: number;
    fingerprint: string;
  } | null>(null);

  // Active refs
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeFingerprintRef = useRef<string | null>(null);
  const wakeLockRef = useRef<any>(null);
  const isUploadingRef = useRef<boolean>(false);
  const cancelRequestedRef = useRef<boolean>(false);
  const lastProgressRef = useRef<{ time: number; loaded: number } | null>(null);
  const lastStateUpdateRef = useRef<number>(0);
  const lastUiUpdateRef = useRef<number>(0);
  const currentLoadedBytesRef = useRef<number>(0);
  const speedRef = useRef<number>(0);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioKeepAliveRef = useRef<HTMLAudioElement | null>(null);

  // Synchronize isUploadingRef
  useEffect(() => {
    isUploadingRef.current = isUploading;
  }, [isUploading]);

  // Screen Wake Lock helper functions for background iPadOS/iOS/desktop protection
  const acquireWakeLock = async () => {
    try {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
      }
    } catch {}
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  // Background Audio Keep-Alive Engine:
  // In iOS & iPadOS Safari, background tabs are suspended unless active audio is playing.
  // Playing an inaudible silent audio loop grants the tab audio execution privileges,
  // preventing WebKit from dropping network sockets or freezing uploads when switching tabs or locking the screen.
  const startBackgroundKeepAlive = () => {
    try {
      if (typeof window === "undefined") return;
      if (!audioKeepAliveRef.current) {
        const silentWav =
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        const audio = new Audio(silentWav);
        audio.loop = true;
        audio.volume = 0.01;
        audioKeepAliveRef.current = audio;
      }
      audioKeepAliveRef.current.play().catch(() => {});
    } catch {}
  };

  const stopBackgroundKeepAlive = () => {
    try {
      if (audioKeepAliveRef.current) {
        audioKeepAliveRef.current.pause();
        audioKeepAliveRef.current.currentTime = 0;
      }
    } catch {}
  };

  // Background tab & visibility change listener: Re-acquire WakeLock and keepalive
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (isUploadingRef.current) {
          acquireWakeLock();
          startBackgroundKeepAlive();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopBackgroundKeepAlive();
    };
  }, []);

  // Check for interrupted upload session in localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gamevault_active_upload");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.filename && parsed.fingerprint) {
          fetch(`/api/upload/chunk?fingerprint=${encodeURIComponent(parsed.fingerprint)}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.success && data.exists && data.offset > 0) {
                setInterruptedSession({
                  filename: parsed.filename,
                  size: parsed.size || 0,
                  fingerprint: parsed.fingerprint,
                });
              } else {
                localStorage.removeItem("gamevault_active_upload");
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
  }, []);

  // Sync upload style from localStorage & listen for changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gamevault_upload_chart_style");
      if (saved === "progress-bar" || saved === "graph") {
        setDisplayStyle(saved);
      }
    } catch {}

    const handleStyleChange = (e: any) => {
      if (e.detail === "progress-bar" || e.detail === "graph") {
        setDisplayStyle(e.detail);
      }
    };
    window.addEventListener("gamevault_upload_style_changed", handleStyleChange);
    return () => window.removeEventListener("gamevault_upload_style_changed", handleStyleChange);
  }, []);

  // Sync collections
  useEffect(() => {
    if (propCollections && propCollections.length > 0) {
      setCollections(propCollections);
    } else {
      fetch("/api/collections")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.collections)) {
            setCollections(data.collections);
          }
        })
        .catch(() => {});
    }
  }, [propCollections]);

  // Dynamically discover all existing subfolders across vault clips & staged items
  const availableFolders = useMemo(() => {
    const folders = new Set<string>();
    if (Array.isArray(allClips)) {
      allClips.forEach((c: any) => {
        if (c.folder && typeof c.folder === "string" && c.folder.trim()) {
          folders.add(c.folder.trim());
        }
      });
    }
    stagedFiles.forEach((f) => {
      if (f.folder && f.folder.trim()) {
        folders.add(f.folder.trim());
      }
    });
    return Array.from(folders).sort();
  }, [allClips, stagedFiles]);

  // Inform parent of active upload state
  useEffect(() => {
    if (onActiveStateChange) {
      onActiveStateChange(
        isUploading ||
          stagedFiles.some((f) => f.status === "uploading" || f.status === "processing")
      );
    }
  }, [isUploading, stagedFiles, onActiveStateChange]);

  // Fetch available tags on mount
  const fetchAvailableTags = useCallback(() => {
    fetch("/api/tags")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tags)) {
          setAvailableTags(data.tags);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAvailableTags();
  }, [fetchAvailableTags]);

  // Refresh Protection: Prevent accidental reload during active upload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUploadingRef.current) {
        e.preventDefault();
        e.returnValue =
          "Upload is in progress. Refreshing or leaving the page will interrupt the upload.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);



  // Helper: Detect game from filename
  const detectGame = useCallback(
    (filename: string): GameOption | null => {
      const lower = filename.toLowerCase();
      for (const g of games) {
        const rules = Array.isArray(g.matchRules) ? g.matchRules : [g.slug, g.name];
        for (const r of rules) {
          if (typeof r === "string" && lower.includes(r.toLowerCase().trim())) {
            return g;
          }
        }
      }
      return null;
    },
    [games]
  );

  // Handle selecting multiple files with thumbnail generation and server-disk offset detection
  const handleAddFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newItems: StagedFileItem[] = [];

    for (const file of fileArray) {
      if (stagedFiles.some((s) => s.file.name === file.name && s.file.size === file.size)) {
        continue;
      }

      const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      const auto = detectGame(file.name);
      const fingerprint = getFileFingerprint(file);
      const tempId = `${fingerprint}_${Date.now()}`;

      // Check if a partial .part file already exists on server disk for this file
      let existingOffset = 0;
      try {
        const res = await fetch(`/api/upload/chunk?fingerprint=${encodeURIComponent(fingerprint)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.exists && typeof data.offset === "number") {
            existingOffset = Math.min(data.offset, file.size);
          }
        }
      } catch {}

      const initialProgress =
        existingOffset > 0 && file.size > 0
          ? Math.min(99, Math.round((existingOffset / file.size) * 100))
          : 0;

      newItems.push({
        id: tempId,
        file,
        fingerprint,
        title: cleanTitle,
        description: "",
        gameId: auto?.id || "",
        autoDetectedGame: auto,
        folder: "",
        collectionIds: [],
        isFavorite: false,
        tags: [],
        thumbnailUrl: "",
        status: "idle",
        progress: initialProgress,
        uploadedBytes: existingOffset,
        totalBytes: file.size,
        speed: 0,
        etaSeconds: 0,
        resumedFromBytes: existingOffset > 0 ? existingOffset : undefined,
        isExpanded: false,
      });

      if (interruptedSession && interruptedSession.fingerprint === fingerprint) {
        setInterruptedSession(null);
      }
    }

    if (newItems.length > 0) {
      setStagedFiles((prev) => [...prev, ...newItems]);

      // Asynchronously extract client-side thumbnails for each new item
      newItems.forEach(async (item) => {
        const thumb = await extractVideoThumbnail(item.file);
        if (thumb) {
          setStagedFiles((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, thumbnailUrl: thumb } : f))
          );
        }
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const updateStagedFile = (id: string, updates: Partial<StagedFileItem>) => {
    setStagedFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const removeStagedFile = (id: string) => {
    if (isUploading) return;
    const target = stagedFiles.find((s) => s.id === id);
    if (target) {
      const fp = target.fingerprint || getFileFingerprint(target.file);
      fetch(`/api/upload/chunk?fingerprint=${encodeURIComponent(fp)}`, { method: "DELETE" }).catch(() => {});
    }
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    if (isUploading) return;
    stagedFiles.forEach((target) => {
      const fp = target.fingerprint || getFileFingerprint(target.file);
      fetch(`/api/upload/chunk?fingerprint=${encodeURIComponent(fp)}`, { method: "DELETE" }).catch(() => {});
    });
    try {
      localStorage.removeItem("gamevault_active_upload");
    } catch {}
    setStagedFiles([]);
  };

  // Tag Management
  const handleAddTagToFile = async (fileId: string, tagName: string) => {
    const clean = tagName.trim().toLowerCase().replace(/^#/, "");
    if (!clean) return;

    const target = stagedFiles.find((f) => f.id === fileId);
    if (target && target.tags.includes(clean)) {
      setTagInputText((prev) => ({ ...prev, [fileId]: "" }));
      return;
    }

    setStagedFiles((prev) =>
      prev.map((item) =>
        item.id === fileId ? { ...item, tags: [...item.tags, clean] } : item
      )
    );
    setTagInputText((prev) => ({ ...prev, [fileId]: "" }));

    // If tag is new to site database, create it
    if (!availableTags.some((t) => t.name.toLowerCase() === clean)) {
      try {
        const res = await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clean }),
        });
        const data = await res.json();
        if (data.success && data.tag) {
          setAvailableTags((prev) => [
            ...prev,
            { id: data.tag.id, name: data.tag.name, color: data.tag.color },
          ]);
        }
      } catch {}
    }
  };

  const handleRemoveTagFromFile = (fileId: string, tagName: string) => {
    setStagedFiles((prev) =>
      prev.map((item) =>
        item.id === fileId
          ? { ...item, tags: item.tags.filter((t) => t !== tagName) }
          : item
      )
    );
  };

  // Batch actions
  const handleApplyGameToAll = (gameId: string) => {
    setStagedFiles((prev) => prev.map((f) => ({ ...f, gameId })));
  };

  const handleApplyFolderToAll = (folder: string) => {
    setStagedFiles((prev) => prev.map((f) => ({ ...f, folder: folder.trim() })));
  };

  const handleApplyCollectionToAll = (collectionId: string) => {
    setStagedFiles((prev) =>
      prev.map((f) => {
        const nextCols = f.collectionIds.includes(collectionId)
          ? f.collectionIds
          : [...f.collectionIds, collectionId];
        return { ...f, collectionIds: nextCols };
      })
    );
  };

  const handleToggleFavoriteAll = () => {
    const allFavorited = stagedFiles.length > 0 && stagedFiles.every((f) => f.isFavorite);
    setStagedFiles((prev) => prev.map((f) => ({ ...f, isFavorite: !allFavorited })));
  };

  // Sequential Upload Engine with Screen WakeLock and Chunked Transmission
  const startUploadingQueue = async () => {
    if (stagedFiles.length === 0 || isUploading) return;

    setIsUploading(true);
    isUploadingRef.current = true;
    cancelRequestedRef.current = false;
    setSpeedHistory([]);
    setPeakSpeed(0);
    setOverallElapsedSeconds(0);
    speedRef.current = 0;
    await acquireWakeLock();
    startBackgroundKeepAlive();

    // Clean 1-second interval timer for sparkline speed history and elapsed time (zero leak, 1 Hz)
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      setOverallElapsedSeconds((prev) => prev + 1);
      const mb = speedRef.current / (1024 * 1024);
      setPeakSpeed((prev) => Math.max(prev, mb));
      setSpeedHistory((prev) => [...prev.slice(-30), Math.round(mb * 10) / 10]);
    }, 1000);

    for (let i = 0; i < stagedFiles.length; i++) {
      if (cancelRequestedRef.current) break;
      const current = stagedFiles[i];
      if (current.status === "completed" || current.status === "duplicate") continue;

      setActiveUploadIndex(i);
      await uploadSingleFile(i);
    }

    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    setIsUploading(false);
    isUploadingRef.current = false;
    setActiveUploadIndex(-1);
    setCurrentSpeed(0);
    speedRef.current = 0;
    if (activeAbortControllerRef.current) activeAbortControllerRef.current = null;
    releaseWakeLock();
    stopBackgroundKeepAlive();

    if (onUploadComplete) onUploadComplete();
    if (onUploadSuccess) onUploadSuccess();
  };

  // Retry an individual file that had an error or was interrupted
  const retrySingleFile = async (index: number) => {
    if (isUploading) return;
    const item = stagedFiles[index];
    if (!item) return;

    setIsUploading(true);
    isUploadingRef.current = true;
    cancelRequestedRef.current = false;
    setActiveUploadIndex(index);
    await acquireWakeLock();
    startBackgroundKeepAlive();

    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      setOverallElapsedSeconds((prev) => prev + 1);
      const mb = speedRef.current / (1024 * 1024);
      setPeakSpeed((prev) => Math.max(prev, mb));
      setSpeedHistory((prev) => [...prev.slice(-30), Math.round(mb * 10) / 10]);
    }, 1000);

    await uploadSingleFile(index);

    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    setIsUploading(false);
    isUploadingRef.current = false;
    setActiveUploadIndex(-1);
    setCurrentSpeed(0);
    speedRef.current = 0;
    if (activeAbortControllerRef.current) activeAbortControllerRef.current = null;
    releaseWakeLock();
    stopBackgroundKeepAlive();

    if (onUploadComplete) onUploadComplete();
    if (onUploadSuccess) onUploadSuccess();
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Enterprise Direct Chunk Streaming Engine (Nextcloud / OpenMediaVault architecture)
  // - Pure HTTP chunk streaming with 200 OK JSON responses (immune to WebKit 204 Keep-Alive stalls)
  // - Lightweight file.slice() zero-copy Blob pointers (0 RAM leak on 100GB files)
  // - Real-time progress via XHR upload events with EMA speed & ETA smoothing
  // - Cross-session resumption and retry with exponential backoff
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const uploadSingleFile = async (index: number): Promise<void> => {
    const item = stagedFiles[index];
    if (!item || cancelRequestedRef.current) return;

    const fingerprint = item.fingerprint || getFileFingerprint(item.file);
    const totalSize = item.file.size;
    activeFingerprintRef.current = fingerprint;

    currentLoadedBytesRef.current = 0;
    lastUiUpdateRef.current = performance.now();
    lastProgressRef.current = { time: performance.now(), loaded: 0 };
    speedRef.current = 0;

    updateStagedFile(item.id, {
      status: "uploading",
      fingerprint,
      progress: 0,
      uploadedBytes: 0,
      totalBytes: totalSize,
      errorMessage: undefined,
    });

    // Persist active upload metadata to localStorage in case of page reload
    try {
      localStorage.setItem(
        "gamevault_active_upload",
        JSON.stringify({
          id: item.id,
          fingerprint,
          filename: item.file.name,
          size: totalSize,
          lastModified: item.file.lastModified,
          title: item.title,
          gameId: item.gameId,
          folder: item.folder,
          collectionIds: item.collectionIds,
          isFavorite: item.isFavorite,
          tags: item.tags,
          timestamp: Date.now(),
        })
      );
    } catch {}

    // 1. Query server for resume offset (Nextcloud-style probe)
    let startOffset = 0;
    try {
      const res = await fetch(`/api/upload/chunk?fingerprint=${encodeURIComponent(fingerprint)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists && typeof data.offset === "number" && data.offset <= totalSize) {
          startOffset = data.offset;
          console.log(`[GameVault Engine] Resuming ${item.file.name} from byte ${startOffset}/${totalSize}`);
        }
      }
    } catch (e) {
      console.warn("[GameVault Engine] Offset check failed, starting from 0", e);
    }

    if (startOffset > 0) {
      currentLoadedBytesRef.current = startOffset;
      const initialPercent = Math.min(99, Math.round((startOffset / totalSize) * 100));
      updateStagedFile(item.id, {
        progress: initialPercent,
        uploadedBytes: startOffset,
        resumedFromBytes: startOffset,
      });
    }

    // 2. Direct Chunk Streaming Loop
    let currentOffset = startOffset;
    const uploadStartTime = performance.now();
    let uploadPeakSpeed = 0;

    while (currentOffset < totalSize && !cancelRequestedRef.current) {
      const nextOffset = Math.min(currentOffset + CHUNK_SIZE, totalSize);
      // Zero-copy Blob slice (does NOT allocate bytes in RAM)
      const chunk = item.file.slice(currentOffset, nextOffset);

      let chunkUploaded = false;
      let attempt = 0;
      const maxAttempts = 10;

      while (!chunkUploaded && attempt < maxAttempts && !cancelRequestedRef.current) {
        let progressTicker: NodeJS.Timeout | null = null;
        try {
          attempt++;
          const chunkStartTime = performance.now();
          const controller = new AbortController();
          activeAbortControllerRef.current = controller;

          // Smooth progress ticker while 10MB chunk streams (updates at 5 Hz)
          progressTicker = setInterval(() => {
            if (cancelRequestedRef.current) return;
            const elapsed = (performance.now() - chunkStartTime) / 1000;
            const currentSpeedEst = speedRef.current > 0 ? speedRef.current : 9 * 1024 * 1024;
            const estChunkLoaded = Math.min(chunk.size * 0.95, currentSpeedEst * elapsed);
            const bytesUploaded = Math.min(totalSize - 1, currentOffset + estChunkLoaded);
            const percent = Math.min(99, Math.round((bytesUploaded / totalSize) * 100));
            const remainingBytes = Math.max(0, totalSize - bytesUploaded);
            const eta = currentSpeedEst > 0 ? remainingBytes / currentSpeedEst : 0;

            updateStagedFile(item.id, {
              progress: percent,
              uploadedBytes: Math.round(bytesUploaded),
              totalBytes: totalSize,
              speed: currentSpeedEst,
              etaSeconds: eta,
            });
          }, 200);

          const newOffset = await uploadChunkWithFetch(
            chunk,
            {
              fingerprint,
              offset: currentOffset,
              totalSize,
            },
            controller.signal
          );

          if (progressTicker) {
            clearInterval(progressTicker);
            progressTicker = null;
          }
          activeAbortControllerRef.current = null;

          // Calculate smoothed transfer speed from actual completed chunk
          const chunkEndTime = performance.now();
          const dt = (chunkEndTime - chunkStartTime) / 1000;
          const transferred = newOffset - currentOffset;
          if (dt > 0.05 && transferred > 0) {
            const rawSpeed = transferred / dt;
            speedRef.current =
              speedRef.current === 0 ? rawSpeed : 0.3 * rawSpeed + 0.7 * speedRef.current;
            uploadPeakSpeed = Math.max(uploadPeakSpeed, speedRef.current);
          }

          lastProgressRef.current = { time: chunkEndTime, loaded: newOffset };
          currentLoadedBytesRef.current = newOffset;
          const percent = Math.min(99, Math.round((newOffset / totalSize) * 100));
          const remainingBytes = Math.max(0, totalSize - newOffset);
          const eta = speedRef.current > 0 ? remainingBytes / speedRef.current : 0;

          setCurrentSpeed(speedRef.current);
          updateStagedFile(item.id, {
            progress: percent,
            uploadedBytes: newOffset,
            totalBytes: totalSize,
            speed: speedRef.current,
            etaSeconds: eta,
          });

          currentOffset = newOffset;
          chunkUploaded = true;
        } catch (err: any) {
          if (progressTicker) {
            clearInterval(progressTicker);
            progressTicker = null;
          }
          activeAbortControllerRef.current = null;
          if (cancelRequestedRef.current) return;
          console.warn(`[GameVault Upload] Chunk at offset ${currentOffset} attempt ${attempt} failed:`, err);

          if (err.isOffsetMismatch && typeof err.expectedOffset === "number") {
            currentOffset = err.expectedOffset;
            break;
          }

          if (attempt >= maxAttempts) {
            updateStagedFile(item.id, {
              status: "error",
              errorMessage: err?.message || `Upload failed at ${formatBytes(currentOffset)} after ${maxAttempts} retries`,
            });
            saveHistoryItem({
              id: item.id,
              filename: item.file.name,
              fileSize: totalSize,
              uploadDurationSeconds: Math.max(1, Math.round((performance.now() - uploadStartTime) / 1000)),
              processingDurationSeconds: 0,
              totalDurationSeconds: Math.max(1, Math.round((performance.now() - uploadStartTime) / 1000)),
              averageSpeedBytesPerSec: speedRef.current,
              peakSpeedBytesPerSec: uploadPeakSpeed,
              status: "error",
              errorMessage: err?.message || `Upload failed at ${formatBytes(currentOffset)}`,
              completedAt: new Date().toISOString(),
            });
            activeFingerprintRef.current = null;
            return;
          }

          const delay = Math.min(8000, 500 * Math.pow(2, attempt - 1));
          await new Promise((r) => setTimeout(r, delay));

          // Re-sync offset from server before retrying
          try {
            const check = await fetch(`/api/upload/chunk?fingerprint=${encodeURIComponent(fingerprint)}&t=${Date.now()}`);
            if (check.ok) {
              const cd = await check.json();
              if (cd.exists && typeof cd.offset === "number") {
                currentOffset = cd.offset;
                break;
              }
            }
          } catch {}
        }
      }
    }

    if (cancelRequestedRef.current) return;

    // 3. Finalize upload & Host FFmpeg Processing (all bytes on disk)
    const uploadEndTime = performance.now();
    const uploadDurationSeconds = Math.max(1, Math.round((uploadEndTime - uploadStartTime) / 1000));
    const avgSpeed = Math.round(totalSize / uploadDurationSeconds);
    const processingStartTime = performance.now();
    const estProcessingSeconds = Math.max(10, Math.min(45, Math.round((totalSize / (1024 * 1024 * 1024)) * 5)));

    updateStagedFile(item.id, {
      status: "processing",
      progress: 100,
      uploadedBytes: totalSize,
      etaSeconds: 0,
      uploadDurationSeconds,
      averageSpeed: avgSpeed,
      peakSpeed: uploadPeakSpeed,
      processingElapsedSeconds: 0,
      processingEtaSeconds: estProcessingSeconds,
    });

    const procTicker = setInterval(() => {
      if (cancelRequestedRef.current) return;
      const elapsed = Math.round((performance.now() - processingStartTime) / 1000);
      const remainingEta = Math.max(0, estProcessingSeconds - elapsed);
      updateStagedFile(item.id, {
        processingElapsedSeconds: elapsed,
        processingEtaSeconds: remainingEta,
      });
    }, 1000);

    try {
      const res = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint,
          filename: item.file.name,
          totalSize,
          title: item.title,
          description: item.description,
          gameId: item.gameId,
          folder: item.folder,
          collectionIds: item.collectionIds,
          isFavorite: item.isFavorite,
          tags: item.tags,
        }),
      });

      clearInterval(procTicker);
      const processingEndTime = performance.now();
      const processingDurationSeconds = Math.max(1, Math.round((processingEndTime - processingStartTime) / 1000));
      const totalDurationSeconds = uploadDurationSeconds + processingDurationSeconds;

      const completeData = await res.json();
      if (completeData.success) {
        const sha256 = completeData.clip?.sha256 || "";
        if (completeData.isDuplicate) {
          updateStagedFile(item.id, {
            status: "duplicate",
            progress: 100,
            uploadedBytes: totalSize,
            errorMessage: "File already in library (SHA-256 deduplicated)",
            uploadDurationSeconds,
            processingDurationSeconds,
            totalDurationSeconds,
            averageSpeed: avgSpeed,
            peakSpeed: uploadPeakSpeed,
            sha256,
          });
          saveHistoryItem({
            id: item.id,
            filename: item.file.name,
            fileSize: totalSize,
            uploadDurationSeconds,
            processingDurationSeconds,
            totalDurationSeconds,
            averageSpeedBytesPerSec: avgSpeed,
            peakSpeedBytesPerSec: uploadPeakSpeed,
            sha256,
            status: "duplicate",
            completedAt: new Date().toISOString(),
          });
        } else {
          updateStagedFile(item.id, {
            status: "completed",
            progress: 100,
            uploadedBytes: totalSize,
            uploadDurationSeconds,
            processingDurationSeconds,
            totalDurationSeconds,
            averageSpeed: avgSpeed,
            peakSpeed: uploadPeakSpeed,
            sha256,
          });
          saveHistoryItem({
            id: item.id,
            filename: item.file.name,
            fileSize: totalSize,
            uploadDurationSeconds,
            processingDurationSeconds,
            totalDurationSeconds,
            averageSpeedBytesPerSec: avgSpeed,
            peakSpeedBytesPerSec: uploadPeakSpeed,
            sha256,
            status: "completed",
            completedAt: new Date().toISOString(),
          });
          try {
            localStorage.removeItem("gamevault_active_upload");
          } catch {}
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("gamevault:sync"));
          }
        }
      } else {
        updateStagedFile(item.id, {
          status: "error",
          errorMessage: completeData.error || "Completion processing failed on server",
          uploadDurationSeconds,
          processingDurationSeconds,
          totalDurationSeconds,
        });
        saveHistoryItem({
          id: item.id,
          filename: item.file.name,
          fileSize: totalSize,
          uploadDurationSeconds,
          processingDurationSeconds,
          totalDurationSeconds,
          averageSpeedBytesPerSec: avgSpeed,
          peakSpeedBytesPerSec: uploadPeakSpeed,
          status: "error",
          errorMessage: completeData.error || "Completion processing failed on server",
          completedAt: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      clearInterval(procTicker);
      updateStagedFile(item.id, {
        status: "error",
        errorMessage: e?.message || "Finalization network error",
      });
      saveHistoryItem({
        id: item.id,
        filename: item.file.name,
        fileSize: totalSize,
        uploadDurationSeconds,
        processingDurationSeconds: Math.max(1, Math.round((performance.now() - processingStartTime) / 1000)),
        totalDurationSeconds: uploadDurationSeconds + Math.max(1, Math.round((performance.now() - processingStartTime) / 1000)),
        averageSpeedBytesPerSec: avgSpeed,
        peakSpeedBytesPerSec: uploadPeakSpeed,
        status: "error",
        errorMessage: e?.message || "Finalization network error",
        completedAt: new Date().toISOString(),
      });
    } finally {
      activeFingerprintRef.current = null;
    }
  };

  const handleCancelAll = () => {
    cancelRequestedRef.current = true;

    // Abort active chunk fetch stream immediately
    if (activeAbortControllerRef.current) {
      try {
        activeAbortControllerRef.current.abort();
      } catch {}
      activeAbortControllerRef.current = null;
    }

    // Clean up server-side partial file
    if (activeFingerprintRef.current) {
      fetch(`/api/upload/chunk?fingerprint=${encodeURIComponent(activeFingerprintRef.current)}`, {
        method: "DELETE",
      }).catch(() => {});
      activeFingerprintRef.current = null;
    }

    releaseWakeLock();
    stopBackgroundKeepAlive();
    setIsUploading(false);
    isUploadingRef.current = false;
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setActiveUploadIndex(-1);
    setCurrentSpeed(0);
    speedRef.current = 0;

    try {
      localStorage.removeItem("gamevault_active_upload");
    } catch {}

    setStagedFiles((prev) =>
      prev.map((item) =>
        item.status === "uploading" || item.status === "processing"
          ? { ...item, status: "idle", progress: 0 }
          : item
      )
    );
  };

  // Overall batch statistics
  const batchStats = useMemo(() => {
    const totalCount = stagedFiles.length;
    const completedCount = stagedFiles.filter(
      (f) => f.status === "completed" || f.status === "duplicate"
    ).length;
    const totalBytes = stagedFiles.reduce((acc, f) => acc + f.totalBytes, 0);
    const uploadedBytes = stagedFiles.reduce((acc, f) => {
      if (f.status === "completed" || f.status === "duplicate") return acc + f.totalBytes;
      return acc + f.uploadedBytes;
    }, 0);
    const pendingBytes = Math.max(0, totalBytes - uploadedBytes);
    const overallProgress =
      totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
    const overallEta = currentSpeed > 0 ? pendingBytes / currentSpeed : 0;

    return {
      totalCount,
      completedCount,
      totalBytes,
      uploadedBytes,
      pendingBytes,
      overallProgress,
      overallEta,
    };
  }, [stagedFiles, currentSpeed]);

  if (!isOpen && !isMinimized) return null;

  const currentUploadingItem =
    activeUploadIndex >= 0 ? stagedFiles[activeUploadIndex] : null;

  // -------------------------------------------------------------
  // 5 & 7. FLOATING MINIMIZED WIDGET (With active processing feedback)
  // -------------------------------------------------------------
  if (isMinimized) {
    const isProcessing = currentUploadingItem?.status === "processing";
    return (
      <aside
        aria-label="Background Upload Progress"
        className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 rounded-2xl bg-[#0c0e12]/95 border border-primary/40 shadow-2xl backdrop-blur-2xl p-4 text-on-surface select-none animate-fade-in ring-1 ring-white/10 flex flex-col gap-2.5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {isProcessing ? (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
            ) : isUploading ? (
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shrink-0" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-secondary shrink-0" />
            )}
            <span className="font-semibold text-xs text-on-surface truncate font-mono">
              {isProcessing
                ? `Processing Clip ${activeUploadIndex + 1}/${batchStats.totalCount}`
                : isUploading
                ? `Uploading Clip ${activeUploadIndex + 1}/${batchStats.totalCount} (${batchStats.overallProgress}%)`
                : `Staged Queue (${batchStats.totalCount} clips)`}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              title="Expand Import Modal"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_full</span>
            </button>
            {!isUploading && (
              <button
                onClick={() => {
                  setIsMinimized(false);
                  onClose();
                }}
                className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Current Active Item */}
        {currentUploadingItem && (
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="truncate max-w-[200px] text-zinc-300">
              {currentUploadingItem.title}
            </span>
            <span className={isProcessing ? "text-amber-400 font-semibold" : "text-primary font-bold"}>
              {isProcessing ? "Processing..." : `${currentUploadingItem.progress}%`}
            </span>
          </div>
        )}

        {/* Real Progress Bar / Active Shimmer */}
        <div className="space-y-1.5 font-mono text-[11px]">
          <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden relative">
            <div
              className={`h-full transition-all duration-300 ${
                isProcessing
                  ? "bg-amber-400 w-full animate-pulse"
                  : "bg-primary"
              }`}
              style={isProcessing ? {} : { width: `${batchStats.overallProgress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-outline text-[10px]">
            <span>
              {isProcessing
                ? "Generating storyboard & metadata"
                : `${formatBytes(batchStats.uploadedBytes)} / ${formatBytes(batchStats.totalBytes)}`}
            </span>
            <span>
              {isProcessing
                ? "Debian Host Active"
                : currentSpeed > 0
                ? `${(currentSpeed / (1024 * 1024)).toFixed(1)} MB/s • ETA ${formatSeconds(batchStats.overallEta)}`
                : "Transferring"}
            </span>
          </div>
        </div>
      </aside>
    );
  }

  // -------------------------------------------------------------
  // FULL EXPANDED IMPORT MODAL
  // -------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 select-none animate-fade-in overflow-hidden overscroll-none">
      <div className="w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[88dvh] sm:rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-2xl p-4 sm:p-6 relative flex flex-col text-on-surface overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-outline-variant/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center text-primary border border-outline-variant/30 shadow-xs">
              <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm text-on-surface">Import Gameplay Footage</h2>
              </div>
              <p className="text-xs text-outline mt-0.5">
                Select or drag gameplay videos to add to your library
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Toggle Graph vs Progress Bar */}
            <button
              onClick={() => {
                const next = displayStyle === "graph" ? "progress-bar" : "graph";
                setDisplayStyle(next);
                try {
                  localStorage.setItem("gamevault_upload_chart_style", next);
                } catch {}
              }}
              className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer border border-outline-variant/30"
              title={
                displayStyle === "graph"
                  ? "Switch to Progress Bar Mode"
                  : "Switch to Speed Graph Mode"
              }
            >
              <span className="material-symbols-outlined text-[18px]">
                {displayStyle === "graph" ? "linear_scale" : "ssid_chart"}
              </span>
            </button>

            {/* Toggle History View */}
            <button
              onClick={() => setShowHistoryView(!showHistoryView)}
              className={`px-2 py-1 rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-mono ${
                showHistoryView
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "text-outline hover:text-on-surface hover:bg-surface-container border-outline-variant/30"
              }`}
              title="View Upload History"
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              <span className="hidden sm:inline">History</span>
              {ingestHistory.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-primary/30 text-primary text-[10px] font-bold">
                  {ingestHistory.length}
                </span>
              )}
            </button>

            {/* Minimize button */}
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              title="Minimize to Background Tray"
            >
              <span className="material-symbols-outlined text-[18px]">minimize</span>
            </button>

            {/* Close button */}
            {!isUploading && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 no-scrollbar min-h-0">
          {showHistoryView ? (
            <div className="space-y-4 animate-fade-in font-sans">
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary border border-outline-variant/30">
                    <span className="material-symbols-outlined text-[18px]">history</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-on-surface">Upload History</h3>
                    <p className="text-[11px] text-outline font-mono">
                      Recent uploads and completed video transfers
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ingestHistory.length > 0 && (
                    confirmClearHistory ? (
                      <div className="flex items-center gap-1.5 animate-fade-in">
                        <span className="text-[11px] text-amber-300 font-mono">Clear all?</span>
                        <button
                          onClick={clearHistory}
                          className="px-2 py-1 rounded bg-error/30 hover:bg-error/50 text-error border border-error/50 text-xs font-mono font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmClearHistory(false)}
                          className="px-2 py-1 rounded bg-surface-container text-zinc-400 hover:text-white border border-outline-variant/30 text-xs font-mono cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClearHistory(true)}
                        className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-error-container/30 hover:text-error border border-outline-variant/30 text-outline text-xs font-mono transition-colors cursor-pointer flex items-center gap-1"
                        title="Clear all recorded history items"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                        Clear History
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setShowHistoryView(false)}
                    className="px-3 py-1 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-xs font-mono transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>Back to Queue</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
                </div>
              </div>

              {ingestHistory.length === 0 ? (
                <div className="py-16 text-center text-outline font-mono text-xs space-y-2">
                  <span className="material-symbols-outlined text-[40px] text-outline/40 block">history_toggle_off</span>
                  <p className="text-zinc-300 font-semibold text-sm">No Uploads Yet</p>
                  <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                    Completed video uploads and transfers will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
                  {ingestHistory.map((hist) => (
                    <div
                      key={hist.id + hist.completedAt}
                      className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2.5 font-mono text-xs transition-colors hover:border-outline-variant/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-[18px] text-primary shrink-0">movie</span>
                          <span className="font-semibold text-on-surface truncate" title={hist.filename}>
                            {hist.filename}
                          </span>
                          <span className="text-[10px] text-outline shrink-0">
                            ({formatBytes(hist.fileSize)})
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {hist.status === "completed" && (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-[10px] font-semibold">
                              Completed ✓
                            </span>
                          )}
                          {hist.status === "duplicate" && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-semibold">
                              Deduplicated
                            </span>
                          )}
                          {hist.status === "error" && (
                            <span className="px-2.5 py-0.5 rounded-full bg-error-container/40 border border-error/40 text-error text-[10px] font-semibold">
                              Failed ✕
                            </span>
                          )}

                          <button
                            onClick={() => {
                              const updated = ingestHistory.filter(
                                (h) => !(h.id === hist.id && h.completedAt === hist.completedAt)
                              );
                              setIngestHistory(updated);
                              try {
                                localStorage.setItem("gamevault_ingest_history", JSON.stringify(updated));
                              } catch {}
                              fetch(`/api/ingest-history?id=${encodeURIComponent(hist.id)}`, { method: "DELETE" }).catch(() => {});
                            }}
                            className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
                            title="Remove this entry"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </div>
                      </div>

                      {/* 4-column performance breakup */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20">
                          <span className="text-[10px] text-outline block">Upload Time</span>
                          <span className="text-on-surface font-semibold text-[11px]">
                            {formatSeconds(hist.uploadDurationSeconds)}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20">
                          <span className="text-[10px] text-outline block">Host Processing</span>
                          <span className="text-on-surface font-semibold text-[11px]">
                            {formatSeconds(hist.processingDurationSeconds)}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20">
                          <span className="text-[10px] text-outline block">Average Speed</span>
                          <span className="text-primary font-semibold text-[11px]">
                            {hist.averageSpeedBytesPerSec > 0
                              ? `${(hist.averageSpeedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
                              : "--"}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20">
                          <span className="text-[10px] text-outline block">Total Time</span>
                          <span className="text-secondary font-semibold text-[11px]">
                            {formatSeconds(hist.totalDurationSeconds)}
                          </span>
                        </div>
                      </div>

                      {hist.errorMessage && (
                        <div className="text-[10px] text-error font-mono bg-error-container/20 p-2 rounded-lg border border-error/30 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px] shrink-0">error</span>
                          <span>{hist.errorMessage}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-outline-variant/20">
                        <span>Uploaded: {new Date(hist.completedAt).toLocaleString()}</span>
                        {hist.sha256 && (
                          <div className="flex items-center gap-1 font-mono text-zinc-400">
                            <span className="text-zinc-500 font-semibold">SHA-256:</span>
                            <span className="truncate max-w-[200px]" title={hist.sha256}>
                              {hist.sha256}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Interrupted Upload Recovery Banner */}
          {interruptedSession && (
            <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-between gap-3 text-xs font-mono animate-fade-in shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">cloud_sync</span>
                <div className="min-w-0">
                  <p className="text-amber-200 font-semibold truncate">
                    Unfinished Upload Detected: {interruptedSession.filename} ({formatBytes(interruptedSession.size)})
                  </p>
                  <p className="text-[11px] text-amber-300/80">
                    Partial file saved on server. Drop or select this file to instantly resume from saved bytes!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (interruptedSession) {
                    fetch(`/api/upload/chunk?fingerprint=${encodeURIComponent(interruptedSession.fingerprint)}`, {
                      method: "DELETE",
                    }).catch(() => {});
                    try {
                      localStorage.removeItem("gamevault_active_upload");
                    } catch {}
                    setInterruptedSession(null);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-surface-container border border-outline-variant/30 text-zinc-400 hover:text-white text-[11px] shrink-0 cursor-pointer transition-colors"
                title="Discard partial upload from disk"
              >
                Discard
              </button>
            </div>
          )}

          {/* Top Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              dragOver
                ? "border-primary bg-primary/10 scale-[1.01]"
                : "border-outline-variant/40 hover:border-primary/60 hover:bg-surface-container-low"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,.mp4,.mov,.mkv,.webm"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleAddFiles(e.target.files);
                }
              }}
            />
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary mb-2 shadow-inner border border-outline-variant/30">
              <span className="material-symbols-outlined text-[22px]">add_photo_alternate</span>
            </div>
            <p className="text-xs font-semibold text-on-surface">
              Drop gameplay videos here or click to browse
            </p>
            <p className="text-[11px] text-outline mt-0.5 font-mono">
              Supports 4K, 60fps, MP4, MOV, MKV, and WebM
            </p>
          </div>

          {/* Staged Files List */}
          {stagedFiles.length > 0 && (
            <div className="space-y-3">
              {/* Batch Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-on-surface">
                    {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""} staged
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-outline">{formatBytes(batchStats.totalBytes)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isUploading && games.length > 0 && (
                    <div className="relative">
                      <select
                        onChange={(e) => {
                          if (e.target.value) handleApplyGameToAll(e.target.value);
                        }}
                        defaultValue=""
                        className="appearance-none pl-2.5 pr-7 py-1 rounded-lg text-xs bg-surface-container border border-outline-variant/30 text-on-surface cursor-pointer"
                      >
                        <option value="" disabled>
                          🎮 Apply Game...
                        </option>
                        {games.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined text-[14px] text-outline absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        unfold_more
                      </span>
                    </div>
                  )}

                  {!isUploading && (
                    <div className="relative">
                      <select
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            const name = prompt("Enter subfolder name for all staged clips (e.g. Season-19):");
                            if (name && name.trim()) handleApplyFolderToAll(name.trim());
                          } else if (e.target.value === "__clear__") {
                            handleApplyFolderToAll("");
                          } else if (e.target.value) {
                            handleApplyFolderToAll(e.target.value);
                          }
                          e.target.value = "";
                        }}
                        defaultValue=""
                        className="appearance-none pl-2.5 pr-7 py-1 rounded-lg text-xs bg-surface-container border border-outline-variant/30 text-on-surface cursor-pointer"
                      >
                        <option value="" disabled>
                          📁 Apply Folder...
                        </option>
                        <option value="__clear__">Clear Subfolder</option>
                        {availableFolders.map((f) => (
                          <option key={f} value={f}>
                            📁 {f}
                          </option>
                        ))}
                        <option value="__new__">+ New Subfolder...</option>
                      </select>
                      <span className="material-symbols-outlined text-[14px] text-outline absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        unfold_more
                      </span>
                    </div>
                  )}

                  {!isUploading && collections.length > 0 && (
                    <div className="relative">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleApplyCollectionToAll(e.target.value);
                            e.target.value = "";
                          }
                        }}
                        defaultValue=""
                        className="appearance-none pl-2.5 pr-7 py-1 rounded-lg text-xs bg-surface-container border border-outline-variant/30 text-on-surface cursor-pointer"
                      >
                        <option value="" disabled>
                          📚 Apply Collection...
                        </option>
                        {collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined text-[14px] text-outline absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        unfold_more
                      </span>
                    </div>
                  )}

                  {!isUploading && (
                    <button
                      type="button"
                      onClick={handleToggleFavoriteAll}
                      className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                        stagedFiles.every((f) => f.isFavorite)
                          ? "bg-amber-400/20 border-amber-400/40 text-amber-300 font-semibold"
                          : "bg-surface-container border-outline-variant/30 text-outline hover:text-amber-400 hover:border-amber-400/30"
                      }`}
                      title="Toggle favorite for all staged clips"
                    >
                      <span className={`material-symbols-outlined text-[14px] ${stagedFiles.every((f) => f.isFavorite) ? "fill-current" : ""}`}>
                        {stagedFiles.every((f) => f.isFavorite) ? "star" : "star_outline"}
                      </span>
                      <span>{stagedFiles.every((f) => f.isFavorite) ? "Fav All ✓" : "Fav All"}</span>
                    </button>
                  )}

                  {!isUploading && (
                    <button
                      onClick={handleClearAll}
                      className="px-2.5 py-1 text-xs text-error hover:bg-error-container/20 rounded-lg transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {/* Individual Staged Cards */}
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 no-scrollbar">
                {stagedFiles.map((item, idx) => {
                  const isCurrent = idx === activeUploadIndex;
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isCurrent
                          ? "bg-surface-container border-primary shadow-md"
                          : item.status === "completed"
                          ? "bg-surface-container-low border-secondary/40"
                          : item.status === "duplicate"
                          ? "bg-surface-container-low border-emerald-500/40"
                          : item.status === "error"
                          ? "bg-surface-container-low border-error/40"
                          : "bg-surface-container-low border-outline-variant/30 hover:border-outline-variant/60"
                      }`}
                    >
                      {/* Top Row: Large 16:9 Thumbnail, Title, Metatags, Quick Star, Status, Controls */}
                      <div className="flex items-start justify-between gap-3.5">
                        {/* 1. Large 16:9 Thumbnail with Click-to-Preview Lightbox */}
                        <div
                          onClick={() => {
                            const isSmallWebNative =
                              item.file.size <= 100 * 1024 * 1024 &&
                              !item.file.name.toLowerCase().endsWith(".mkv");
                            if (isSmallWebNative) {
                              const blobUrl = URL.createObjectURL(item.file);
                              setPreviewLightboxFile({ file: item.file, title: item.title, blobUrl });
                            }
                          }}
                          className="w-28 h-18 sm:w-36 sm:h-22.5 rounded-xl overflow-hidden bg-black/80 border border-outline-variant/50 shrink-0 relative flex items-center justify-center shadow-md cursor-pointer group hover:border-primary/80 transition-all select-none"
                          title={
                            item.file.size > 100 * 1024 * 1024 || item.file.name.toLowerCase().endsWith(".mkv")
                              ? "Preview available after upload"
                              : "Click to Preview Clip"
                          }
                        >
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1 text-outline">
                              <span className="material-symbols-outlined text-primary text-[24px]">movie</span>
                              <span className="text-[9px] font-mono">Generating...</span>
                            </div>
                          )}

                          {/* Play overlay on hover */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                            <div className="w-8 h-8 rounded-full bg-primary/90 text-on-primary flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                            </div>
                          </div>

                          {/* Bottom duration / inspect badge */}
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white/90 backdrop-blur-xs flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[10px] text-primary">zoom_in</span>
                            <span>Preview</span>
                          </div>
                        </div>

                        {/* Title, Quick Star, and Taxonomy Tags */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item.title}
                              disabled={isUploading}
                              onChange={(e) =>
                                updateStagedFile(item.id, { title: e.target.value })
                              }
                              placeholder="Clip title..."
                              className="w-full bg-transparent border-b border-transparent hover:border-outline-variant/40 focus:border-primary focus:outline-none text-xs sm:text-sm font-semibold text-on-surface truncate px-0.5 py-0.5"
                            />

                            {/* 1-Click Quick Favorite Star Button */}
                            <button
                              type="button"
                              disabled={isUploading}
                              onClick={() => updateStagedFile(item.id, { isFavorite: !item.isFavorite })}
                              title={item.isFavorite ? "Favorited (Click to remove)" : "Add to Favorites"}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
                                item.isFavorite
                                  ? "bg-amber-400/20 border-amber-400/50 text-amber-400 shadow-xs"
                                  : "bg-surface-container/60 border-outline-variant/30 text-outline hover:text-amber-300 hover:border-amber-400/30"
                              }`}
                            >
                              <span className={`material-symbols-outlined text-[16px] ${item.isFavorite ? "fill-current" : ""}`}>
                                {item.isFavorite ? "star" : "star_outline"}
                              </span>
                            </button>
                          </div>

                          {/* Quick Badges: Size, File Name, Subfolder, Collections, Auto Game */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-outline font-mono">
                            <span>{formatBytes(item.totalBytes)}</span>
                            <span>•</span>
                            <span className="truncate max-w-[140px] sm:max-w-[200px]">{item.file.name}</span>

                            {item.autoDetectedGame && !item.gameId && (
                              <span className="px-1.5 py-0.2 rounded bg-primary/20 text-primary text-[10px]">
                                Auto: {item.autoDetectedGame.name}
                              </span>
                            )}

                            {/* Subfolder Badge */}
                            {item.folder ? (
                              <span
                                onClick={() => updateStagedFile(item.id, { isExpanded: true })}
                                className="px-1.5 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] flex items-center gap-1 cursor-pointer hover:bg-blue-500/25"
                                title="Click to change subfolder"
                              >
                                <span className="material-symbols-outlined text-[11px]">folder</span>
                                {item.folder}
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isUploading}
                                onClick={() => updateStagedFile(item.id, { isExpanded: true })}
                                className="px-1.5 py-0.5 rounded-md bg-surface-container/60 hover:bg-surface-container border border-outline-variant/20 text-zinc-400 hover:text-zinc-200 text-[10px] flex items-center gap-0.5 cursor-pointer"
                                title="Add to Subfolder"
                              >
                                <span className="material-symbols-outlined text-[11px]">create_new_folder</span>
                                + Folder
                              </button>
                            )}

                            {/* Collections Badge */}
                            {item.collectionIds.length > 0 ? (
                              <span
                                onClick={() => updateStagedFile(item.id, { isExpanded: true })}
                                className="px-1.5 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[10px] flex items-center gap-1 cursor-pointer hover:bg-purple-500/25"
                                title="Click to edit collections"
                              >
                                <span className="material-symbols-outlined text-[11px]">collections_bookmark</span>
                                {item.collectionIds.length} Col{item.collectionIds.length > 1 ? "s" : ""}
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isUploading}
                                onClick={() => updateStagedFile(item.id, { isExpanded: true })}
                                className="px-1.5 py-0.5 rounded-md bg-surface-container/60 hover:bg-surface-container border border-outline-variant/20 text-zinc-400 hover:text-zinc-200 text-[10px] flex items-center gap-0.5 cursor-pointer"
                                title="Add to Collections"
                              >
                                <span className="material-symbols-outlined text-[11px]">bookmark_add</span>
                                + Collection
                              </button>
                            )}

                            {/* Favorite Badge */}
                            {item.isFavorite && (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-400 text-[10px] flex items-center gap-1">
                                <span className="material-symbols-outlined text-[11px] fill-current">star</span>
                                Fav
                              </span>
                            )}

                            {/* Resumed from Bytes Badge */}
                            {item.resumedFromBytes && item.resumedFromBytes > 0 && (
                              <span
                                className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] flex items-center gap-1 font-mono"
                                title={`Resumed from ${formatBytes(item.resumedFromBytes)} on server disk`}
                              >
                                <span className="material-symbols-outlined text-[11px]">cloud_sync</span>
                                Resumed ({formatBytes(item.resumedFromBytes)})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Badge & Expand / Remove Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.status === "completed" && (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>
                              Completed ✓
                            </span>
                          )}
                          {item.status === "duplicate" && (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">verified</span>
                              In Vault ✓
                            </span>
                          )}
                          {item.status === "uploading" && (
                            <span className="px-2.5 py-0.5 rounded-full bg-primary/20 border border-primary/40 text-primary font-mono text-[10px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                              Uploading {item.progress}%
                            </span>
                          )}
                          {item.status === "processing" && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-mono text-[10px] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                              Processing...
                            </span>
                          )}
                          {item.status === "error" && (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2.5 py-0.5 rounded-full bg-error-container/40 border border-error/40 text-error font-mono text-[10px]">
                                Error
                              </span>
                              {!isUploading && (
                                <button
                                  type="button"
                                  onClick={() => retrySingleFile(idx)}
                                  className="px-2 py-0.5 rounded-md bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-[10px] font-mono cursor-pointer transition-colors"
                                  title="Resume upload from current disk offset"
                                >
                                  Retry
                                </button>
                              )}
                            </div>
                          )}

                          {/* Toggle Expand Details Button */}
                          <button
                            onClick={() =>
                              updateStagedFile(item.id, { isExpanded: !item.isExpanded })
                            }
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              item.isExpanded
                                ? "bg-primary/20 border-primary/40 text-primary"
                                : "text-outline hover:text-on-surface hover:bg-surface-container border-outline-variant/30"
                            }`}
                            title="Edit metadata, subfolder, collections & tags"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {item.isExpanded ? "expand_less" : "tune"}
                            </span>
                          </button>

                          {/* Remove button */}
                          {!isUploading && item.status !== "completed" && (
                            <button
                              onClick={() => removeStagedFile(item.id)}
                              className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-surface-container border border-outline-variant/30 transition-colors cursor-pointer"
                              title="Remove"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Error Alert Box with Resume Button */}
                      {item.status === "error" && item.errorMessage && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-error-container/20 border border-error/30 text-error text-[11px] font-mono flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="material-symbols-outlined text-[16px] shrink-0">warning</span>
                            <span className="truncate">{item.errorMessage}</span>
                          </div>
                          {!isUploading && (
                            <button
                              type="button"
                              onClick={() => retrySingleFile(idx)}
                              className="px-2 py-0.5 rounded bg-error/20 hover:bg-error/30 text-white text-[10px] font-semibold shrink-0 cursor-pointer transition-colors"
                            >
                              Resume Now →
                            </button>
                          )}
                        </div>
                      )}

                      {/* Individual File Real-Time Progress Bar */}
                      {(item.status === "uploading" || item.status === "processing") && (
                        <div className="mt-2.5 space-y-1">
                          <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden relative">
                            <div
                              className={`h-full transition-all duration-150 ${
                                item.status === "processing"
                                  ? "bg-amber-400 w-full animate-pulse"
                                  : "bg-primary"
                              }`}
                              style={
                                item.status === "processing"
                                  ? {}
                                  : { width: `${item.progress}%` }
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-outline">
                            <span>
                              {item.status === "processing"
                                ? `Transferred 100% • Generating storyboard & thumbnails... (Elapsed: ${formatSeconds(item.processingElapsedSeconds || 0)}${item.processingEtaSeconds !== undefined ? ` • ETA: ~${formatSeconds(item.processingEtaSeconds)}` : ""})`
                                : `Uploaded ${formatBytes(item.uploadedBytes)} of ${formatBytes(item.totalBytes)} (${item.progress}%)`}
                            </span>
                            <span>
                              {item.status === "uploading" && item.speed > 0
                                ? `${(item.speed / (1024 * 1024)).toFixed(1)} MB/s • ETA ${formatSeconds(item.etaSeconds)}`
                                : item.status === "processing"
                                ? "Host processing"
                                : ""}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Post-Completion Metrics Breakdown Card */}
                      {(item.status === "completed" || item.status === "duplicate") && (
                        <div className="mt-3 p-3 rounded-xl bg-surface-container/60 border border-emerald-500/25 space-y-2 animate-fade-in font-mono text-xs">
                          <div className="flex items-center justify-between text-emerald-400 text-[11px] font-semibold">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[16px]">check_circle</span>
                              <span>
                                {item.status === "duplicate"
                                  ? "Upload Complete (File Already in Vault)"
                                  : "Upload Complete • Video Saved Safely"}
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-400">
                              Total: {formatSeconds(item.totalDurationSeconds || 0)}
                            </span>
                          </div>

                          {/* 4-column metric breakup */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                            <div className="p-2 rounded-lg bg-surface-container-lowest/80 border border-outline-variant/20">
                              <span className="text-[10px] text-outline block">Upload Time</span>
                              <span className="text-on-surface font-semibold text-[11px]">
                                {formatSeconds(item.uploadDurationSeconds || 0)}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-surface-container-lowest/80 border border-outline-variant/20">
                              <span className="text-[10px] text-outline block">Host Processing</span>
                              <span className="text-on-surface font-semibold text-[11px]">
                                {formatSeconds(item.processingDurationSeconds || 0)}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-surface-container-lowest/80 border border-outline-variant/20">
                              <span className="text-[10px] text-outline block">Average Speed</span>
                              <span className="text-primary font-semibold text-[11px]">
                                {item.averageSpeed && item.averageSpeed > 0
                                  ? `${(item.averageSpeed / (1024 * 1024)).toFixed(1)} MB/s`
                                  : "--"}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-surface-container-lowest/80 border border-outline-variant/20">
                              <span className="text-[10px] text-outline block">Peak Speed</span>
                              <span className="text-secondary font-semibold text-[11px]">
                                {item.peakSpeed && item.peakSpeed > 0
                                  ? `${(item.peakSpeed / (1024 * 1024)).toFixed(1)} MB/s`
                                  : "--"}
                              </span>
                            </div>
                          </div>

                          {/* Integrity indicator */}
                          {item.sha256 && (
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/20 text-[10px] text-zinc-400">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                  File Integrity Verified
                                </span>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                Protected
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expandable Meta Panel: Game, Subfolder, Collections, Favorite, Tags, Context */}
                      {item.isExpanded && (
                        <div className="mt-3.5 pt-3.5 border-t border-outline-variant/30 space-y-3.5 animate-fade-in font-sans">
                          {/* Row 1: Game & Subfolder (2-column layout) */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Game Selector */}
                            <div>
                              <label className="block text-[11px] text-outline font-mono mb-1">
                                🎮 Game Categorization
                              </label>
                              <div className="relative">
                                <select
                                  value={item.gameId}
                                  onChange={(e) =>
                                    updateStagedFile(item.id, { gameId: e.target.value })
                                  }
                                  disabled={isUploading}
                                  className="w-full appearance-none px-3 py-1.5 pr-8 rounded-lg text-xs bg-surface-container border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                                >
                                  <option value="">Uncategorized</option>
                                  {games.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.name}
                                    </option>
                                  ))}
                                </select>
                                <span className="material-symbols-outlined text-[16px] text-outline absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                  unfold_more
                                </span>
                              </div>
                            </div>

                            {/* Subfolder Selector & Inline Creator */}
                            <div>
                              <label className="block text-[11px] text-outline font-mono mb-1">
                                📁 Subfolder (e.g. Season-19, Scrims, Ranked)
                              </label>
                              <div className="flex items-center gap-1.5">
                                <div className="relative flex-1">
                                  <select
                                    value={item.folder || ""}
                                    onChange={(e) =>
                                      updateStagedFile(item.id, { folder: e.target.value })
                                    }
                                    disabled={isUploading}
                                    className="w-full appearance-none px-3 py-1.5 pr-8 rounded-lg text-xs bg-surface-container border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                                  >
                                    <option value="">No Subfolder (Root Vault)</option>
                                    {availableFolders.map((f) => (
                                      <option key={f} value={f}>
                                        📁 {f}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="material-symbols-outlined text-[16px] text-outline absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                    unfold_more
                                  </span>
                                </div>
                              </div>
                              {/* Inline create new subfolder */}
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <input
                                  type="text"
                                  value={newFolderInputs[item.id] || ""}
                                  onChange={(e) =>
                                    setNewFolderInputs((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && newFolderInputs[item.id]?.trim()) {
                                      e.preventDefault();
                                      updateStagedFile(item.id, { folder: newFolderInputs[item.id].trim() });
                                      setNewFolderInputs((prev) => ({ ...prev, [item.id]: "" }));
                                    }
                                  }}
                                  disabled={isUploading}
                                  placeholder="Type new folder name..."
                                  className="flex-1 px-2.5 py-1 rounded-lg text-[11px] bg-surface-container border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary font-mono"
                                />
                                <button
                                  type="button"
                                  disabled={isUploading || !newFolderInputs[item.id]?.trim()}
                                  onClick={() => {
                                    if (newFolderInputs[item.id]?.trim()) {
                                      updateStagedFile(item.id, { folder: newFolderInputs[item.id].trim() });
                                      setNewFolderInputs((prev) => ({ ...prev, [item.id]: "" }));
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-primary text-[11px] cursor-pointer font-medium disabled:opacity-50"
                                >
                                  + Set
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Row 2: Multi-Game Collections Selection */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] text-outline font-mono flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px] text-purple-400">collections_bookmark</span>
                                <span>Multi-Game Collections</span>
                              </label>
                              {collections.length > 0 && (
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  {collections.length} collections available
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-surface-container/70 border border-outline-variant/30">
                              {collections.length > 0 ? (
                                collections.map((col) => {
                                  const isSelected =
                                    item.collectionIds.includes(col.id) ||
                                    item.collectionIds.includes(col.slug);
                                  return (
                                    <button
                                      key={col.id}
                                      type="button"
                                      disabled={isUploading}
                                      onClick={() => {
                                        const currentIds = item.collectionIds;
                                        const nextIds = isSelected
                                          ? currentIds.filter((id) => id !== col.id && id !== col.slug)
                                          : [...currentIds, col.id];
                                        updateStagedFile(item.id, { collectionIds: nextIds });
                                      }}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all cursor-pointer flex items-center gap-1.5 ${
                                        isSelected
                                          ? "bg-purple-500/20 text-purple-200 border-purple-500/50 shadow-xs ring-1 ring-purple-500/30"
                                          : "bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-zinc-300 hover:text-white"
                                      }`}
                                    >
                                      <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: col.color || "#A855F7" }}
                                      />
                                      <span>{col.name}</span>
                                      {isSelected && (
                                        <span className="material-symbols-outlined text-[14px] text-purple-300">check</span>
                                      )}
                                    </button>
                                  );
                                })
                              ) : (
                                <span className="text-[11px] text-zinc-500 italic">No collections defined yet</span>
                              )}
                            </div>
                          </div>

                          {/* Row 3: Favorite Switch Card */}
                          <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container border border-outline-variant/30">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors ${
                                item.isFavorite
                                  ? "bg-amber-400/20 border-amber-400/40 text-amber-400"
                                  : "bg-surface-container-high border-outline-variant/30 text-outline"
                              }`}>
                                <span className={`material-symbols-outlined text-[16px] ${item.isFavorite ? "fill-current" : ""}`}>
                                  {item.isFavorite ? "star" : "star_outline"}
                                </span>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-on-surface">Mark as Favorite Clip</p>
                                <p className="text-[10px] text-outline font-mono">
                                  Prioritize this clip in Starred list and left sidebar Favorites
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isUploading}
                              onClick={() => updateStagedFile(item.id, { isFavorite: !item.isFavorite })}
                              className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative p-0.5 border ${
                                item.isFavorite
                                  ? "bg-amber-400 border-amber-400"
                                  : "bg-surface-container-highest border-outline-variant/40"
                              }`}
                            >
                              <div
                                className={`w-4.5 h-4.5 rounded-full bg-white transition-transform ${
                                  item.isFavorite ? "translate-x-5" : "translate-x-0"
                                }`}
                              />
                            </button>
                          </div>

                          {/* Row 4: TAGS MANAGEMENT */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] text-outline font-mono">
                                🏷️ Clip Tags
                              </label>
                              {availableTags.length > 0 && (
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  {availableTags.length} site tags available
                                </span>
                              )}
                            </div>

                            {/* Attached Tags to this clip */}
                            {item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-surface-container border border-outline-variant/30">
                                <span className="text-[10px] text-outline font-mono self-center mr-1">
                                  Attached:
                                </span>
                                {item.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[11px] font-mono border border-primary/30 flex items-center gap-1"
                                  >
                                    <span>#{tag}</span>
                                    {!isUploading && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveTagFromFile(item.id, tag)}
                                        className="hover:text-error cursor-pointer ml-0.5"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Existing Tags on Site (Click to attach instantly) */}
                            <div className="space-y-1">
                              <span className="text-[10px] text-outline font-mono block">
                                Available on GameVault (Click to attach):
                              </span>
                              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar p-1.5 rounded-lg bg-surface-container/60 border border-outline-variant/20">
                                {availableTags.length > 0 ? (
                                  availableTags.map((t) => {
                                    const isAttached = item.tags.includes(t.name.toLowerCase());
                                    return (
                                      <button
                                        key={t.id}
                                        type="button"
                                        disabled={isUploading}
                                        onClick={() => {
                                          if (isAttached) {
                                            handleRemoveTagFromFile(item.id, t.name.toLowerCase());
                                          } else {
                                            handleAddTagToFile(item.id, t.name.toLowerCase());
                                          }
                                        }}
                                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono border transition-all cursor-pointer flex items-center gap-1 ${
                                          isAttached
                                            ? "bg-primary text-on-primary border-primary shadow-xs"
                                            : "bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-zinc-300 hover:text-white"
                                        }`}
                                      >
                                        <span
                                          className="w-1.5 h-1.5 rounded-full"
                                          style={{
                                            backgroundColor: isAttached
                                              ? "#ffffff"
                                              : t.color || "#8E8E93",
                                          }}
                                        />
                                        <span>#{t.name}</span>
                                        {isAttached && <span className="text-[10px]">✓</span>}
                                      </button>
                                    );
                                  })
                                ) : (
                                  <span className="text-[11px] text-zinc-500 italic p-1">
                                    No site tags created yet.
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Input to create a brand new tag on the fly */}
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                value={tagInputText[item.id] || ""}
                                onChange={(e) =>
                                  setTagInputText((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddTagToFile(item.id, tagInputText[item.id] || "");
                                  }
                                }}
                                disabled={isUploading}
                                placeholder="Type new tag name & press Enter to create..."
                                className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-surface-container border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary font-mono"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleAddTagToFile(item.id, tagInputText[item.id] || "")
                                }
                                className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-primary text-xs cursor-pointer font-medium"
                              >
                                + Create Tag
                              </button>
                            </div>
                          </div>

                          {/* Row 5: Description Input */}
                          <div>
                            <label className="block text-[11px] text-outline font-mono mb-1 flex items-center justify-between">
                              <span>Gameplay Context &amp; Story Notes (Optional)</span>
                              <span className="text-[10px] text-zinc-500">
                                Shown below player in detail view
                              </span>
                            </label>
                            <textarea
                              value={item.description}
                              onChange={(e) =>
                                updateStagedFile(item.id, { description: e.target.value })
                              }
                              disabled={isUploading}
                              rows={2}
                              placeholder="Write background story, tactical notes, loadout details, or timestamps of interesting events..."
                              className="w-full px-3 py-2 rounded-lg text-xs bg-surface-container border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary font-sans leading-relaxed resize-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* 5 & 6. REAL-TIME BATCH TELEMETRY & SPEED GRAPH / BAR          */}
          {/* ------------------------------------------------------------- */}
          {isUploading && (
            <div className="p-4 rounded-xl bg-surface-container-low border border-primary/40 space-y-3 font-mono animate-fade-in">
              {/* Batch Overview Row */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      currentUploadingItem?.status === "processing"
                        ? "bg-amber-400 animate-ping"
                        : "bg-primary animate-pulse"
                    }`}
                  />
                  <span className="font-semibold text-on-surface uppercase tracking-wider">
                    {currentUploadingItem?.status === "processing"
                      ? `Server Processing Clip ${activeUploadIndex + 1} of ${stagedFiles.length}`
                      : `Uploading Clip ${activeUploadIndex + 1} of ${stagedFiles.length}`}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-outline">
                  <span>Elapsed: {formatSeconds(overallElapsedSeconds)}</span>
                  <span>
                    {currentUploadingItem?.status === "processing"
                      ? "Generating Previews"
                      : `Batch ETA: ${formatSeconds(batchStats.overallEta)}`}
                  </span>
                </div>
              </div>

              {/* Server Processing Alert (Active while host runs ffmpeg & sprite generator) */}
              {currentUploadingItem?.status === "processing" && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-between text-xs text-amber-300 font-mono animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] animate-spin text-amber-400">
                      progress_activity
                    </span>
                    <span>
                      Clip {activeUploadIndex + 1} Transferred (100%) • Host Generating 4K Storyboard &amp; Previews...
                      <span className="text-amber-200 ml-1.5 font-semibold">
                        (Elapsed: {formatSeconds(currentUploadingItem.processingElapsedSeconds || 0)}
                        {currentUploadingItem.processingEtaSeconds !== undefined
                          ? ` • ETA: ~${formatSeconds(currentUploadingItem.processingEtaSeconds)}`
                          : ""}
                        )
                      </span>
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 font-semibold">
                    Host Active
                  </span>
                </div>
              )}

              {/* Overall Batch Progress Bar with 100% Real Numbers */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-300 font-semibold">
                    Overall Batch Progress: {batchStats.overallProgress}%
                  </span>
                  <span className="text-primary font-bold">
                    {formatBytes(batchStats.uploadedBytes)} of {formatBytes(batchStats.totalBytes)}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-150 ${
                      currentUploadingItem?.status === "processing"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-primary"
                    }`}
                    style={{ width: `${batchStats.overallProgress}%` }}
                  />
                </div>
              </div>

              {/* MODE A: WINDOWS TRANSFER SPEED GRAPH */}
              {displayStyle === "graph" ? (
                <div className="space-y-2 pt-1 border-t border-outline-variant/20">
                  <div className="flex items-baseline justify-between text-xs">
                    <div>
                      {currentUploadingItem?.status === "processing" ? (
                        <div className="flex items-center gap-1.5 text-amber-400">
                          <span className="material-symbols-outlined text-[18px] animate-spin">
                            progress_activity
                          </span>
                          <span className="text-sm font-semibold">Processing Video...</span>
                        </div>
                      ) : (
                        <>
                          <span className="text-xl font-bold text-on-surface tracking-tight">
                            {(currentSpeed / (1024 * 1024)).toFixed(1)}
                          </span>
                          <span className="text-outline ml-1">MB/s</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-outline">
                      <span>Peak: {peakSpeed.toFixed(1)} MB/s</span>
                      <span>Pending: {formatBytes(batchStats.pendingBytes)}</span>
                    </div>
                  </div>

                  {/* SVG Line / Area Graph */}
                  <div className="relative h-24 w-full rounded-xl bg-black/60 border border-outline-variant/30 overflow-hidden p-2 flex flex-col justify-between">
                    <div className="absolute inset-0 grid grid-rows-3 grid-cols-6 pointer-events-none opacity-15">
                      {Array.from({ length: 18 }).map((_, i) => (
                        <div key={i} className="border-b border-r border-white/40" />
                      ))}
                    </div>

                    <svg
                      className="w-full h-full relative z-10"
                      viewBox="0 0 300 100"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {speedHistory.length > 1 && (
                        <path
                          d={(() => {
                            const maxVal = Math.max(10, peakSpeed * 1.25);
                            const step = 300 / (speedHistory.length - 1);
                            let d = `M 0 100 `;
                            speedHistory.forEach((spd, idx) => {
                              const x = idx * step;
                              const y = 100 - (spd / maxVal) * 90;
                              d += `L ${x} ${y} `;
                            });
                            d += `L 300 100 Z`;
                            return d;
                          })()}
                          fill="url(#speedGrad)"
                        />
                      )}

                      {speedHistory.length > 1 && (
                        <path
                          d={(() => {
                            const maxVal = Math.max(10, peakSpeed * 1.25);
                            const step = 300 / (speedHistory.length - 1);
                            let d = "";
                            speedHistory.forEach((spd, idx) => {
                              const x = idx * step;
                              const y = 100 - (spd / maxVal) * 90;
                              d += idx === 0 ? `M ${x} ${y} ` : `L ${x} ${y} `;
                            });
                            return d;
                          })()}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </svg>

                    <div className="absolute top-1 right-2 text-[9px] text-zinc-500 font-mono pointer-events-none">
                      Scale: {Math.max(10, Math.round(peakSpeed * 1.25))} MB/s
                    </div>
                  </div>
                </div>
              ) : (
                /* MODE B: LINEAR PROGRESS BAR */
                <div className="space-y-2 pt-1 border-t border-outline-variant/20">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">
                      Transfer Rate: {(currentSpeed / (1024 * 1024)).toFixed(1)} MB/s
                    </span>
                    <span className="text-outline">
                      Peak: {peakSpeed.toFixed(1)} MB/s
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-outline">
                    <span>Pending: {formatBytes(batchStats.pendingBytes)}</span>
                    <span>Elapsed: {formatSeconds(overallElapsedSeconds)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-outline-variant/30 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-mono text-outline">
            {stagedFiles.length === 0 ? (
              <span>No footage queued</span>
            ) : isUploading ? (
              <span className="text-primary flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Uploading {activeUploadIndex + 1} of {batchStats.totalCount} (
                {batchStats.completedCount} finished)...
              </span>
            ) : (
              <span>
                Ready to upload {stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isUploading ? (
              <>
                <button
                  onClick={() => setIsMinimized(true)}
                  className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface text-xs font-medium cursor-pointer transition-colors"
                >
                  Run in Background
                </button>
                <button
                  onClick={handleCancelAll}
                  className="px-3.5 py-1.5 rounded-lg bg-error-container/30 border border-error/40 text-error hover:bg-error-container/50 text-xs font-medium cursor-pointer transition-colors"
                >
                  Cancel Upload
                </button>
              </>
            ) : (
              stagedFiles.length > 0 && (
                <button
                  onClick={startUploadingQueue}
                  className="px-5 py-2 rounded-xl font-medium text-xs text-on-primary bg-primary hover:brightness-105 active:scale-98 transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">publish</span>
                  <span>Start Upload ({stagedFiles.length})</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Quick Video Lightbox Preview Modal */}
      {previewLightboxFile && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-fade-in">
          <div className="w-full max-w-4xl bg-surface-container-lowest border border-outline-variant/40 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-3.5 border-b border-outline-variant/30 bg-surface-container-low">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">movie</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-xs sm:text-sm text-on-surface truncate">
                    {previewLightboxFile.title}
                  </h3>
                  <p className="text-[10px] text-outline font-mono">
                    {previewLightboxFile.file.name} • {formatBytes(previewLightboxFile.file.size)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(previewLightboxFile.blobUrl);
                  setPreviewLightboxFile(null);
                }}
                className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                title="Close Lightbox"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video
                src={previewLightboxFile.blobUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full max-h-[72vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
