/**
 * StoryLiner has three approved band identities. Fault Lines is deliberately
 * canon-pending, so it receives a known identity without borrowing either
 * established band's copy. Unknown names remain on the neutral fallback.
 */
export type StoryLinerVoice =
  | "stalemate"
  | "rad-dad"
  | "fault-lines"
  | "unknown";

export function resolveStoryLinerVoice(bandName: string): StoryLinerVoice {
  const name = (bandName ?? "").toLowerCase();
  if (name.includes("rad dad")) return "rad-dad";
  if (name.includes("stalemate")) return "stalemate";
  if (/\bfault\s*lines?\b/.test(name)) return "fault-lines";
  return "unknown";
}

export function hashtagCapForVoice(
  voice: StoryLinerVoice,
  platform: string
): number {
  if (voice === "stalemate" && platform === "INSTAGRAM") return 2;
  if (voice === "fault-lines" && platform === "INSTAGRAM") return 3;
  if (platform === "INSTAGRAM") return 8;
  return 4;
}
