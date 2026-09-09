import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const games = await prisma.game.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { clips: { where: { isTrash: false } } },
        },
        clips: {
          where: { isTrash: false },
          select: { fileSize: true, folder: true },
        },
      },
    });

    const gamesWithStats = games.map((g) => {
      let totalBytes = BigInt(0);
      const folderMap = new Map<string, { name: string; clipCount: number; totalBytes: number }>();

      for (const c of g.clips) {
        totalBytes += c.fileSize;
        if (c.folder && c.folder.trim()) {
          const fName = c.folder.trim();
          const existing = folderMap.get(fName) || { name: fName, clipCount: 0, totalBytes: 0 };
          existing.clipCount += 1;
          existing.totalBytes += Number(c.fileSize);
          folderMap.set(fName, existing);
        }
      }

      const folders = Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name));

      return {
        id: g.id,
        name: g.name,
        slug: g.slug,
        folderName: g.folderName,
        matchRules: g.matchRules,
        accentColor: g.accentColor,
        icon: g.icon,
        clipCount: g._count.clips,
        totalBytes: Number(totalBytes),
        folders,
      };
    });

    return NextResponse.json({ success: true, games: gamesWithStats });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, folderName, matchRules, accentColor, icon } = body;

    if (!name || !folderName) {
      return NextResponse.json(
        { success: false, error: "Name and Folder Name are required" },
        { status: 400 }
      );
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const rules = Array.isArray(matchRules)
      ? matchRules
      : typeof matchRules === "string"
      ? matchRules.split(",").map((s) => s.trim()).filter(Boolean)
      : [name];

    const game = await prisma.game.create({
      data: {
        name,
        slug,
        folderName: folderName.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
        matchRules: rules,
        accentColor: accentColor || "#007AFF",
        icon: icon || "Gamepad2",
      },
    });

    return NextResponse.json({ success: true, game });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, folderName, matchRules, accentColor, icon } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Game ID is required" }, { status: 400 });
    }

    const rules = Array.isArray(matchRules)
      ? matchRules
      : typeof matchRules === "string"
      ? matchRules.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const updated = await prisma.game.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(folderName ? { folderName } : {}),
        ...(rules !== undefined ? { matchRules: rules } : {}),
        ...(accentColor ? { accentColor } : {}),
        ...(icon ? { icon } : {}),
      },
    });

    return NextResponse.json({ success: true, game: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const unusedOnly = searchParams.get("unused") === "true";

    if (unusedOnly) {
      // Find all categories with 0 active clips
      const games = await prisma.game.findMany({
        include: {
          _count: {
            select: { clips: { where: { isTrash: false } } },
          },
        },
      });

      const unusedIds = games.filter((g) => g._count.clips === 0).map((g) => g.id);

      if (unusedIds.length === 0) {
        return NextResponse.json({ success: true, message: "No unused categories found", count: 0 });
      }

      await prisma.game.deleteMany({
        where: { id: { in: unusedIds } },
      });

      return NextResponse.json({
        success: true,
        message: `Deleted ${unusedIds.length} unused categories`,
        count: unusedIds.length,
      });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "Category ID is required" }, { status: 400 });
    }

    // Safety check: verify this game category has 0 active clips
    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        _count: {
          select: { clips: { where: { isTrash: false } } },
        },
      },
    });

    if (!game) {
      return NextResponse.json({ success: false, error: "Game category not found" }, { status: 404 });
    }

    if (game._count.clips > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete category "${game.name}" because it contains ${game._count.clips} active clips. Only unused categories can be deleted.`,
        },
        { status: 400 }
      );
    }

    await prisma.game.delete({ where: { id } });

    return NextResponse.json({ success: true, message: `Category "${game.name}" deleted successfully` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
