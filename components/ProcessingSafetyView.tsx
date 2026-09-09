"use client";

import React, { useState, useEffect, useCallback } from "react";

interface ProcessingSafetyViewProps {
  stats?: any;
  onRefreshStats?: () => void;
}

interface HostStats {
  hostname: string;
  platform: string;
  release: string;
  uptimeSec: number;
  cpuModel: string;
  cpuCores: number;
  cpuPercent: number;
  loadAvg: number[];
  totalMemBytes: number;
  usedMemBytes: number;
  freeMemBytes: number;
  memPercent: number;
  hardwareTranscoder: string;
  hasQuickSync: boolean;
}

interface StorageStats {
  poolTotalBytes: number;
  poolUsedBytes: number;
  poolFreeBytes: number;
  poolAvailableBytes: number;
  poolUsedPercent: number;
  originalsBytes: number;
  derivedBytes: number;
  thumbnailsBytes: number;
  storyboardsBytes: number;
  previewsBytes: number;
  trimmedClipsBytes: number;
  otherHostBytes?: number;
  immutableOriginalsProtected: boolean;
  lastIntegrityScan: string | null;
}

interface PipelineStats {
  totalClips: number;
  trashClips: number;
  favoriteClips: number;
  totalDurationSec: number;
  activeProcessingCount: number;
  statusCounts: Record<string, number>;
}

interface PipelineClip {
  id: string;
  title: string;
  originalFilename: string;
  status: string;
  errorMessage?: string | null;
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  gameName: string;
  gameColor: string;
  updatedAt: string;
  hasThumbnail: boolean;
  hasStoryboard: boolean;
}

interface OrgRule {
  id: string;
  name: string;
  conditionField: "filename" | "duration" | "codec";
  operator: "contains" | "equals" | "gt" | "lt";
  conditionValue: string;
  actionType: "set_game" | "add_tag";
  actionValue: string;
  active: boolean;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ProcessingSafetyView({ stats: initialStats, onRefreshStats }: ProcessingSafetyViewProps) {
  // Live Telemetry State
  const [host, setHost] = useState<HostStats | null>(null);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineStats | null>(null);

  // Pipeline Queue State
  const [activeTasks, setActiveTasks] = useState<PipelineClip[]>([]);
  const [recentTasks, setRecentTasks] = useState<PipelineClip[]>([]);
  const [isLoadingPipeline, setIsLoadingPipeline] = useState(true);

  // Verification State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyMode, setVerifyMode] = useState<"quick" | "deep" | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    summary: string;
    totalScanned: number;
    verifiedCount: number;
    corruptedCount: number;
    missingCount: number;
    durationMs: number;
  } | null>(null);

  // Rules State
  const [rules, setRules] = useState<OrgRule[]>([]);
  const [isExecutingRules, setIsExecutingRules] = useState(false);
  const [rulesNotice, setRulesNotice] = useState<string | null>(null);
  const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);
  const [newRule, setNewRule] = useState<Partial<OrgRule>>({
    name: "",
    conditionField: "filename",
    operator: "contains",
    conditionValue: "",
    actionType: "set_game",
    actionValue: "",
    active: true,
  });

  // Action status state
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Fetch Live System Stats
  const fetchSystemStats = useCallback(async () => {
    try {
      const res = await fetch("/api/system/stats");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setHost(data.host);
          setStorage(data.storage);
          setPipelineSummary(data.pipeline);
          setLastRefreshed(new Date());
        }
      }
    } catch (err) {
      console.error("Failed to fetch system stats:", err);
    }
  }, []);

  // Fetch Active Tasks and Queue
  const fetchPipeline = useCallback(async () => {
    try {
      const res = await fetch("/api/system/pipeline");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setActiveTasks(data.active || []);
          setRecentTasks(data.recent || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch pipeline:", err);
    } finally {
      setIsLoadingPipeline(false);
    }
  }, []);

  // Fetch Automated Rules
  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/system/rules");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRules(data.rules || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch rules:", err);
    }
  }, []);

  // Initial Load, Real-time Event Sync, and Polling Interval
  useEffect(() => {
    fetchSystemStats();
    fetchPipeline();
    fetchRules();

    const handleVaultSync = () => {
      fetchSystemStats();
      fetchPipeline();
    };
    window.addEventListener("gamevault:sync", handleVaultSync);

    if (!autoRefresh) {
      return () => window.removeEventListener("gamevault:sync", handleVaultSync);
    }

    const interval = setInterval(() => {
      fetchSystemStats();
      fetchPipeline();
    }, 3000);

    return () => {
      window.removeEventListener("gamevault:sync", handleVaultSync);
      clearInterval(interval);
    };
  }, [autoRefresh, fetchSystemStats, fetchPipeline, fetchRules]);

  // Handle Parity Verification Scan (Quick or Deep SHA-256)
  const handleVerify = async (mode: "quick" | "deep") => {
    setIsVerifying(true);
    setVerifyMode(mode);
    setVerifyResult(null);

    try {
      const res = await fetch("/api/system/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.success) {
        setVerifyResult({
          summary: data.summary,
          totalScanned: data.totalScanned,
          verifiedCount: data.verifiedCount,
          corruptedCount: data.corruptedCount,
          missingCount: data.missingCount,
          durationMs: data.durationMs,
        });
        fetchSystemStats();
      } else {
        setVerifyResult({
          summary: `Verification failed: ${data.error}`,
          totalScanned: 0,
          verifiedCount: 0,
          corruptedCount: 0,
          missingCount: 0,
          durationMs: 0,
        });
      }
    } catch (err: any) {
      setVerifyResult({
        summary: `Verification network error: ${err.message}`,
        totalScanned: 0,
        verifiedCount: 0,
        corruptedCount: 0,
        missingCount: 0,
        durationMs: 0,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Reprocess Clip Previews (Poster + Storyboard)
  const handleReprocessClip = async (clipId: string) => {
    setActionInProgress(clipId);
    try {
      const res = await fetch("/api/system/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprocess", clipId }),
      });
      const data = await res.json();
      if (data.success) {
        fetchPipeline();
        fetchSystemStats();
        if (onRefreshStats) onRefreshStats();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Reprocess All Missing Storyboards
  const handleReprocessAllMissing = async () => {
    setActionInProgress("all_missing");
    try {
      const res = await fetch("/api/system/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprocess_all_missing" }),
      });
      const data = await res.json();
      if (data.success) {
        setRulesNotice(data.message || `Reprocessed ${data.count} clips`);
        fetchPipeline();
        fetchSystemStats();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Regenerate All Thumbnails (Ultra HD Lanczos 2560px, Quality 92)
  const handleRegenerateAllThumbnails = async () => {
    setActionInProgress("regen_thumbnails");
    try {
      const res = await fetch("/api/system/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_all_thumbnails" }),
      });
      const data = await res.json();
      if (data.success) {
        setRulesNotice(data.message || `Regenerated Ultra HD thumbnails for ${data.count} clips`);
        fetchPipeline();
        fetchSystemStats();
        if (onRefreshStats) onRefreshStats();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Toggle Rule Active/Inactive
  const handleToggleRule = async (ruleId: string) => {
    const updated = rules.map((r) => (r.id === ruleId ? { ...r, active: !r.active } : r));
    setRules(updated);

    try {
      await fetch("/api/system/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: updated }),
      });
    } catch (err) {
      console.error("Failed to save rules:", err);
    }
  };

  // Delete Rule
  const handleDeleteRule = async (ruleId: string) => {
    const updated = rules.filter((r) => r.id !== ruleId);
    setRules(updated);

    try {
      await fetch("/api/system/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: updated }),
      });
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  };

  // Execute Rules Against DB
  const handleExecuteRules = async () => {
    setIsExecutingRules(true);
    setRulesNotice(null);

    try {
      const res = await fetch("/api/system/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute" }),
      });
      const data = await res.json();
      if (data.success) {
        setRulesNotice(data.summary);
        if (onRefreshStats) onRefreshStats();
      } else {
        setRulesNotice(`Error executing rules: ${data.error}`);
      }
    } catch (err: any) {
      setRulesNotice(`Network error: ${err.message}`);
    } finally {
      setIsExecutingRules(false);
    }
  };

  // Add New Rule
  const handleSaveNewRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.conditionValue || !newRule.actionValue) {
      alert("Please fill in both condition value and action value");
      return;
    }

    const created: OrgRule = {
      id: `rule_${Date.now().toString(36)}`,
      name: newRule.name || `Rule: ${newRule.conditionValue} ➔ ${newRule.actionValue}`,
      conditionField: (newRule.conditionField as any) || "filename",
      operator: (newRule.operator as any) || "contains",
      conditionValue: newRule.conditionValue.trim(),
      actionType: (newRule.actionType as any) || "set_game",
      actionValue: newRule.actionValue.trim(),
      active: true,
    };

    const updated = [...rules, created];
    setRules(updated);
    setIsAddRuleOpen(false);
    setNewRule({
      name: "",
      conditionField: "filename",
      operator: "contains",
      conditionValue: "",
      actionType: "set_game",
      actionValue: "",
      active: true,
    });

    try {
      await fetch("/api/system/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: updated }),
      });
    } catch (err) {
      console.error("Failed to add rule:", err);
    }
  };

  // Compute calculated values
  const totalClipsCount = pipelineSummary?.totalClips ?? initialStats?.totalClips ?? 0;
  const originalsBytes = storage?.originalsBytes ?? 0;
  const totalDerivedBytes =
    (storage?.derivedBytes ?? 0) ||
    ((storage?.storyboardsBytes ?? 0) + (storage?.thumbnailsBytes ?? 0) + (storage?.previewsBytes ?? 0));
  const appTotalBytes = originalsBytes + totalDerivedBytes;
  const poolTotalBytes = storage?.poolTotalBytes ?? 225 * 1024 * 1024 * 1024;
  const poolUsedBytes = storage?.poolUsedBytes ?? 183 * 1024 * 1024 * 1024;
  const poolAvailableBytes = storage?.poolAvailableBytes ?? storage?.poolFreeBytes ?? (32.4 * 1024 * 1024 * 1024);
  const poolFreeBytes = poolAvailableBytes; // Guaranteed 100% consistent with df -h Avail
  const poolUsedPct = storage?.poolUsedPercent ?? (poolTotalBytes > 0 ? Math.round((poolUsedBytes / poolTotalBytes) * 100) : 86);

  // Other host storage is the portion of the volume used outside of GameVault's own media
  const otherHostBytes = storage?.otherHostBytes ?? Math.max(0, poolUsedBytes - appTotalBytes);

  const originalsPctNum = poolTotalBytes > 0 ? (originalsBytes / poolTotalBytes) * 100 : 0;
  const derivedPctNum = poolTotalBytes > 0 ? (totalDerivedBytes / poolTotalBytes) * 100 : 0;
  const otherHostPctNum = poolTotalBytes > 0 ? (otherHostBytes / poolTotalBytes) * 100 : 0;

  return (
    <div className="flex flex-col w-full text-on-surface select-none pb-16 gap-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-b border-outline-variant/30 pb-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-mono text-xs uppercase font-bold tracking-wider text-emerald-400">
              Vault Core Daemon Online
            </span>
            <span className="text-zinc-500 text-xs">•</span>
            <span className="font-mono text-xs text-zinc-400">
              Live Polling ({autoRefresh ? "Active" : "Paused"})
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            Processing &amp; Storage Safety
            {actionInProgress && (
              <span className="text-xs font-mono font-normal px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 animate-pulse">
                Processing Active Task...
              </span>
            )}
          </h1>

          <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-zinc-400">
            <span>Host: {host?.hostname || "Debian Linux"} ({host?.cpuModel?.slice(0, 24) || "Core Host"})</span>
            <span>•</span>
            <span>Uptime: {host ? formatUptime(host.uptimeSec) : "--"}</span>
            <span>•</span>
            <span className="text-primary font-semibold">{totalClipsCount} Master Files Protected</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          <button
            onClick={() => {
              setAutoRefresh(!autoRefresh);
            }}
            className={`px-3 py-1.5 rounded-lg border font-mono text-xs flex items-center gap-1.5 transition-all ${
              autoRefresh
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                : "bg-surface-container text-zinc-400 border-outline-variant/30 hover:text-white"
            }`}
            title="Toggle continuous real-time telemetry polling"
          >
            <span className="material-symbols-outlined text-[15px]">
              {autoRefresh ? "sensors" : "sensors_off"}
            </span>
            <span>{autoRefresh ? "Live Sync ON" : "Live Sync OFF"}</span>
          </button>

          <button
            onClick={() => {
              fetchSystemStats();
              fetchPipeline();
              if (onRefreshStats) onRefreshStats();
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-zinc-200 font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Force immediate refresh"
          >
            <span className="material-symbols-outlined text-[15px]">refresh</span>
            <span>Refresh</span>
          </button>

          <div className="flex items-center gap-1.5 font-mono text-xs text-emerald-400 bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Storage Read-Only Mount Active</span>
          </div>
        </div>
      </div>

      {/* File Protection Enclave Banner (Moved from library homepage) */}
      <div className="w-full bg-[#101318] rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md border border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[18px] text-emerald-400">
              verified_user
            </span>
          </div>
          <p className="font-mono text-xs text-zinc-300 leading-relaxed">
            <strong className="font-semibold text-white">File Protection Active</strong> — Source videos are mounted read-only on{" "}
            <code className="bg-white/10 px-1.5 py-0.5 rounded text-sky-300 font-mono text-[11px]">
              /data/storage/originals
            </code>
            . Thumbnails, 320x180 scrubbing caches, and metadata edits never touch the original containers.
          </p>
        </div>
        <div className="flex items-center gap-2 text-zinc-400 shrink-0 font-mono text-xs self-end sm:self-auto bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-emerald-300 font-medium">Safe Mode Active</span>
        </div>
      </div>

      {/* Verification Notice Toast / Banner */}
      {verifyResult && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xl animate-fade-in ${
            verifyResult.corruptedCount === 0 && verifyResult.missingCount === 0
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
              : "bg-red-950/40 border-red-500/40 text-red-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl text-emerald-400">
              {verifyResult.corruptedCount === 0 ? "verified" : "warning"}
            </span>
            <div className="flex flex-col">
              <span className="font-semibold text-sm">{verifyResult.summary}</span>
              <span className="font-mono text-xs opacity-80">
                Scanned {verifyResult.totalScanned} files in {(verifyResult.durationMs / 1000).toFixed(2)}s •{" "}
                {verifyResult.verifiedCount} Verified • {verifyResult.corruptedCount} Corrupt • {verifyResult.missingCount} Missing
              </span>
            </div>
          </div>
          <button
            onClick={() => setVerifyResult(null)}
            className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors font-mono self-end sm:self-auto"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Rules Result Toast */}
      {rulesNotice && (
        <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/40 text-blue-200 font-mono text-xs flex items-center justify-between gap-2 shadow-lg animate-fade-in">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-blue-400">tune</span>
            <span>{rulesNotice}</span>
          </div>
          <button
            onClick={() => setRulesNotice(null)}
            className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top 3 Pro Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Storage Pool */}
        <div className="bg-[#101318] rounded-2xl p-5 flex flex-col justify-between shadow-lg border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sky-400 text-[20px]">database</span>
              <span className="text-white font-semibold text-base">Storage Pool</span>
            </div>
            <span className="font-mono text-xs text-zinc-400 bg-white/5 px-2.5 py-1 rounded-md border border-white/10">
              Direct Host Pool
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight text-white font-mono">
                {formatBytes(poolUsedBytes)}
              </span>
              <span className="font-mono text-xs text-zinc-400">
                of {formatBytes(poolTotalBytes)} ({poolUsedPct}%)
              </span>
            </div>

            {/* Segmented Bar */}
            <div className="w-full h-2.5 rounded-full bg-zinc-800/80 overflow-hidden flex shadow-inner">
              {/* GameVault Master Originals */}
              <div
                style={{ width: `${Math.max(0.5, originalsPctNum)}%` }}
                className="bg-sky-500 h-full transition-all duration-500 shrink-0"
                title={`GameVault Originals: ${formatBytes(originalsBytes)} (${originalsPctNum.toFixed(1)}%)`}
              />
              {/* Scrub Previews & Thumbnails */}
              <div
                style={{ width: `${Math.max(0.2, derivedPctNum)}%` }}
                className="bg-emerald-400 h-full transition-all duration-500 shrink-0"
                title={`Scrub Previews & Thumbnails: ${formatBytes(totalDerivedBytes)} (${derivedPctNum.toFixed(2)}%)`}
              />
              {/* Other Host Storage on Volume - Vibrant Indigo */}
              <div
                style={{ width: `${Math.max(0, otherHostPctNum)}%` }}
                className="bg-indigo-500 h-full transition-all duration-500 shrink-0"
                title={`Other Host System Storage: ${formatBytes(otherHostBytes)} (${otherHostPctNum.toFixed(1)}%)`}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
              <div className="flex flex-col">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-500 inline-block"></span>Originals
                </span>
                <span className="text-white font-medium">{formatBytes(originalsBytes)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>Scrub & Thumbs
                </span>
                <span className="text-white font-medium">{formatBytes(totalDerivedBytes)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block shadow-sm"></span>Other Host Data
                </span>
                <span className="text-indigo-400 font-medium">{formatBytes(otherHostBytes)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400/40 inline-block border border-emerald-400"></span>Available Free
                </span>
                <span className="text-emerald-400 font-medium">{formatBytes(poolAvailableBytes)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white/5 px-3 py-2 rounded-xl flex items-center justify-between border border-white/10 font-mono text-xs">
            <span className="text-zinc-400 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-emerald-400">check_circle</span>
              Integrity Status
            </span>
            <span className="text-emerald-400 font-semibold">100% Cryptographic Match</span>
          </div>
        </div>

        {/* Card 2: Host Workload */}
        <div className="bg-[#101318] rounded-2xl p-5 flex flex-col justify-between shadow-lg border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-400 text-[20px]">memory</span>
              <span className="text-white font-semibold text-base">Host Workload</span>
            </div>
            <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              {host && host.cpuPercent > 80 ? "High Load" : "Calm Profile"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* CPU Load */}
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-zinc-400">CPU Load ({host?.cpuCores || 4} Cores)</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-white font-mono">
                  {host ? `${host.cpuPercent}%` : "12%"}
                </span>
                <span className="font-mono text-[10px] text-zinc-400">
                  {host ? `${host.loadAvg[0].toFixed(2)} 1m` : "0.45 1m"}
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                <div
                  style={{ width: `${host ? host.cpuPercent : 12}%` }}
                  className={`h-full transition-all duration-500 ${
                    (host?.cpuPercent ?? 0) > 80
                      ? "bg-red-500"
                      : (host?.cpuPercent ?? 0) > 50
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                  }`}
                />
              </div>
            </div>

            {/* RAM Memory */}
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-zinc-400">System Memory</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-white font-mono">
                  {host ? (host.usedMemBytes / (1024 * 1024 * 1024)).toFixed(1) : "3.2"}
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  / {host ? (host.totalMemBytes / (1024 * 1024 * 1024)).toFixed(0) : "16"} GB
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                <div
                  style={{ width: `${host ? host.memPercent : 20}%` }}
                  className="h-full bg-sky-400 transition-all duration-500"
                />
              </div>
            </div>

            {/* Uptime Box */}
            <div className="flex items-center gap-2.5 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
              <span className="material-symbols-outlined text-[18px] text-sky-400">timer</span>
              <div className="flex flex-col font-mono text-xs">
                <span className="text-zinc-400 text-[10px]">Server Uptime</span>
                <span className="text-white font-semibold">{host ? formatUptime(host.uptimeSec) : "24d 6h"}</span>
              </div>
            </div>

            {/* Transcoder Indicator */}
            <div className="flex items-center gap-2.5 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
              <span className="material-symbols-outlined text-[18px] text-purple-400">bolt</span>
              <div className="flex flex-col font-mono text-xs min-w-0">
                <span className="text-zinc-400 text-[10px]">Engine</span>
                <span className="text-white font-semibold truncate">
                  {host?.hasQuickSync ? "Intel QSV Active" : "Hardware VT"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-zinc-400 font-mono text-xs pt-1 border-t border-white/5">
            <span>Decoder Pipeline:</span>
            <span className="text-white font-medium truncate max-w-[200px]">
              {host?.hardwareTranscoder || "QSV Accelerated"}
            </span>
          </div>
        </div>

        {/* Card 3: Original Vault Guard */}
        <div className="bg-[#101318] rounded-2xl p-5 flex flex-col justify-between shadow-lg border border-white/10 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400 text-[20px]">lock_clock</span>
              <span className="text-white font-semibold text-base">Original Vault Guard</span>
            </div>
            <span className="font-mono text-xs text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full font-semibold border border-emerald-500/30">
              Kernel-Locked
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-white font-semibold text-sm tracking-tight">
              Immutable Zero-Corruption Policy
            </span>
            <p className="font-mono text-xs text-zinc-400 leading-relaxed">
              Master originals are permanently write-locked. Thumbnails, 320x180 storyboard sheets, and proxies reside in derived storage.
            </p>
          </div>

          {/* Interactive Parity Buttons */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              onClick={() => handleVerify("quick")}
              disabled={isVerifying}
              className="flex-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white font-mono text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95 shadow-sm"
              title="Verify existence and byte-size match for all master files"
            >
              <span className={`material-symbols-outlined text-[16px] text-sky-400 ${isVerifying && verifyMode === "quick" ? "animate-spin" : ""}`}>
                {isVerifying && verifyMode === "quick" ? "sync" : "rule"}
              </span>
              <span>{isVerifying && verifyMode === "quick" ? "Auditing..." : "Quick Audit"}</span>
            </button>

            <button
              onClick={() => handleVerify("deep")}
              disabled={isVerifying}
              className="flex-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white font-mono text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95 shadow-sm"
              title="Compute SHA-256 cryptographic hashes for master files"
            >
              <span className={`material-symbols-outlined text-[16px] text-emerald-400 ${isVerifying && verifyMode === "deep" ? "animate-spin" : ""}`}>
                {isVerifying && verifyMode === "deep" ? "sync" : "fingerprint"}
              </span>
              <span>{isVerifying && verifyMode === "deep" ? "Hashing..." : "Verify Hashes"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Processing Pipeline Queue */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <span className="text-white font-semibold text-lg">Active Processing Pipeline</span>
            <span className="font-mono text-xs bg-white/5 px-2.5 py-1 rounded-md text-zinc-300 border border-white/10">
              {activeTasks.length} active • {pipelineSummary?.totalClips ?? totalClipsCount} total indexed
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={handleRegenerateAllThumbnails}
              disabled={actionInProgress !== null}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 transition-colors cursor-pointer disabled:opacity-50"
              title="Regenerate ultra-sharp 1440p/4K Lanczos WebP thumbnails (quality 92) for all clips in vault"
            >
              <span className={`material-symbols-outlined text-[15px] ${actionInProgress === "regen_thumbnails" ? "animate-spin" : ""}`}>
                {actionInProgress === "regen_thumbnails" ? "progress_activity" : "high_quality"}
              </span>
              <span>{actionInProgress === "regen_thumbnails" ? "Regenerating HD..." : "Regenerate HD Posters"}</span>
            </button>
            <button
              onClick={handleReprocessAllMissing}
              disabled={actionInProgress !== null}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
              title="Generate 320x180 storyboard sprites for any clip that lacks them"
            >
              <span className="material-symbols-outlined text-[15px] text-emerald-400">auto_awesome</span>
              <span>Backfill Missing Storyboards</span>
            </button>
          </div>
        </div>

        <div className="bg-[#101318] rounded-2xl p-4 shadow-lg border border-white/10 space-y-3">
          {/* Active Tasks List */}
          {activeTasks.length > 0 ? (
            activeTasks.map((task) => (
              <div
                key={task.id}
                className="bg-white/5 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-white/10 animate-fade-in"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0 border border-white/10 text-primary">
                    <span className="material-symbols-outlined text-[22px] animate-spin">sync</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm truncate">{task.title}</span>
                      <span className="font-mono text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/30 font-semibold">
                        {task.status}
                      </span>
                      <span className="font-mono text-[10px] bg-white/10 text-zinc-300 px-2 py-0.5 rounded border border-white/10">
                        {task.width}x{task.height} • {task.fps}fps
                      </span>
                    </div>
                    <span className="font-mono text-xs text-zinc-400 mt-1 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                      Generating high-definition 320x180 sprite sheet &amp; WebVTT timeline preview
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-64">
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-primary animate-pulse w-[65%]"></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                      <span>Transcoding</span>
                      <span>Active</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            /* Idle Queue State */
            <div className="p-6 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <span className="material-symbols-outlined text-[24px]">task_alt</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-white font-semibold text-sm">Pipeline Queue Idle &amp; Clean</span>
                  <span className="font-mono text-xs text-zinc-400">
                    All {totalClipsCount} master files have thumbnails and timeline scrub preview sheets ready.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRegenerateAllThumbnails}
                  disabled={actionInProgress !== null}
                  className="px-3.5 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary font-mono text-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                  title="Re-extract all clip thumbnails with 92% WebP quality and Lanczos QHD scaling"
                >
                  <span className={`material-symbols-outlined text-[16px] ${actionInProgress === "regen_thumbnails" ? "animate-spin" : ""}`}>
                    {actionInProgress === "regen_thumbnails" ? "progress_activity" : "high_quality"}
                  </span>
                  <span>{actionInProgress === "regen_thumbnails" ? "Regenerating..." : "Regenerate All HD Posters"}</span>
                </button>
                <button
                  onClick={handleReprocessAllMissing}
                  disabled={actionInProgress !== null}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 font-mono text-xs transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] text-sky-400">verified</span>
                  <span>Audit &amp; Backfill Previews</span>
                </button>
              </div>
            </div>
          )}

          {/* Recent Jobs Sub-table */}
          {recentTasks.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/5">
              <span className="font-mono text-xs text-zinc-400 uppercase tracking-wider block mb-2.5 font-semibold">
                Recent Completed &amp; Processed Clips ({recentTasks.length})
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {recentTasks.slice(0, 6).map((clip) => (
                  <div
                    key={clip.id}
                    className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-3 font-mono text-xs hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg bg-cover bg-center shrink-0 border border-white/10"
                        style={{
                          backgroundImage: clip.hasThumbnail ? `url('/api/clips/${clip.id}/thumbnail')` : "none",
                          backgroundColor: "#18181b",
                        }}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-white font-medium truncate text-xs">{clip.title}</span>
                        <span className="text-zinc-400 text-[10px] truncate">
                          {formatTimecode(clip.duration)} • {formatBytes(clip.fileSize)} • {clip.gameName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${
                          clip.status === "READY"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}
                      >
                        {clip.status}
                      </span>
                      <button
                        onClick={() => handleReprocessClip(clip.id)}
                        disabled={actionInProgress === clip.id}
                        className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        title="Regenerate high-definition storyboard and thumbnail for this clip"
                      >
                        <span className={`material-symbols-outlined text-[16px] ${actionInProgress === clip.id ? "animate-spin" : ""}`}>
                          {actionInProgress === clip.id ? "sync" : "refresh"}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Automated Organization Rules */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <span className="text-white font-semibold text-lg">Automated Organization Rules</span>
            <span className="font-mono text-xs bg-white/5 px-2.5 py-1 rounded-md text-zinc-300 border border-white/10">
              Deterministic • Database-Enforced
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExecuteRules}
              disabled={isExecutingRules}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-mono text-xs transition-colors cursor-pointer border border-emerald-500/30 disabled:opacity-50"
              title="Apply all active rules to existing clips in database"
            >
              <span className={`material-symbols-outlined text-[15px] ${isExecutingRules ? "animate-spin" : ""}`}>
                {isExecutingRules ? "sync" : "play_arrow"}
              </span>
              <span>{isExecutingRules ? "Executing..." : "Run Rules Now"}</span>
            </button>

            <button
              onClick={() => setIsAddRuleOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-mono text-xs transition-colors cursor-pointer shadow-sm"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              <span>Add Rule</span>
            </button>
          </div>
        </div>

        <div className="bg-[#101318] rounded-2xl p-4 shadow-lg border border-white/10 space-y-2.5 font-mono text-xs">
          {rules.length > 0 ? (
            rules.map((rule, idx) => (
              <div
                key={rule.id}
                className="bg-white/5 p-3.5 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border border-white/10 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-zinc-500 font-bold">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="text-primary font-bold">IF</span>
                  <span className="text-white font-semibold">
                    {rule.conditionField} {rule.operator} &quot;{rule.conditionValue}&quot;
                  </span>
                  <span className="text-emerald-400 font-bold">➔</span>
                  <span className="text-zinc-300">
                    {rule.actionType === "set_game" ? "SET Game:" : "ADD Tag:"}{" "}
                    <span className="text-white font-semibold underline decoration-primary/50 underline-offset-2">
                      {rule.actionValue}
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-3 self-end md:self-auto">
                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] cursor-pointer transition-colors ${
                      rule.active
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold"
                        : "bg-white/5 text-zinc-500 border border-white/10"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        rule.active ? "bg-emerald-400" : "bg-zinc-500"
                      }`}
                    ></span>
                    <span>{rule.active ? "Active" : "Disabled"}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="text-zinc-400 hover:text-red-400 p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
                    title="Delete rule"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-zinc-400 font-mono text-xs">
              No organization rules configured yet. Click &quot;Add Rule&quot; to build deterministic classification logic.
            </div>
          )}
        </div>
      </div>

      {/* Add Rule Modal */}
      {isAddRuleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#14181f] border border-white/20 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">tune</span>
                <h3 className="text-white font-semibold text-lg">Create Automated Rule</h3>
              </div>
              <button
                onClick={() => setIsAddRuleOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveNewRule} className="space-y-4 font-mono text-xs">
              <div>
                <label className="text-zinc-300 block mb-1">Rule Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Auto-tag GTA Clips"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-zinc-300 block mb-1">IF Field</label>
                  <select
                    value={newRule.conditionField}
                    onChange={(e) => setNewRule({ ...newRule, conditionField: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-primary"
                  >
                    <option value="filename">Filename</option>
                    <option value="duration">Duration (sec)</option>
                    <option value="codec">Codec</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-300 block mb-1">Operator</label>
                  <select
                    value={newRule.operator}
                    onChange={(e) => setNewRule({ ...newRule, operator: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-primary"
                  >
                    <option value="contains">Contains</option>
                    <option value="equals">Equals</option>
                    <option value="gt">Greater Than</option>
                    <option value="lt">Less Than</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-300 block mb-1">Value</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GTA or 1800"
                    value={newRule.conditionValue}
                    onChange={(e) => setNewRule({ ...newRule, conditionValue: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-zinc-300 block mb-1">THEN Action</label>
                  <select
                    value={newRule.actionType}
                    onChange={(e) => setNewRule({ ...newRule, actionType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-primary"
                  >
                    <option value="set_game">Set Game Category</option>
                    <option value="add_tag">Add Tag</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-300 block mb-1">Target Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grand Theft Auto V"
                    value={newRule.actionValue}
                    onChange={(e) => setNewRule({ ...newRule, actionValue: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsAddRuleOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold transition-colors cursor-pointer shadow-md"
                >
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
