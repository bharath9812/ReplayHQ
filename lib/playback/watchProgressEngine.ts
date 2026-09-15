"use client";

import { useState, useEffect, useCallback } from "react";

export interface ClipWatchRecord {
  time: number;
  duration: number;
  percent: number;
  updatedAt: number;
}

export type WatchProgressMap = Record<string, ClipWatchRecord>;

const STORAGE_KEY = "gamevault_watch_progress";
const EVENT_NAME = "gamevault:watch_progress";

// In-memory singleton cache for 0ms synchronous access
let inMemoryWatchMap: WatchProgressMap = {};
let isInitialized = false;

type WatchListener = (record: ClipWatchRecord | null) => void;
const clipListeners: Map<string, Set<WatchListener>> = new Map();
const globalListeners: Set<(map: WatchProgressMap) => void> = new Set();

function initMemory(): void {
  if (typeof window === "undefined" || isInitialized) return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        inMemoryWatchMap = JSON.parse(raw);
      } catch {
        inMemoryWatchMap = {};
      }
    }
    isInitialized = true;

    // Pull database-persisted watch progress from PostgreSQL
    syncWithServer();
  } catch {
    inMemoryWatchMap = {};
    isInitialized = true;
  }
}

// Ensure in-memory state is initialized in browser
if (typeof window !== "undefined") {
  initMemory();

  // Instant Cross-Tab Synchronization via native storage event
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        inMemoryWatchMap = parsed;
        notifyAllListeners();
      } catch {}
    }
  });
}

function notifyAllListeners(changedClipId?: string): void {
  if (changedClipId) {
    const listeners = clipListeners.get(changedClipId);
    if (listeners) {
      const record = inMemoryWatchMap[changedClipId] || null;
      listeners.forEach((cb) => {
        try {
          cb(record);
        } catch (e) {
          console.error(`[WatchProgressEngine] Listener error for ${changedClipId}:`, e);
        }
      });
    }
  } else {
    clipListeners.forEach((listeners, cId) => {
      const record = inMemoryWatchMap[cId] || null;
      listeners.forEach((cb) => {
        try {
          cb(record);
        } catch {}
      });
    });
  }

  globalListeners.forEach((cb) => {
    try {
      cb(inMemoryWatchMap);
    } catch {}
  });

  if (typeof window !== "undefined" && changedClipId) {
    const rec = inMemoryWatchMap[changedClipId];
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: {
          clipId: changedClipId,
          percent: rec?.percent || 0,
          time: rec?.time || 0,
        },
      })
    );
  }
}

let serverSyncTimer: any = null;
const pendingServerSync: Set<string> = new Set();

/**
 * Optimistic debounced persistence to PostgreSQL via /api/playback/progress
 */
function scheduleServerSync(clipId: string): void {
  if (typeof window === "undefined") return;

  pendingServerSync.add(clipId);

  if (serverSyncTimer) {
    clearTimeout(serverSyncTimer);
  }

  serverSyncTimer = setTimeout(async () => {
    flushPendingToServer();
  }, 1500);
}

async function flushPendingToServer(): Promise<void> {
  if (pendingServerSync.size === 0) return;

  const toSync: WatchProgressMap = {};
  pendingServerSync.forEach((id) => {
    if (inMemoryWatchMap[id]) {
      toSync[id] = inMemoryWatchMap[id];
    }
  });
  pendingServerSync.clear();

  try {
    await fetch("/api/playback/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: toSync }),
    });
  } catch (err) {
    // Non-blocking: local-first state preserves playback position
    console.warn("[WatchProgressEngine] Server sync deferred:", err);
  }
}

/**
 * Pulls global watch progress from PostgreSQL on boot / page refresh
 */
export async function syncWithServer(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const res = await fetch("/api/playback/progress");
    const data = await res.json();

    if (data.success && data.progress) {
      const serverMap: WatchProgressMap = data.progress;
      let hasChanges = false;
      const merged = { ...inMemoryWatchMap };

      for (const [cId, serverRec] of Object.entries(serverMap)) {
        const localRec = merged[cId];
        // Merge newest timestamp
        if (!localRec || (serverRec.updatedAt && serverRec.updatedAt > (localRec.updatedAt || 0))) {
          merged[cId] = serverRec;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        inMemoryWatchMap = merged;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryWatchMap));
        notifyAllListeners();
      }
    }
  } catch (err) {
    // Local-first: offline fallback maintains current state
  }
}

/**
 * Synchronous getter: 0ms latency for clip card progress bars
 */
export function getClipWatchPercent(clipId: string): number {
  if (typeof window !== "undefined" && !isInitialized) {
    initMemory();
  }
  const rec = inMemoryWatchMap[clipId];
  return rec && typeof rec.percent === "number" ? Math.min(100, Math.max(0, rec.percent)) : 0;
}

/**
 * Synchronous getter: 0ms latency for exact saved timestamp & duration
 */
export function getClipWatchRecord(clipId: string): ClipWatchRecord | null {
  if (typeof window !== "undefined" && !isInitialized) {
    initMemory();
  }
  return inMemoryWatchMap[clipId] || null;
}

/**
 * Saves current playback position with 0ms local update, instant multi-tab broadcast,
 * and optimistic debounced PostgreSQL server sync.
 */
export function saveClipWatchProgress(
  clipId: string,
  time: number,
  duration: number,
  forceImmediateServerSync: boolean = false
): void {
  if (!clipId || duration <= 0) return;
  initMemory();

  const pct = Math.min(100, Math.max(0, Math.round((time / duration) * 100)));
  const record: ClipWatchRecord = {
    time: Math.max(0, time),
    duration,
    percent: pct,
    updatedAt: Date.now(),
  };

  inMemoryWatchMap = {
    ...inMemoryWatchMap,
    [clipId]: record,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryWatchMap));
    } catch {}

    if (forceImmediateServerSync) {
      pendingServerSync.add(clipId);
      flushPendingToServer();
    } else {
      scheduleServerSync(clipId);
    }
  }

  notifyAllListeners(clipId);
}

/**
 * Clears watch progress for a clip (e.g. when restarted from beginning)
 */
export function clearClipWatchProgress(clipId: string): void {
  if (!clipId) return;
  initMemory();

  delete inMemoryWatchMap[clipId];

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryWatchMap));
    } catch {}
    scheduleServerSync(clipId);
  }

  notifyAllListeners(clipId);
}

/**
 * React Hook: Reactive watch percentage for ClipCard components.
 * Subscribes to same-tab events, cross-tab storage changes, and server syncs.
 */
export function useClipWatchPercent(clipId: string): number {
  const [percent, setPercent] = useState<number>(() => getClipWatchPercent(clipId));

  useEffect(() => {
    setPercent(getClipWatchPercent(clipId));

    const listener: WatchListener = (rec) => {
      setPercent(rec ? Math.min(100, Math.max(0, rec.percent)) : 0);
    };

    if (!clipListeners.has(clipId)) {
      clipListeners.set(clipId, new Set());
    }
    clipListeners.get(clipId)!.add(listener);

    return () => {
      clipListeners.get(clipId)?.delete(listener);
    };
  }, [clipId]);

  return percent;
}

/**
 * React Hook: Reactive full map of all watched clips for carousels and playlists
 */
export function useAllWatchProgress(): WatchProgressMap {
  const [map, setMap] = useState<WatchProgressMap>(() => {
    if (typeof window !== "undefined" && !isInitialized) {
      initMemory();
    }
    return { ...inMemoryWatchMap };
  });

  useEffect(() => {
    setMap({ ...inMemoryWatchMap });

    const listener = (newMap: WatchProgressMap) => {
      setMap({ ...newMap });
    };

    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }, []);

  return map;
}

