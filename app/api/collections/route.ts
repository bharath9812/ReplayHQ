import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export interface CollectionData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  isSmart?: boolean;
  smartType?: "boss" | "highlights" | "long_sessions";
  clipIds?: string[];
  clipCount?: number;
  totalBytes?: number;
  createdAt?: string;
}

const DEFAULT_SMART_COLLECTIONS: CollectionData[] = [
  {
    id: "smart-bosses",
    name: "Boss Battles & Clutch Wins",
    slug: "collection-bosses",
    description: "All boss fights, 1vX clutch rounds, and intense combat encounters across all games",
    icon: "sports_martial_arts",
    color: "#FF9500",
    isSmart: true,
    smartType: "boss",
    clipIds: [],
  },
  {
    id: "smart-highlights",
    name: "2026 Highlight Reels",
    slug: "collection-2026-highlights",
    description: "Lossless video excerpts, montage clips, and bookmarked key gameplay highlights",
    icon: "auto_awesome",
    color: "#AF52DE",
    isSmart: true,
    smartType: "highlights",
    clipIds: [],
  },
  {
    id: "smart-long-sessions",
    name: "Long Exploration Sessions",
    slug: "collection-long-sessions",
    description: "Extended uncut sessions, campaign walk-throughs, and long free-roam footage (5m+)",
    icon: "schedule",
    color: "#30D158",
    isSmart: true,
    smartType: "long_sessions",
    clipIds: [],
  },
];

async function getStoredCustomCollections(): Promise<CollectionData[]> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "vault_collections" },
    });
    if (!setting || !setting.value) return [];
    return JSON.parse(setting.value);
  } catch {
    return [];
  }
}

async function saveStoredCustomCollections(collections: CollectionData[]): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "vault_collections" },
    update: { value: JSON.stringify(collections) },
    create: { key: "vault_collections", value: JSON.stringify(collections) },
  });
}

export async function GET() {
  try {
    const customCollections = await getStoredCustomCollections();

    // Query active clips to calculate accurate stats
    const clips = await prisma.clip.findMany({
      where: { isTrash: false },
      select: {
        id: true,
        title: true,
        duration: true,
        fileSize: true,
        highlights: { select: { id: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    });

    // Merge default smart collections with custom user collections
    const allCollections: CollectionData[] = [...DEFAULT_SMART_COLLECTIONS, ...customCollections];

    const enriched = allCollections.map((col) => {
      let matchedClips = clips;

      if (col.isSmart) {
        if (col.smartType === "boss") {
          matchedClips = clips.filter((c) => {
            const t = c.title.toLowerCase();
            return (
              t.includes("boss") ||
              t.includes("clutch") ||
              t.includes("fight") ||
              t.includes("battle") ||
              c.tags.some((tg) => tg.tag.name.toLowerCase().includes("boss"))
            );
          });
        } else if (col.smartType === "highlights") {
          matchedClips = clips.filter((c) => {
            const t = c.title.toLowerCase();
            return (
              t.includes("highlight") ||
              c.highlights.length > 0 ||
              c.tags.some((tg) => tg.tag.name.toLowerCase().includes("highlight"))
            );
          });
        } else if (col.smartType === "long_sessions") {
          matchedClips = clips.filter((c) => c.duration >= 300);
        }
      } else {
        const idSet = new Set(col.clipIds || []);
        matchedClips = clips.filter((c) => idSet.has(c.id));
      }

      const totalBytes = matchedClips.reduce((acc, c) => acc + Number(c.fileSize || 0), 0);

      return {
        ...col,
        clipCount: matchedClips.length,
        totalBytes,
      };
    });

    return NextResponse.json({ success: true, collections: enriched });
  } catch (err: any) {
    console.error("GET /api/collections error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ success: false, error: "Collection name is required" }, { status: 400 });
    }

    const slug = "collection-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const customCollections = await getStoredCustomCollections();

    if (
      DEFAULT_SMART_COLLECTIONS.some((c) => c.slug === slug) ||
      customCollections.some((c) => c.slug === slug || c.name.toLowerCase() === name.toLowerCase())
    ) {
      return NextResponse.json({ success: false, error: "A collection with this name already exists" }, { status: 400 });
    }

    const newCollection: CollectionData = {
      id: "col-" + Date.now(),
      name,
      slug,
      description: body.description?.trim() || "",
      icon: body.icon || "collections_bookmark",
      color: body.color || "#0A84FF",
      isSmart: false,
      clipIds: Array.isArray(body.clipIds) ? body.clipIds : [],
      createdAt: new Date().toISOString(),
    };

    customCollections.push(newCollection);
    await saveStoredCustomCollections(customCollections);

    return NextResponse.json({ success: true, collection: newCollection });
  } catch (err: any) {
    console.error("POST /api/collections error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { collectionId, action, clipId, clipIds, name, description, color, icon } = body;

    if (!collectionId) {
      return NextResponse.json({ success: false, error: "collectionId is required" }, { status: 400 });
    }

    const customCollections = await getStoredCustomCollections();
    const targetIdx = customCollections.findIndex((c) => c.id === collectionId || c.slug === collectionId);

    if (targetIdx === -1) {
      return NextResponse.json({ success: false, error: "Custom collection not found" }, { status: 404 });
    }

    const target = customCollections[targetIdx];

    if (action === "addClip" && clipId) {
      const set = new Set(target.clipIds || []);
      set.add(clipId);
      target.clipIds = Array.from(set);
    } else if (action === "removeClip" && clipId) {
      target.clipIds = (target.clipIds || []).filter((id) => id !== clipId);
    } else if (action === "addClips" && Array.isArray(clipIds)) {
      const set = new Set(target.clipIds || []);
      clipIds.forEach((id: string) => set.add(id));
      target.clipIds = Array.from(set);
    } else if (action === "removeClips" && Array.isArray(clipIds)) {
      const removeSet = new Set(clipIds);
      target.clipIds = (target.clipIds || []).filter((id) => !removeSet.has(id));
    } else if (action === "setClips" && Array.isArray(clipIds)) {
      target.clipIds = Array.from(new Set(clipIds));
    } else if (action === "updateDetails") {
      if (name) target.name = name.trim();
      if (description !== undefined) target.description = description.trim();
      if (color) target.color = color;
      if (icon) target.icon = icon;
    }

    customCollections[targetIdx] = target;
    await saveStoredCustomCollections(customCollections);

    return NextResponse.json({ success: true, collection: target });
  } catch (err: any) {
    console.error("PATCH /api/collections error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Collection ID is required" }, { status: 400 });
    }

    if (DEFAULT_SMART_COLLECTIONS.some((c) => c.id === id || c.slug === id)) {
      return NextResponse.json({ success: false, error: "Built-in smart collections cannot be deleted" }, { status: 400 });
    }

    let customCollections = await getStoredCustomCollections();
    customCollections = customCollections.filter((c) => c.id !== id && c.slug !== id);
    await saveStoredCustomCollections(customCollections);

    return NextResponse.json({ success: true, message: "Collection deleted" });
  } catch (err: any) {
    console.error("DELETE /api/collections error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
