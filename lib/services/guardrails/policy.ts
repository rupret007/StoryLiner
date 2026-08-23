/**
 * Hard guardrail policy enforced at the service layer.
 * These run regardless of which LLM adapter is in use.
 */

export interface GuardrailViolation {
  rule: string;
  detail: string;
}

const LINKEDIN_PATTERNS = [
  /excited to announce/i,
  /honored to share/i,
  /thrilled to be/i,
  /game.changer/i,
  /crushing it/i,
  /synergy/i,
  /leverage/i,
  /thought leader/i,
  /paradigm shift/i,
  /circle back/i,
  /move the needle/i,
  /boils down to/i,
  /at the end of the day/i,
  /it goes without saying/i,
  /humbled to/i,
  /grateful for this opportunity/i,
];

const OBVIOUS_AI_PATTERNS = [
  /dive into/i,
  /delve into/i,
  /in the realm of/i,
  /it's worth noting/i,
  /as an ai/i,
  /I (cannot|can't) (help|assist)/i,
  /certainly!/i,
  /absolutely!/i,
  /of course!/i,
  /great question/i,
  /I'd be happy to/i,
  /as requested/i,
];

const FAKE_ACCOMPLISHMENT_PATTERNS = [
  /award.winning/i,
  /chart.topping/i,
  /sold.out tours/i,
  /millions of fans/i,
  /world.renowned/i,
  /critically acclaimed/i,
  /platinum.certified/i,
];

export function checkHardGuardrails(caption: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  // LinkedIn influencer phrasing
  for (const pattern of LINKEDIN_PATTERNS) {
    if (pattern.test(caption)) {
      violations.push({
        rule: "no-linkedin-tone",
        detail: `LinkedIn-influencer phrase detected: "${caption.match(pattern)?.[0]}"`,
      });
      break;
    }
  }

  // Obvious AI phrasing
  for (const pattern of OBVIOUS_AI_PATTERNS) {
    if (pattern.test(caption)) {
      violations.push({
        rule: "no-obvious-ai",
        detail: `Obvious AI phrase detected: "${caption.match(pattern)?.[0]}"`,
      });
      break;
    }
  }

  // Fake accomplishments
  for (const pattern of FAKE_ACCOMPLISHMENT_PATTERNS) {
    if (pattern.test(caption)) {
      violations.push({
        rule: "no-fake-accomplishments",
        detail: `Potentially fake accomplishment claim: "${caption.match(pattern)?.[0]}"`,
      });
      break;
    }
  }

  // Exclamation overuse
  const exclamations = (caption.match(/!/g) ?? []).length;
  if (exclamations > 4) {
    violations.push({
      rule: "exclamation-overuse",
      detail: `${exclamations} exclamation marks found. Max 4 recommended.`,
    });
  }

  return violations;
}

export function checkEmojiOveruse(
  caption: string,
  emojiTolerance = 5
): GuardrailViolation[] {
  const emojiCount = (caption.match(/[\u{1F300}-\u{1FFFF}]/gu) ?? []).length;
  if (emojiCount > emojiTolerance) {
    return [
      {
        rule: "emoji-overuse",
        detail: `Emoji overuse: ${emojiCount} emojis (tolerance: ${emojiTolerance}).`,
      },
    ];
  }
  return [];
}

export function checkBandVoiceSeparation(
  caption: string,
  targetBandName: string,
  otherBandNames: string[]
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const haystack = caption.toLowerCase();
  const target = targetBandName.toLowerCase();

  for (const name of otherBandNames) {
    if (!name) continue;
    const needle = name.toLowerCase();
    if (needle !== target && haystack.includes(needle)) {
      violations.push({
        rule: "band-voice-separation",
        detail: `Caption references another band: "${name}". Bands must have separate voices.`,
      });
    }
  }

  return violations;
}

export function checkAutoPublishGuard(isAutoPublish: boolean): GuardrailViolation[] {
  if (isAutoPublish) {
    return [
      {
        rule: "no-auto-publish",
        detail: "Auto-publish is disabled by policy. All posts must go through the review queue.",
      },
    ];
  }
  return [];
}

export interface EvaluateGuardrailsInput {
  caption: string;
  bandName: string;
  otherBandNames: string[];
  emojiTolerance?: number;
  /** Always false in StoryLiner. Kept as an explicit argument so auto-publish cannot be implicit. */
  isAutoPublish?: boolean;
}

/**
 * Combined hard-guardrail pass used after generate, rewrite, and manual caption edit.
 * Violations flag risk; they do not publish and do not skip review.
 */
export function evaluateGuardrails(input: EvaluateGuardrailsInput): GuardrailViolation[] {
  return [
    ...checkHardGuardrails(input.caption),
    ...checkEmojiOveruse(input.caption, input.emojiTolerance),
    ...checkBandVoiceSeparation(input.caption, input.bandName, input.otherBandNames),
    ...checkAutoPublishGuard(input.isAutoPublish ?? false),
  ];
}

export function riskLevelFromFlags(flagCount: number): "LOW" | "MEDIUM" | "HIGH" {
  return flagCount === 0 ? "LOW" : flagCount <= 2 ? "MEDIUM" : "HIGH";
}
