import prisma from "@/lib/db/prisma";

export interface MatchedClassification {
  gameId: string | null;
  gameSlug: string | null;
  gameFolder: string;
  autoTags: string[];
}

/**
 * Classifies a video filename against active game match rules and extracts hashtags
 */
export async function classifyClip(filename: string): Promise<MatchedClassification> {
  const games = await prisma.game.findMany();
  const lowerFilename = filename.toLowerCase();

  let matchedGameId: string | null = null;
  let matchedGameSlug: string | null = null;
  let matchedFolder = "uncategorized";

  for (const game of games) {
    const rules = Array.isArray(game.matchRules) ? (game.matchRules as string[]) : [];

    for (const rule of rules) {
      if (typeof rule === "string" && rule.trim().length > 0) {
        const cleanRule = rule.toLowerCase().trim();
        // Check substring or regex
        if (lowerFilename.includes(cleanRule)) {
          matchedGameId = game.id;
          matchedGameSlug = game.slug;
          matchedFolder = game.folderName || game.slug;
          break;
        }

        try {
          const regex = new RegExp(rule, "i");
          if (regex.test(filename)) {
            matchedGameId = game.id;
            matchedGameSlug = game.slug;
            matchedFolder = game.folderName || game.slug;
            break;
          }
        } catch {
          // Ignore invalid regex patterns
        }
      }
    }

    if (matchedGameId) break;
  }

  // Extract hashtags or keyword tags (e.g. #clutch, #1v4, clutch, snipe, win)
  const autoTags: string[] = [];
  const hashMatches = filename.match(/#([a-zA-Z0-9_-]+)/g);
  if (hashMatches) {
    for (const match of hashMatches) {
      autoTags.push(match.replace("#", "").toLowerCase());
    }
  }

  const commonKeywords = ["clutch", "1v4", "sniper", "snipe", "bossfight", "montage", "win", "fail", "highlight"];
  for (const kw of commonKeywords) {
    if (lowerFilename.includes(kw) && !autoTags.includes(kw)) {
      autoTags.push(kw);
    }
  }

  return {
    gameId: matchedGameId,
    gameSlug: matchedGameSlug,
    gameFolder: matchedFolder,
    autoTags,
  };
}
