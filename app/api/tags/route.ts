import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { clips: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        count: t._count.clips,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = body.name?.trim().toLowerCase().replace("#", "");
    const color = body.color || "#8E8E93";

    if (!name) {
      return NextResponse.json({ success: false, error: "Tag name is required" }, { status: 400 });
    }

    const tag = await prisma.tag.upsert({
      where: { name },
      update: { color },
      create: { name, color },
    });

    return NextResponse.json({ success: true, tag });
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
      const tagsWithCounts = await prisma.tag.findMany({
        include: {
          _count: {
            select: { clips: true },
          },
        },
      });

      const unusedTagIds = tagsWithCounts
        .filter((t) => t._count.clips === 0)
        .map((t) => t.id);

      if (unusedTagIds.length > 0) {
        await prisma.tag.deleteMany({
          where: { id: { in: unusedTagIds } },
        });
      }

      return NextResponse.json({
        success: true,
        deletedCount: unusedTagIds.length,
        message: `Deleted ${unusedTagIds.length} unused tag(s)`,
      });
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Tag ID or ?unused=true is required" },
        { status: 400 }
      );
    }

    await prisma.tag.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Tag deleted successfully",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

