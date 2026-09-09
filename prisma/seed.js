const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding default game profiles & showcase clips for GameVault...");

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

  const gameRecords = {};

  for (const game of games) {
    const record = await prisma.game.upsert({
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
    gameRecords[game.slug] = record.id;
  }

  // Seed default tags
  const tags = ["highlight", "nightdrive", "4k", "bossfight", "clutch", "aircombo", "chickendinner", "tactical", "sanhok", "epicfight", "nodamage"];
  const tagRecords = {};
  for (const t of tags) {
    const rec = await prisma.tag.upsert({
      where: { name: t },
      update: {},
      create: { name: t },
    });
    tagRecords[t] = rec.id;
  }

  // Check if clips already exist
  const existingClipCount = await prisma.clip.count();
  if (existingClipCount === 0) {
    console.log("Seeding showcase footage clips matching stitch design...");

    const showcaseClips = [
      {
        id: "clip-gtav-vinewood",
        title: "Vinewood Hills Night Pursuit.mp4",
        originalFilename: "2026-04-12_Vinewood_Night_Pursuit.mp4",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        fileSize: BigInt(6820000000), // ~6.82 GB
        duration: 872, // 14:32
        width: 3840,
        height: 2160,
        fps: 60.0,
        codec: "hevc",
        audioCodec: "aac",
        bitrate: 68400000,
        isFavorite: true,
        gameId: gameRecords["gtav"],
        tags: ["highlight", "nightdrive", "4k"],
      },
      {
        id: "clip-wuwa-inferno",
        title: "Inferno Rider Boss Encounter.mov",
        originalFilename: "Wuthering_Waves_Inferno_Rider.mov",
        sha256: "f4a1c55398fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b999",
        fileSize: BigInt(8140000000), // ~8.14 GB
        duration: 525, // 08:45
        width: 2560,
        height: 1440,
        fps: 120.0,
        codec: "prores",
        audioCodec: "aac",
        bitrate: 124000000,
        isFavorite: false,
        gameId: gameRecords["wuthering-waves"],
        tags: ["bossfight", "clutch", "aircombo"],
      },
      {
        id: "clip-bgmi-sanhok",
        title: "Sanhok Military Base Final Circle.mp4",
        originalFilename: "BGMI_Sanhok_Military_Circle.mp4",
        sha256: "a1b2c3d498fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852c111",
        fileSize: BigInt(4310000000), // ~4.31 GB
        duration: 1459, // 24:19
        width: 1920,
        height: 1080,
        fps: 90.0,
        codec: "h264",
        audioCodec: "aac",
        bitrate: 28000000,
        isFavorite: false,
        gameId: gameRecords["bgmi"],
        tags: ["chickendinner", "tactical", "sanhok"],
      },
      {
        id: "clip-gothic-duel",
        title: "Gothic Knight Greatsword Duel.mp4",
        originalFilename: "Cathedral_Siege_Knight_Duel.mp4",
        sha256: "d7e8f9a098fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852d222",
        fileSize: BigInt(2950000000), // ~2.95 GB
        duration: 312, // 05:12
        width: 3840,
        height: 2160,
        fps: 60.0,
        codec: "av1",
        audioCodec: "aac",
        bitrate: 80000000,
        isFavorite: true,
        gameId: gameRecords["gtav"],
        tags: ["epicfight", "nodamage", "4k"],
      },
    ];

    for (const item of showcaseClips) {
      const { tags: clipTags, ...clipData } = item;
      const created = await prisma.clip.create({
        data: clipData,
      });

      for (const t of clipTags) {
        if (tagRecords[t]) {
          await prisma.clipTag.create({
            data: {
              clipId: created.id,
              tagId: tagRecords[t],
            },
          });
        }
      }
    }
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
