/** Directives that affect the hashtag array, not just the caption text. */
export const HASHTAG_DIRECTIVES = new Set(["noHashtags", "shorterHashtags"]);

/**
 * Derive updated hashtags based on the directive applied.
 * Keeps existing hashtags unless the directive explicitly changes them.
 */
export function deriveHashtags(
  existingHashtags: string[],
  _newCaption: string,
  directive: string
): string[] {
  if (directive === "noHashtags") {
    return [];
  }
  if (directive === "shorterHashtags") {
    return existingHashtags.filter((h) => h.length <= 14);
  }
  return existingHashtags;
}
