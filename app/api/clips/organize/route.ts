import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      gameId,
      folderName,
      clipIds,
      dateFrom,
      dateTo,
      tags,
      query,
      previewOnly = false,
    } = body;

    const where: any = { isTrash: false };

    if (gameId) {
      where.gameId = gameId;
    }

    if (Array.isArray(clipIds) && clipIds.length > 0) {
      where.id = { in: clipIds };
    } else {
      const andConditions: any[] = [];

      if (query && query.trim()) {
        andConditions.push({
          OR: [
            { title: { contains: query.trim(), mode: "insensitive" } },
            { originalFilename: { contains: query.trim(), mode: "insensitive" } },
            { description: { contains: query.trim(), mode: "insensitive" } },
          ],
        });
      }

      if (dateFrom || dateTo) {
        const fromDate = dateFrom ? new Date(dateFrom) : undefined;
        const toDate = dateTo ? new Date(dateTo) : undefined;
        if (toDate) {
          toDate.setHours(23, 59, 59, 999);
        }

        const dateRange: any = {};
        if (fromDate) dateRange.gte = fromDate;
        if (toDate) dateRange.lte = toDate;

        andConditions.push({
          OR: [
            { recordedAt: dateRange },
            { AND: [{ recordedAt: null }, { createdAt: dateRange }] },
          ],
        });
      }

      if (Array.isArray(tags) && tags.length > 0) {
        const cleanTags = tags.map((t: string) => t.trim().toLowerCase().replace(/^#+/, "")).filter(Boolean);
        if (cleanTags.length > 0) {
          andConditions.push({
            tags: {
              some: {
                tag: {
                  name: { in: cleanTags },
                },
              },
            },
          });
        }
      }

      if (andConditions.length > 0) {
        where.AND = andConditions;
      }
    }

    // If preview requested, return matching clips without modifying
    if (previewOnly) {
      const matchingClips = await prisma.clip.findMany({
        where,
        take: 50,
        select: {
          id: true,
          title: true,
          originalFilename: true,
          duration: true,
          fileSize: true,
          folder: true,
          recordedAt: true,
          createdAt: true,
          game: {
            select: {
              name: true,
            },
          },
        },
      });

      const totalCount = await prisma.clip.count({ where });

      return NextResponse.json({
        success: true,
        preview: true,
        count: totalCount,
        clips: matchingClips.map((c) => ({
          ...c,
          fileSize: c.fileSize.toString(),
        })),
      });
    }

    // Execute bulk update
    const targetFolder = folderName && folderName.trim() && folderName.trim() !== "none"
      ? folderName.trim()
      : null;

    const result = await prisma.clip.updateMany({
      where,
      data: {
        folder: targetFolder,
      },
    });

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      folder: targetFolder,
      message: targetFolder
        ? `Successfully organized ${result.count} clips into folder "${targetFolder}".`
        : `Successfully removed ${result.count} clips from folder.`,
    });
  } catch (err: any) {
    console.error("Error organizing clips:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
