"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DeepVideoPlayerModal } from "@/components/DeepVideoPlayerModal";
import { ClipData } from "@/components/ClipCard";

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clipId = params?.id as string;

  const [clip, setClip] = useState<ClipData | null>(null);
  const [allClips, setAllClips] = useState<ClipData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clipId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/clips/${clipId}`).then((res) => res.json()),
      fetch(`/api/clips`).then((res) => res.json()),
    ])
      .then(([clipRes, allClipsRes]) => {
        if (!isMounted) return;
        if (clipRes.success && clipRes.clip) {
          setClip(clipRes.clip);
        } else {
          setError(clipRes.error || "Footage not found in GameVault archive.");
        }

        if (allClipsRes.success && allClipsRes.clips) {
          setAllClips(allClipsRes.clips);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Failed to connect to GameVault server.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [clipId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#07080a] text-zinc-300 select-none">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center animate-pulse">
            <span className="material-symbols-outlined text-primary text-2xl animate-spin">
              progress_activity
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="font-semibold text-sm tracking-tight text-white">
              Loading Video...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !clip) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#07080a] text-zinc-300 p-6 select-none">
        <div className="max-w-md w-full bg-[#0d0e12] border border-outline-variant/40 rounded-2xl p-6 flex flex-col items-center text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-2xl">error</span>
          </div>
          <h2 className="text-base font-semibold text-white mb-1">Video Unavailable</h2>
          <p className="text-xs text-zinc-400 mb-6">{error || "This video could not be loaded."}</p>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Return to Library</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <DeepVideoPlayerModal
      clip={clip}
      allClips={allClips}
      onClose={() => router.push("/")}
      onSelectOtherClip={(other) => router.push(`/video/${other.id}`)}
      onUpdateClip={(updated) => setClip(updated)}
      isStandalonePage={true}
    />
  );
}
