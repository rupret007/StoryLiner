import {
  hashtagCapForVoice as establishedHashtagCapForVoice,
  resolveStoryLinerVoice as resolveEstablishedVoice,
} from "./voice";

/**
 * Compose the approved identities without expanding the established voices.
 * Fault Lines remains canon-pending and uses its own context-led guidance.
 */
export type StoryLinerVoice =
  | "stalemate"
  | "rad-dad"
  | "fault-lines"
  | "unknown";

export function resolveStoryLinerVoice(bandName: string): StoryLinerVoice {
  const establishedVoice = resolveEstablishedVoice(bandName);
  if (establishedVoice !== "unknown") return establishedVoice;
  if (/\bfault\s*lines\b/i.test(bandName ?? "")) return "fault-lines";
  return "unknown";
}

export function hashtagCapForVoice(
  voice: StoryLinerVoice,
  platform: string
): number {
  if (voice === "fault-lines") return platform === "INSTAGRAM" ? 3 : 4;
  return establishedHashtagCapForVoice(voice, platform);
}
