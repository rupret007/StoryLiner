/**
 * StoryLiner has two voices: Stalemate and Rad Dad.
 * Unknown names must not inherit Stalemate copy or invent Trailer Swift.
 */
export type StoryLinerVoice = "stalemate" | "rad-dad" | "unknown";

export function resolveStoryLinerVoice(bandName: string): StoryLinerVoice {
  const name = (bandName ?? "").toLowerCase();
  if (name.includes("rad dad")) return "rad-dad";
  if (name.includes("stalemate")) return "stalemate";
  return "unknown";
}

export function hashtagCapForVoice(
  voice: StoryLinerVoice,
  platform: string
): number {
  if (voice === "stalemate" && platform === "INSTAGRAM") return 2;
  if (platform === "INSTAGRAM") return 8;
  return 4;
}
