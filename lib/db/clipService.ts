import prisma from "./prisma";
import fs from "fs";

export interface ClipFilterOptions {
  gameSlug?: string;
  folder?: string;
  tagName?: string;
  search?: string;
  isFavorite?: boolean;
  isTrash?: boolean;
  duration?: "all" | "short" | "medium" | "long"; // <60s, 1-5m, >5m
  resolution?: "all" | "1080p" | "1440p" | "4k";
  fps?: "all" | "60" | "120";
  sortBy?:
    | "newest"
    | "oldest"
    | "duration_desc"
    | "duration_asc"
    | "title_asc"
    | "title_desc"
    | "size_desc"
    | "size_asc"
    | "fps_desc";
}

export async function getClips(options: ClipFilterOptions = {}) {
  const {
    gameSlug,
    folder,
    tagName,
    search,
    isFavorite,
    isTrash = false,
    duration,
    resolution,
    fps,
    sortBy = "newest",
  } = options;

  const where: any = {
    isTrash,
  };

  if (gameSlug) {
    if (gameSlug === "uncategorized") {
      where.gameId = null;
    } else {
      where.game = { slug: gameSlug };
    }
  }

  if (folder) {
    if (folder === "none" || folder === "root") {
      where.folder = null;
    } else if (folder !== "all") {
      where.folder = folder;
    }
  }

  if (tagName) {
    where.tags = {
      some: {
        tag: { name: tagName.toLowerCase() },
      },
    };
  }

  if (search && search.trim() !== "") {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { originalFilename: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  if (typeof isFavorite === "boolean") {
    where.isFavorite = isFavorite;
  }

  if (duration && duration !== "all") {
    if (duration === "short") where.duration = { lte: 60 };
    else if (duration === "medium") where.duration = { gt: 60, lte: 300 };
    else if (duration === "long") where.duration = { gt: 300 };
  }

  if (resolution && resolution !== "all") {
    if (resolution === "4k") where.height = { gte: 2160 };
    else if (resolution === "1440p") where.height = { gte: 1440, lt: 2160 };
    else if (resolution === "1080p") where.height = { gte: 1080, lt: 1440 };
  }

  if (fps && fps !== "all") {
    if (fps === "120") where.fps = { gte: 100 };
    else if (fps === "60") where.fps = { gte: 50, lt: 100 };
  }

  let orderBy: any = [
    { recordedAt: "desc" },
    { createdAt: "desc" },
  ];
  if (sortBy === "oldest") {
    orderBy = [
      { recordedAt: "asc" },
      { createdAt: "asc" },
    ];
  }
  else if (sortBy === "duration_desc") orderBy = { duration: "desc" };
  else if (sortBy === "duration_asc") orderBy = { duration: "asc" };
  else if (sortBy === "title_asc") orderBy = { title: "asc" };
  else if (sortBy === "title_desc") orderBy = { title: "desc" };
  else if (sortBy === "size_desc") orderBy = { fileSize: "desc" };
  else if (sortBy === "size_asc") orderBy = { fileSize: "asc" };
  else if (sortBy === "fps_desc") orderBy = { fps: "desc" };

  const clips = await prisma.clip.findMany({
    where,
    orderBy,
    include: {
      game: true,
      tags: {
        include: { tag: true },
      },
      highlights: {
        orderBy: { startTime: "asc" },
      },
    },
  });

  return clips.map((c) => ({
    ...c,
    fileSize: c.fileSize.toString(), // Convert BigInt to string for JSON serialization
  }));
}

export async function getClipById(id: string) {
  const clip = await prisma.clip.findUnique({
    where: { id },
    include: {
      game: true,
      tags: {
        include: { tag: true },
      },
      highlights: {
        orderBy: { startTime: "asc" },
      },
    },
  });

  if (!clip) return null;

  return {
    ...clip,
    fileSize: clip.fileSize.toString(),
  };
}

export async function getVaultStats() {
  const totalClips = await prisma.clip.count({ where: { isTrash: false } });
  const totalTrash = await prisma.clip.count({ where: { isTrash: true } });
  const favoriteClips = await prisma.clip.count({ where: { isFavorite: true, isTrash: false } });

  const activeClips = await prisma.clip.findMany({
    where: { isTrash: false },
    select: { fileSize: true, duration: true, gameId: true },
  });

  let totalBytes = BigInt(0);
  let totalDurationSec = 0;

  for (const c of activeClips) {
    totalBytes += c.fileSize;
    totalDurationSec += c.duration;
  }

  const games = await prisma.game.findMany({
    include: {
      _count: {
        select: { clips: { where: { isTrash: false } } },
      },
    },
  });

  return {
    totalClips,
    totalTrash,
    favoriteClips,
    totalBytes: totalBytes.toString(),
    totalDurationSec,
    games: games.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      accentColor: g.accentColor,
      icon: g.icon,
      clipCount: g._count.clips,
    })),
  };
}
