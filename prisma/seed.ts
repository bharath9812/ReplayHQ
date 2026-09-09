import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding default game profiles for GameVault...");

  const games = [
    {
      name: "Grand Theft Auto V",
      slug: "gtav",
      folderName: "gtav",
      matchRules: ["gta", "grand theft auto", "gtav", "fivem", "los santos"],
      accentColor: "#10B981", // Emerald Green
      icon: "Car",
    },
    {
      name: "Wuthering Waves",
      slug: "wuthering-waves",
      folderName: "wuwa",
      matchRules: ["wuwa", "wuthering", "wuthering waves", "kuro", "rover"],
      accentColor: "#06B6D4", // Electric Cyan
      icon: "Sword",
    },
    {
      name: "Battlegrounds Mobile India",
      slug: "bgmi",
      folderName: "bgmi",
      matchRules: ["bgmi", "pubg", "battlegrounds", "krafton", "erangel", "livik"],
      accentColor: "#F97316", // Solar Orange
      icon: "Crosshair",
    },
  ];

  for (const game of games) {
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: {
        matchRules: game.matchRules,
        accentColor: game.accentColor,
        icon: game.icon,
      },
      create: {
        name: game.name,
        slug: game.slug,
        folderName: game.folderName,
        matchRules: game.matchRules,
        accentColor: game.accentColor,
        icon: game.icon,
      },
    });
  }

  // Seed standard tags
  const tags = ["clutch", "1v4", "sniper", "highlight", "bossfight", "montage", "win", "fail"];
  for (const t of tags) {
    await prisma.tag.upsert({
      where: { name: t },
      update: {},
      create: { name: t },
    });
  }

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
