"use client";

import { useState, useEffect, useCallback } from "react";

export interface VaultSettings {
  // Playback & Cinema Player Directives
  playbackResumeBehavior: "resume" | "beginning"; // "resume" = Continue from last left, "beginning" = Always start from 0:00
  playbackAutoPlay: boolean;
  playbackDefaultVolume: number; // 0.0 to 1.0
  playbackMutedByDefault: boolean;

  // UI & Layout Preferences
  sidebarWidth: number;
  uploadChartStyle: "graph" | "progress-bar";
  folderBrowsingStyle: "shelf" | "finder";
  theme: "dark" | "light" | "system";

  // System & Ingestion Directives
  autoCategorizeOnImport: boolean;
  preserveOriginalsImmutable: boolean;
}

export type VaultSettingKey = keyof VaultSettings;

export interface SettingDefinition<K extends VaultSettingKey = VaultSettingKey> {
  key: K;
  label: string;
  category: "playback" | "ui" | "system";
  description: string;
  type: "select" | "boolean" | "number" | "string";
  options?: Array<{ label: string; value: VaultSettings[K]; hint?: string }>;
  min?: number;
  max?: number;
  step?: number;
}

export const VAULT_SETTINGS_METADATA: Record<VaultSettingKey, SettingDefinition<any>> = {
  playbackResumeBehavior: {
    key: "playbackResumeBehavior",
    label: "Playback Resume Directive",
    category: "playback",
    description: "Choose whether footage continues from your last left timestamp or starts at 0:00.",
    type: "select",
    options: [
      { label: "Resume from Last Left", value: "resume", hint: "YouTube Style" },
      { label: "Always Start at 0:00", value: "beginning", hint: "Fresh Start" },
    ],
  },
  playbackAutoPlay: {
    key: "playbackAutoPlay",
    label: "Auto-Play on Open",
    category: "playback",
    description: "Automatically start video playback upon opening the pro cinema player.",
    type: "boolean",
  },
  playbackDefaultVolume: {
    key: "playbackDefaultVolume",
    label: "Default Volume",
    category: "playback",
    description: "Initial audio volume level from 0% to 100%.",
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
  },
  playbackMutedByDefault: {
    key: "playbackMutedByDefault",
    label: "Mute by Default",
    category: "playback",
    description: "Always open player with audio muted.",
    type: "boolean",
  },
  sidebarWidth: {
    key: "sidebarWidth",
    label: "Sidebar Width",
    category: "ui",
    description: "Adjust the width of the navigation sidebar in pixels.",
    type: "number",
    min: 180,
    max: 420,
    step: 10,
  },
  uploadChartStyle: {
    key: "uploadChartStyle",
    label: "Upload Visualization",
    category: "ui",
    description: "Telemetry chart display mode for chunk ingestion.",
    type: "select",
    options: [
      { label: "Speed Graph", value: "graph", hint: "Windows Style" },
      { label: "Progress Bar", value: "progress-bar", hint: "Clean Linear" },
    ],
  },
  folderBrowsingStyle: {
    key: "folderBrowsingStyle",
    label: "Folder Browsing Layout",
    category: "ui",
    description: "Visual layout style for folders and subfolder navigation.",
    type: "select",
    options: [
      { label: "Shelf View", value: "shelf", hint: "Horizontal Carousel" },
      { label: "Finder View", value: "finder", hint: "Hierarchical Grid" },
    ],
  },
  theme: {
    key: "theme",
    label: "Appearance Theme",
    category: "ui",
    description: "Interface color appearance mode.",
    type: "select",
    options: [
      { label: "Dark Mode", value: "dark" },
      { label: "Light Mode", value: "light" },
      { label: "System Default", value: "system" },
    ],
  },
  autoCategorizeOnImport: {
    key: "autoCategorizeOnImport",
    label: "Automatic Game Matching",
    category: "system",
    description: "Auto-detect and categorize clips into game profiles based on filename rules.",
    type: "boolean",
  },
  preserveOriginalsImmutable: {
    key: "preserveOriginalsImmutable",
    label: "Immutable Originals Policy",
    category: "system",
    description: "Enforces strict zero-overwrite protection on master footage in /originals/.",
    type: "boolean",
  },
};

export const DEFAULT_SETTINGS: VaultSettings = {
  playbackResumeBehavior: "resume",
  playbackAutoPlay: true,
  playbackDefaultVolume: 0.8,
  playbackMutedByDefault: false,
  sidebarWidth: 260,
  uploadChartStyle: "graph",
  folderBrowsingStyle: "shelf",
  theme: "dark",
  autoCategorizeOnImport: true,
  preserveOriginalsImmutable: true,
};

const STORAGE_KEY = "gamevault_enterprise_settings_v1";
const SETTING_EVENT_NAME = "gamevault:setting_changed";

// In-Memory Singleton Cache for 0ms synchronous access across the entire app
let inMemorySettings: VaultSettings = { ...DEFAULT_SETTINGS };
let isInitialized = false;

type SettingListener<K extends keyof VaultSettings> = (value: VaultSettings[K]) => void;
type GlobalListener = (settings: VaultSettings) => void;

const listenersMap: Map<keyof VaultSettings, Set<SettingListener<any>>> = new Map();
const globalListeners: Set<GlobalListener> = new Set();

/**
 * Initializes the settings engine by reading local storage, reconciling
 * legacy individual storage keys, and pulling server-persisted database overrides.
 */
function initMemory(): void {
  if (typeof window === "undefined" || isInitialized) return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let loaded: Partial<VaultSettings> = {};
    if (raw) {
      try {
        loaded = JSON.parse(raw);
      } catch {}
    }

    // Backward compatibility with previous fragmented localStorage keys
    const legacyResume = localStorage.getItem("gamevault_playback_resume");
    if (legacyResume === "beginning" || legacyResume === "resume") {
      loaded.playbackResumeBehavior = legacyResume;
    }

    const legacySidebar = localStorage.getItem("gamevault_sidebar_width");
    if (legacySidebar) {
      const parsed = parseInt(legacySidebar, 10);
      if (!isNaN(parsed) && parsed >= 180 && parsed <= 500) {
        loaded.sidebarWidth = parsed;
      }
    }

    const legacyChart = localStorage.getItem("gamevault_upload_chart_style");
    if (legacyChart === "progress-bar" || legacyChart === "graph") {
      loaded.uploadChartStyle = legacyChart;
    }

    const legacyFolder = localStorage.getItem("gamevault_folder_style");
    if (legacyFolder === "finder" || legacyFolder === "shelf") {
      loaded.folderBrowsingStyle = legacyFolder;
    }

    inMemorySettings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
    };
    isInitialized = true;

    // Background server synchronization
    syncWithServer();
  } catch (err) {
    inMemorySettings = { ...DEFAULT_SETTINGS };
    isInitialized = true;
  }
}

// Ensure in-memory state is initialized in browser
if (typeof window !== "undefined") {
  initMemory();

  // Listen for storage events across browser tabs
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        inMemorySettings = { ...DEFAULT_SETTINGS, ...parsed };
        notifyAll(inMemorySettings);
      } catch {}
    }
  });
}

function notifyAll(settings: VaultSettings, changedKey?: keyof VaultSettings): void {
  if (changedKey) {
    const specificListeners = listenersMap.get(changedKey);
    if (specificListeners) {
      specificListeners.forEach((cb) => {
        try {
          cb(settings[changedKey]);
        } catch (e) {
          console.error(`[SettingsEngine] Error in listener for ${String(changedKey)}:`, e);
        }
      });
    }
  }

  globalListeners.forEach((cb) => {
    try {
      cb(settings);
    } catch (e) {
      console.error("[SettingsEngine] Error in global listener:", e);
    }
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SETTING_EVENT_NAME, {
        detail: { key: changedKey, settings },
      })
    );
  }
}

let serverSyncDebounceTimer: any = null;

/**
 * Persists pending settings to the backend PostgreSQL Database via /api/settings
 * with automatic debounce so rapid changes (e.g. dragging sliders) don't flood the DB.
 */
function scheduleServerSync(updatedSettings: VaultSettings): void {
  if (typeof window === "undefined") return;

  if (serverSyncDebounceTimer) {
    clearTimeout(serverSyncDebounceTimer);
  }

  serverSyncDebounceTimer = setTimeout(async () => {
    try {
      // Map typed settings to strings for the database Setting table
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(updatedSettings)) {
        payload[`pref_${k}`] = typeof v === "string" ? v : JSON.stringify(v);
      }

      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload }),
      });
    } catch (err) {
      // Server sync error is non-blocking — local-first guarantee preserves user state
      console.warn("[SettingsEngine] Optimistic server sync deferred:", err);
    }
  }, 400);
}

/**
 * Synchronizes client settings with backend PostgreSQL database on boot
 */
async function syncWithServer(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const res = await fetch("/api/settings");
    const data = await res.json();

    if (data.success && data.settings) {
      const serverSettings = data.settings;
      let hasChanges = false;
      const reconciled: Record<string, any> = { ...inMemorySettings };

      for (const [dbKey, dbVal] of Object.entries(serverSettings)) {
        if (dbKey.startsWith("pref_")) {
          const settingKey = dbKey.replace("pref_", "");
          if (settingKey in DEFAULT_SETTINGS) {
            let parsedVal: any = dbVal;
            try {
              parsedVal = JSON.parse(dbVal as string);
            } catch {
              parsedVal = dbVal;
            }

            if (reconciled[settingKey] !== parsedVal) {
              reconciled[settingKey] = parsedVal;
              hasChanges = true;
            }
          }
        }
      }

      if (hasChanges) {
        inMemorySettings = reconciled as VaultSettings;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemorySettings));
        notifyAll(inMemorySettings);
      }
    }
  } catch (err) {
    // Offline or server booting; local-first settings remain active
  }
}

/**
 * Synchronous getter: 0ms latency for components and media pipelines
 */
export function getVaultSetting<K extends keyof VaultSettings>(key: K): VaultSettings[K] {
  if (typeof window !== "undefined" && !isInitialized) {
    initMemory();
  }
  return inMemorySettings[key];
}

/**
 * Synchronous snapshot of all current settings
 */
export function getAllVaultSettings(): VaultSettings {
  if (typeof window !== "undefined" && !isInitialized) {
    initMemory();
  }
  return { ...inMemorySettings };
}

/**
 * Sets a specific setting with 0ms local update, instant broadcast, and optimistic server save
 */
export function setVaultSetting<K extends keyof VaultSettings>(key: K, value: VaultSettings[K]): void {
  initMemory();

  if (inMemorySettings[key] === value) return;

  inMemorySettings = {
    ...inMemorySettings,
    [key]: value,
  } as VaultSettings;

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemorySettings));

      // Keep legacy individual keys synchronized for any external scripts
      if (key === "playbackResumeBehavior") {
        localStorage.setItem("gamevault_playback_resume", String(value));
      } else if (key === "sidebarWidth") {
        localStorage.setItem("gamevault_sidebar_width", String(value));
      } else if (key === "uploadChartStyle") {
        localStorage.setItem("gamevault_upload_chart_style", String(value));
      } else if (key === "folderBrowsingStyle") {
        localStorage.setItem("gamevault_folder_style", String(value));
      }
    } catch {}

    scheduleServerSync(inMemorySettings);
  }

  notifyAll(inMemorySettings, key);
}

/**
 * Batch updates multiple settings atomically
 */
export function setVaultSettings(partial: Partial<VaultSettings>): void {
  initMemory();

  inMemorySettings = {
    ...inMemorySettings,
    ...partial,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemorySettings));
    } catch {}
    scheduleServerSync(inMemorySettings);
  }

  notifyAll(inMemorySettings);
}

/**
 * Subscribe to changes on a specific setting (non-React observer)
 */
export function subscribeVaultSetting<K extends keyof VaultSettings>(
  key: K,
  callback: SettingListener<K>
): () => void {
  if (!listenersMap.has(key)) {
    listenersMap.set(key, new Set());
  }
  listenersMap.get(key)!.add(callback);

  return () => {
    listenersMap.get(key)?.delete(callback);
  };
}

/**
 * Primary React Hook: Reactive, zero-latency setting binding
 *
 * Usage:
 * const [resumeBehavior, setResumeBehavior] = useVaultSetting("playbackResumeBehavior");
 */
export function useVaultSetting<K extends keyof VaultSettings>(
  key: K
): [VaultSettings[K], (newValue: VaultSettings[K]) => void] {
  const [value, setValue] = useState<VaultSettings[K]>(() => getVaultSetting(key));

  useEffect(() => {
    // Sync state in case it updated before mount
    setValue(getVaultSetting(key));

    const unsubscribe = subscribeVaultSetting(key, (newVal) => {
      setValue(newVal);
    });

    return unsubscribe;
  }, [key]);

  const update = useCallback(
    (newValue: VaultSettings[K]) => {
      setVaultSetting(key, newValue);
    },
    [key]
  );

  return [value, update];
}

/**
 * Hook to access and mutate the full settings record reactively
 */
export function useVaultSettings(): [VaultSettings, (partial: Partial<VaultSettings>) => void] {
  const [settings, setSettings] = useState<VaultSettings>(() => getAllVaultSettings());

  useEffect(() => {
    setSettings(getAllVaultSettings());

    const listener = (newSettings: VaultSettings) => {
      setSettings({ ...newSettings });
    };

    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }, []);

  const updateBatch = useCallback((partial: Partial<VaultSettings>) => {
    setVaultSettings(partial);
  }, []);

  return [settings, updateBatch];
}

/**
 * Resets a specific setting to its factory default
 */
export function resetVaultSetting<K extends keyof VaultSettings>(key: K): void {
  setVaultSetting(key, DEFAULT_SETTINGS[key]);
}

/**
 * Resets all settings back to factory defaults
 */
export function resetAllVaultSettings(): void {
  setVaultSettings({ ...DEFAULT_SETTINGS });
}

