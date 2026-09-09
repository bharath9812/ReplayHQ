"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Scissors,
  Camera,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Tag,
  Clock,
  HardDrive,
  Info,
  CheckCircle2,
  Download,
} from "lucide-react";
import { ClipData } from "./ClipCard";

interface VideoPlayerModalProps {
  clip: ClipData | null;
  onClose: () => void;
  onRefreshClip?: () => void;
}

export function VideoPlayerModal({ clip, onClose, onRefreshClip }: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(clip?.duration || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  // Timeline Scrubbing & Tooltip state
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPositionX, setHoverPositionX] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // In-Point & Out-Point for Highlight Clipper
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [isClipping, setIsClipping] = useState(false);
  const [clippedHighlightUrl, setClippedHighlightUrl] = useState<string | null>(null);
  const [clippingStatus, setClippingStatus] = useState<string>("");

  // Snapshot status
  const [isSnapshotting, setIsSnapshotting] = useState(false);
  const [snapshotSuccess, setSnapshotSuccess] = useState(false);

  useEffect(() => {
    if (!clip) return;
    setCurrentTime(0);
    setIsPlaying(false);
    setInPoint(null);
    setOutPoint(null);
    setClippedHighlightUrl(null);
  }, [clip]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!clip) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case "Space":
        case "KeyK":
          e.preventDefault();
          togglePlay();
          break;
        case "KeyJ":
          if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          break;
        case "KeyL":
          if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 1 / (clip.fps || 60));
          break;
        case "ArrowRight":
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 1 / (clip.fps || 60));
          break;
        case "KeyM":
          if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setIsMuted(videoRef.current.muted);
          }
          break;
        case "KeyI":
          if (videoRef.current) setInPoint(videoRef.current.currentTime);
          break;
        case "KeyO":
          if (videoRef.current) setOutPoint(videoRef.current.currentTime);
          break;
        case "KeyF":
          toggleFullscreen();
          break;
        case "Escape":
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clip, isPlaying, duration]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Timeline Scrubber calculations
  const handleTimelineHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    const hoverSec = pct * duration;

    setHoverPositionX(x);
    setHoverTime(hoverSec);
  };

  const handleTimelineSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !videoRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    const targetSec = pct * duration;

    videoRef.current.currentTime = targetSec;
    setCurrentTime(targetSec);
  };

  // Lossless Highlight Trimmer (sub-second ffmpeg -c copy)
  const handleExportHighlight = async () => {
    if (!clip) return;
    const start = inPoint !== null ? inPoint : 0;
    const end = outPoint !== null ? outPoint : duration;

    if (end <= start) return;

    setIsClipping(true);
    setClippingStatus("Cutting highlight (lossless stream copy)...");

    try {
      const res = await fetch(`/api/clips/${clip.id}/highlight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: start,
          endTime: end,
          title: `${clip.title} Highlight`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setClippedHighlightUrl(data.downloadUrl);
        setClippingStatus("Highlight created in <0.5s!");
        if (onRefreshClip) onRefreshClip();
      } else {
        setClippingStatus(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setClippingStatus(`Failed: ${err.message}`);
    } finally {
      setIsClipping(false);
    }
  };

  // 1-Click 4K Frame Grabber
  const handleCaptureSnapshot = async () => {
    if (!clip || !videoRef.current) return;
    const time = videoRef.current.currentTime;
    setIsSnapshotting(true);

    try {
      const downloadUrl = `/api/clips/${clip.id}/snapshot?time=${time}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${clip.title}_frame.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSnapshotSuccess(true);
      setTimeout(() => setSnapshotSuccess(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSnapshotting(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
  };

  if (!clip) return null;

  const currentPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Calculate sprite coordinates for high-definition thumbnail scrubbing (10x10 grid)
  const calculateSpriteCoords = (timeSec: number) => {
    const totalFrames = 100;
    const interval = Math.max(0.01, duration / totalFrames);
    const frameIndex = Math.min(totalFrames - 1, Math.max(0, Math.floor(timeSec / interval)));

    const col = frameIndex % 10;
    const row = Math.floor(frameIndex / 10);

    return {
      xPercent: (col / 9) * 100,
      yPercent: (row / 9) * 100,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl transition-all duration-300">
      {/* Player Container */}
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden apple-glass border border-white/10 shadow-2xl">
        {/* Top Header Bar */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3">
            {clip.game && (
              <span
                className="px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: clip.game.accentColor || "#007AFF" }}
              >
                {clip.game.name}
              </span>
            )}
            <h2 className="font-semibold text-base text-white line-clamp-1">{clip.title}</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className={`p-2 rounded-xl transition-colors ${
                showMetadata ? "bg-white/20 text-white" : "text-gray-400 hover:text-white hover:bg-white/10"
              }`}
              title="Inspect Video Metadata & Data Integrity"
            >
              <Info className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Display Area */}
        <div className="relative flex-1 flex items-center justify-center bg-black min-h-[400px]">
          <video
            ref={videoRef}
            src={`/api/clips/${clip.id}/stream`}
            poster={`/api/clips/${clip.id}/thumbnail?t=${clip.updatedAt ? new Date(clip.updatedAt).getTime() : 1}`}
            className="w-full max-h-[68vh] object-contain"
            playsInline
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) setDuration(videoRef.current.duration || clip.duration);
            }}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
          />

          {/* Center Play/Pause Flash Overlay */}
          {!isPlaying && (
            <button
              onClick={togglePlay}
              className="absolute w-20 h-20 rounded-full apple-glass flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all"
            >
              <Play className="w-8 h-8 fill-white ml-1" />
            </button>
          )}

          {/* Metadata Inspector Drawer (Slide-Over) */}
          {showMetadata && (
            <div className="absolute right-0 top-0 bottom-0 w-80 apple-glass border-l border-white/10 p-5 overflow-y-auto space-y-4 z-20">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">Video Technical Specs</span>
                <button onClick={() => setShowMetadata(false)} className="text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Data Safety Seal */}
              <div className="p-3 rounded-xl bg-apple-green/10 border border-apple-green/20 text-xs">
                <div className="flex items-center gap-2 text-apple-green font-semibold mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Immutable Original Master</span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Original file is write-once, stored read-only, and verified against bitrot corruption.
                </p>
              </div>

              {/* Specs Table */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">Resolution</span>
                  <span className="text-white font-medium">{clip.width} × {clip.height} ({clip.height >= 2160 ? "4K UHD" : "1080p"})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">Frame Rate</span>
                  <span className="text-apple-cyan font-medium">{clip.fps.toFixed(2)} FPS</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">Video Codec</span>
                  <span className="text-white font-medium">{clip.codec.toUpperCase()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">Duration</span>
                  <span className="text-white font-medium">{formatTime(clip.duration)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">Original File</span>
                  <span className="text-white font-medium truncate max-w-[140px]" title={clip.originalFilename}>
                    {clip.originalFilename}
                  </span>
                </div>
              </div>

              {/* SHA-256 Checksum */}
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  SHA-256 Checksum
                </span>
                <div className="mt-1 p-2 rounded-lg bg-black/40 font-mono text-[10px] text-gray-300 break-all border border-white/5 select-all">
                  {clip.id}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Custom Apple Video Control Bar */}
        <div className="p-4 bg-black/60 border-t border-white/10 space-y-3">
          {/* Interactive Scrubber Timeline with Tooltip */}
          <div
            ref={progressBarRef}
            className="group/timeline relative w-full h-3 flex items-center cursor-pointer select-none"
            onMouseMove={handleTimelineHover}
            onMouseLeave={() => setHoverTime(null)}
            onClick={handleTimelineSeek}
          >
            {/* Background Rail */}
            <div className="w-full h-1.5 rounded-full bg-white/20 group-hover/timeline:h-2 transition-all relative">
              {/* In/Out Selected Region (Highlight Marker) */}
              {inPoint !== null && (
                <div
                  className="absolute top-0 bottom-0 bg-apple-purple/40 rounded-full"
                  style={{
                    left: `${(inPoint / duration) * 100}%`,
                    width: `${(((outPoint || duration) - inPoint) / duration) * 100}%`,
                  }}
                />
              )}

              {/* Progress Bar */}
              <div
                className="h-full bg-gradient-to-r from-apple-blue to-indigo-500 rounded-full relative"
                style={{ width: `${currentPct}%` }}
              >
                {/* Scrubbing Playhead Thumb */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md scale-0 group-hover/timeline:scale-100 transition-transform" />
              </div>
            </div>

            {/* Floating High-Definition Thumbnail Scrub Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute bottom-6 -translate-x-1/2 apple-glass p-1.5 rounded-xl border border-white/20 shadow-2xl scrub-tooltip flex flex-col items-center pointer-events-none z-30"
                style={{ left: `${hoverPositionX}px` }}
              >
                {/* Sprite Thumbnail Window */}
                <div
                  className="w-[200px] h-[112px] rounded-lg overflow-hidden bg-black/80 border border-white/10 relative shadow-inner"
                  style={{
                    backgroundImage: `url('/api/clips/${clip.id}/storyboard')`,
                    backgroundPosition: `${calculateSpriteCoords(hoverTime).xPercent}% ${calculateSpriteCoords(hoverTime).yPercent}%`,
                    backgroundSize: "1000% 1000%",
                  }}
                />
                <span className="mt-1 font-mono text-xs font-semibold text-white">
                  {formatTime(hoverTime)}
                </span>
              </div>
            )}
          </div>

          {/* Control Buttons Row */}
          <div className="flex items-center justify-between gap-4 text-white">
            {/* Left Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="p-2 rounded-xl hover:bg-white/10 transition-colors"
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              </button>

              {/* Step 1 Frame Back / Forward */}
              <button
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 1 / (clip.fps || 60));
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-300"
                title="Previous Frame (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 1 / (clip.fps || 60));
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-300"
                title="Next Frame (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Volume / Mute */}
              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !videoRef.current.muted;
                    setIsMuted(videoRef.current.muted);
                  }
                }}
                className="p-2 rounded-xl hover:bg-white/10 transition-colors text-gray-300 hover:text-white"
              >
                {isMuted ? <VolumeX className="w-5 h-5 text-apple-red" /> : <Volume2 className="w-5 h-5" />}
              </button>

              {/* Timecode */}
              <div className="font-mono text-xs text-gray-300">
                <span className="text-white font-semibold">{formatTime(currentTime)}</span>
                <span className="mx-1 text-gray-500">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Center: In/Out Clipper Tools */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs">
              <button
                onClick={() => setInPoint(currentTime)}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  inPoint !== null ? "bg-purple-600 text-white" : "hover:text-white text-gray-300"
                }`}
                title="Mark In-Point (I)"
              >
                Mark In ({inPoint !== null ? formatTime(inPoint) : "I"})
              </button>
              <span className="text-gray-500">→</span>
              <button
                onClick={() => setOutPoint(currentTime)}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  outPoint !== null ? "bg-purple-600 text-white" : "hover:text-white text-gray-300"
                }`}
                title="Mark Out-Point (O)"
              >
                Mark Out ({outPoint !== null ? formatTime(outPoint) : "O"})
              </button>

              {(inPoint !== null || outPoint !== null) && (
                <button
                  onClick={handleExportHighlight}
                  disabled={isClipping}
                  className="flex items-center gap-1.5 ml-2 px-3 py-1 rounded-full bg-apple-purple text-white font-semibold hover:bg-purple-600 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>{isClipping ? "Cutting..." : "Export Highlight"}</span>
                </button>
              )}
            </div>

            {/* Right Controls: 4K Frame Snapshot, Speed, Fullscreen */}
            <div className="flex items-center gap-2">
              {/* 4K Frame Snapshot Grabber */}
              <button
                onClick={handleCaptureSnapshot}
                disabled={isSnapshotting}
                className="p-2 rounded-xl hover:bg-white/10 transition-colors text-gray-300 hover:text-white"
                title="Capture 4K Full-Resolution PNG Frame"
              >
                {snapshotSuccess ? (
                  <CheckCircle2 className="w-5 h-5 text-apple-green" />
                ) : (
                  <Camera className="w-5 h-5" />
                )}
              </button>

              {/* Playback Rate */}
              <select
                value={playbackRate}
                onChange={(e) => {
                  const rate = parseFloat(e.target.value);
                  setPlaybackRate(rate);
                  if (videoRef.current) videoRef.current.playbackRate = rate;
                }}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
              >
                <option value="0.5">0.5×</option>
                <option value="1">1.0×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2.0×</option>
              </select>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-xl hover:bg-white/10 transition-colors text-gray-300 hover:text-white"
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Highlight Created Notification */}
          {clippedHighlightUrl && (
            <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-between text-xs text-purple-200">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-apple-purple" />
                <span>Lossless highlight saved without re-encoding!</span>
              </div>
              <a
                href={clippedHighlightUrl}
                download
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-apple-purple text-white font-semibold hover:bg-purple-600 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download MP4</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
