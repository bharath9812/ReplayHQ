import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_RULES = [
  {
    id: "rule_01",
    name: "Auto-categorize GTA V",
    conditionField: "filename",
    operator: "contains",
    conditionValue: "GTA",
    actionType: "set_game",
    actionValue: "Grand Theft Auto V",
    active: true,
  },
  {
    id: "rule_02",
    name: "Auto-categorize BGMI / PUBG",
    conditionField: "filename",
    operator: "contains",
    conditionValue: "BGMI",
    actionType: "set_game",
    actionValue: "PUBG Mobile / BGMI",
    active: true,
  },
  {
    id: "rule_03",
    name: "Auto-categorize Wuthering Waves",
    conditionField: "filename",
    operator: "contains",
    conditionValue: "Wuthering",
    actionType: "set_game",
    actionValue: "Wuthering Waves",
    active: true,
  },
  {
    id: "rule_04",
    name: "Tag Long Sessions (>30 mins)",
    conditionField: "duration",
    operator: "gt",
    conditionValue: "1800",
    actionType: "add_tag",
    actionValue: "Long Session",
    active: true,
  },
];

export async function GET() {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "organization_rules" },
    });

    if (!setting) {
      // Initialize with defaults
      await prisma.setting.create({
        data: {
          key: "organization_rules",
          value: JSON.stringify(DEFAULT_RULES),
        },
      });
      return NextResponse.json({ success: true, rules: DEFAULT_RULES });
    }

    const rules = JSON.parse(setting.value);
    return NextResponse.json({ success: true, rules });
  } catch (err: any) {
    console.error("Error reading rules:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Execute Rules Action
    if (body.action === "execute") {
      const setting = await prisma.setting.findUnique({
        where: { key: "organization_rules" },
      });
      const rules = setting ? JSON.parse(setting.value) : DEFAULT_RULES;
      const activeRules = rules.filter((r: any) => r.active);

      if (activeRules.length === 0) {
        return NextResponse.json({
          success: true,
          matchedClips: 0,
          summary: "No active rules to execute.",
        });
      }

      const clips = await prisma.clip.findMany({
        where: { isTrash: false },
        include: { tags: true },
      });

      let matchedCount = 0;
      let modifications = 0;

      for (const clip of clips) {
        let clipModified = false;

        for (const rule of activeRules) {
          let match = false;

          // Check condition
          if (rule.conditionField === "filename") {
            const search = (rule.conditionValue || "").toLowerCase();
            if (
              clip.originalFilename.toLowerCase().includes(search) ||
              clip.title.toLowerCase().includes(search)
            ) {
              match = true;
            }
          } else if (rule.conditionField === "duration") {
            const threshold = parseFloat(rule.conditionValue) || 0;
            if (rule.operator === "gt" && clip.duration >= threshold) match = true;
            if (rule.operator === "lt" && clip.duration <= threshold) match = true;
          } else if (rule.conditionField === "codec") {
            if (clip.codec.toLowerCase() === (rule.conditionValue || "").toLowerCase()) {
              match = true;
            }
          }

          if (match) {
            clipModified = true;

            // Apply Action
            if (rule.actionType === "set_game") {
              const gameName = rule.actionValue.trim();
              const slug = gameName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
              
              // Find or create game
              const game = await prisma.game.upsert({
                where: { slug },
                update: {},
                create: {
                  name: gameName,
                  slug,
                  folderName: slug,
                  matchRules: [rule.conditionValue],
                  accentColor: "#007AFF",
                },
              });

              if (clip.gameId !== game.id) {
                await prisma.clip.update({
                  where: { id: clip.id },
                  data: { gameId: game.id },
                });
                modifications++;
              }
            } else if (rule.actionType === "add_tag") {
              const tagName = rule.actionValue.trim();
              const tag = await prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: {
                  name: tagName,
                  color: "#30D158",
                },
              });

              const existingTag = clip.tags.find((t) => t.tagId === tag.id);
              if (!existingTag) {
                await prisma.clipTag.upsert({
                  where: {
                    clipId_tagId: { clipId: clip.id, tagId: tag.id },
                  },
                  update: {},
                  create: {
                    clipId: clip.id,
                    tagId: tag.id,
                  },
                });
                modifications++;
              }
            }
          }
        }

        if (clipModified) matchedCount++;
      }

      return NextResponse.json({
        success: true,
        matchedClips: matchedCount,
        modifications,
        summary: `Rule execution finished: Evaluated ${clips.length} clips, updated ${matchedCount} clips (${modifications} operations).`,
      });
    }

    // 2. Save / Update Rules
    if (body.rules && Array.isArray(body.rules)) {
      await prisma.setting.upsert({
        where: { key: "organization_rules" },
        update: { value: JSON.stringify(body.rules) },
        create: { key: "organization_rules", value: JSON.stringify(body.rules) },
      });

      return NextResponse.json({
        success: true,
        message: "Rules saved successfully",
        rules: body.rules,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  } catch (err: any) {
    console.error("Error saving/executing rules:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
