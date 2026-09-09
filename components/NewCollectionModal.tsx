"use client";

import React, { useState } from "react";

interface NewCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
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
];

export function NewCollectionModal({ isOpen, onClose, onCreated }: NewCollectionModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [icon, setIcon] = useState(ICON_PRESETS[0].id);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Collection name is required");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          color,
          icon,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setName("");
        setDescription("");
        onCreated();
        onClose();
      } else {
        setErrorMsg(data.error || "Failed to create collection");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-md bg-[#16181D] border border-outline-variant/50 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 text-on-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div
              style={{ backgroundColor: `${color}20`, borderColor: `${color}40` }}
              className="w-8 h-8 rounded-lg flex items-center justify-center border text-primary"
            >
              <span className="material-symbols-outlined text-[18px]" style={{ color }}>
                {icon}
              </span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">New Collection</h2>
              <p className="text-[11px] font-mono text-zinc-400">
                Curate a playlist of videos across any game or category
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
            {errorMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-mono text-zinc-300 block mb-1">Collection Name *</label>
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g. Competitive Tournaments, Sniper Montages"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-300 block mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="What kind of gameplay clips belong in this collection?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-xs focus:outline-none focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* Color Presets */}
          <div>
            <label className="text-xs font-mono text-zinc-300 block mb-1.5">Color Accent</label>
            <div className="flex items-center gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full transition-all cursor-pointer ${
                    color === c ? "ring-2 ring-white scale-110 shadow-sm" : "opacity-75 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Icon Presets */}
          <div>
            <label className="text-xs font-mono text-zinc-300 block mb-1.5">Collection Icon</label>
            <div className="grid grid-cols-4 gap-2">
              {ICON_PRESETS.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setIcon(i.id)}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
                    icon === i.id
                      ? "bg-primary/20 border-primary text-primary font-semibold"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{i.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-zinc-300 text-xs font-mono transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-1.5 rounded-lg bg-primary hover:brightness-110 text-white font-mono text-xs font-semibold transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create Collection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
