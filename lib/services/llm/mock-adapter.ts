import type { Band, BandVoiceProfile, Platform } from "@prisma/client";
import type {
  LLMAdapter,
  GenerateContentOptions,
  GeneratedContent,
  RewriteOptions,
  RiskAssessment,
} from "./types";
import { campaignTypeLabel, platformLabel } from "@/lib/utils";

// Realistic mock content pools per band archetype
const stalematePool = {
  show: [
    "Playing {venue} on {date}. Gonna be loud.",
    "We're at {venue} {date}. Come through if you need it.",
    "{date} at {venue}. Doors at {time}. We'll be the ones tuning too slow.",
    "Show at {venue} this {date}. No opener. Just us and your Thursday night.",
    "Back at {venue} {date}. Grab a ticket. We won't beg.",
  ],
  recap: [
    "Last night was the kind of room that makes you forget you have a day job. Thanks {city}.",
    "{city} showed up. We're still recovering. Thank you.",
    "That set ran long. We don't apologize for it.",
    "Played to sixty people who actually listened. That's a good night.",
  ],
  general: [
    "Rehearsal ran until someone's neighbor complained. Progress.",
    "New stuff is almost ready. Almost.",
    "Working on something that doesn't have a name yet.",
    "Three practices in and it's starting to feel like a song.",
  ],
  hashtags: ["#originalmusiconly", "#bandlife", "#livemusicscene", "#localband", "#independentmusic", "#songwriting", "#rehearsal"],
};

const radDadPool = {
  show: [
    "{venue} is getting a pop punk education on {date}. You should be there.",
    "We're playing {venue} {date} and we WILL play Basket Case. Come fight us.",
    "{date} at {venue}. Shorts optional. Big sing-alongs mandatory.",
    "Hey {city}. {date}. Bring your friends who still own band tees.",
    "Playing {venue} this {date}. Every blink song you forgot you loved.",
  ],
  recap: [
    "{city} you absolutely went off last night. Thank you for knowing every word.",
    "Last night's crowd was unhinged in the best way. {city} stays elite.",
    "We played for two hours and nobody asked us to stop. Peak band behavior.",
    "That was the most fun we've had in a while. Thank you {city}.",
  ],
  general: [
    "Band practice. Someone played the wrong key for twenty minutes. Still a good time.",
    "We learned a new cover and refused to agree on the tempo. Classic.",
    "Running the set list again. Somehow we keep making it longer.",
    "Whoever requested that last song, you know what you did.",
  ],
  hashtags: ["#covermusicband", "#popunk2000s", "#coverband", "#nostalgiafest", "#altrocklives", "#singalong", "#livecovers"],
};

function isRadDad(bandName: string): boolean {
  return bandName.toLowerCase().includes("rad dad");
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `[${key}]`);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class MockLlmAdapter implements LLMAdapter {
  name = "mock";

  async generateContent(options: GenerateContentOptions): Promise<GeneratedContent> {
    const { band, campaignType, platform, contentLength, context } = options;
    const isRD = isRadDad(band.name);
    const pool = isRD ? radDadPool : stalematePool;

    const vars: Record<string, string> = {
      venue: context?.venue ?? "the venue",
      date: context?.showDate ?? "Saturday",
      city: context?.city ?? "the city",
      time: "8pm",
      bandname: band.name,
    };

    let caption: string;
    const type = campaignType.toLowerCase();

    if (type.includes("show") || type.includes("announcement") || type.includes("reminder") || type.includes("last_call") || type.includes("day_of")) {
      caption = fillTemplate(pickRandom(pool.show), vars);
    } else if (type.includes("recap") || type.includes("thank")) {
      caption = fillTemplate(pickRandom(pool.recap), vars);
    } else if (type.includes("live") || type.includes("stream")) {
      caption = isRD
        ? `Going live ${context?.showDate ?? "tonight"}. We're playing covers and answering questions. Join us.`
        : `Streaming ${context?.showDate ?? "tonight"}. Come hang.`;
    } else {
      caption = fillTemplate(pickRandom(pool.general), vars);
    }

    if (contentLength === "LONG" && context?.additionalContext) {
      caption += `\n\n${context.additionalContext}`;
    }

    if (context?.ticketUrl && contentLength !== "SHORT") {
      caption += `\n\nTickets: ${context.ticketUrl}`;
    }

    const hashtags = pool.hashtags
      .sort(() => 0.5 - Math.random())
      .slice(0, platform === "INSTAGRAM" ? 8 : 4);

    const voiceProfile = band.voiceProfile;
    const brandFitScore = voiceProfile ? Math.floor(Math.random() * 20) + 78 : 70;

    return {
      caption,
      hashtags,
      ctaText: context?.ticketUrl ? "Grab tickets before they're gone" : undefined,
      altText: `${band.name} performing live on stage`,
      imagePrompt: `${band.name} live performance photo, dark moody lighting, ${isRD ? "energetic crowd" : "intimate venue"}, concert photography style`,
      fanReplies: [
        "Excited to see you there!",
        isRD ? "I know every word to every song you play" : "I've been waiting for you to come back",
        "Already got my ticket",
      ],
      brandFitScore,
      confidenceNotes: `Generated using mock adapter. Voice profile ${voiceProfile ? "applied" : "not configured"}.`,
      riskFlags: [],
    };
  }

  async rewriteContent(options: RewriteOptions): Promise<string> {
    const { originalCaption, directive, band } = options;
    const isRD = isRadDad(band.name);

    const transformations: Record<string, (text: string) => string> = {
      funnier: (t) =>
        isRD
          ? t + " (We will absolutely take requests for Mr. Brightside.)"
          : t + " We're very normal people who are definitely fine.",
      lessCheesy: (t) =>
        t.replace(/!/g, ".").replace(/amazing|incredible|awesome/gi, "good"),
      morePunk: (t) =>
        isRD ? t + " Wear your band tee." : t + " No fake smiles.",
      cleaner: (t) =>
        t.replace(/[*!]{2,}/g, "").replace(/\n{3,}/g, "\n\n").trim(),
      moreHuman: (t) => {
        const lines = t.split("\n");
        return lines[0] + (lines.length > 1 ? "\n\n" + lines.slice(1).join("\n") : "");
      },
      moreConcise: (t) => t.split("\n")[0],
      moreUrgency: (t) => t + " Don't wait on this.",
      moreAuthentic: (t) =>
        isRD
          ? t.replace(/We're|We are/g, "We're still")
          : t.replace(/We're|We are/g, "Still"),
      shorterHashtags: (t) => t.replace(/#\w{15,}/g, ""),
      noHashtags: (t) => t.replace(/#\w+/g, "").trim(),
      addCTA: (t) => t + "\n\nLink in bio.",
    };

    const transform = transformations[directive];
    return transform ? transform(originalCaption) : originalCaption;
  }

  async assessRisk(
    caption: string,
    band: Band & { voiceProfile: BandVoiceProfile | null }
  ): Promise<RiskAssessment> {
    const flags: string[] = [];
    const voiceProfile = band.voiceProfile;

    // Check for banned phrases
    if (voiceProfile?.bannedPhrases) {
      for (const phrase of voiceProfile.bannedPhrases) {
        if (caption.toLowerCase().includes(phrase.toLowerCase())) {
          flags.push(`Contains banned phrase: "${phrase}"`);
        }
      }
    }

    // Check for LinkedIn-influencer patterns
    const linkedinPatterns = [
      /excited to announce/i,
      /honored to share/i,
      /thrilled to be/i,
      /game.changer/i,
      /crushing it/i,
      /synergy/i,
      /leverage/i,
    ];
    for (const pattern of linkedinPatterns) {
      if (pattern.test(caption)) {
        flags.push("LinkedIn-influencer phrasing detected");
        break;
      }
    }

    // Check for obvious AI phrases
    const aiPatterns = [
      /dive into/i,
      /delve into/i,
      /in the realm of/i,
      /it's worth noting/i,
      /as an ai/i,
    ];
    for (const pattern of aiPatterns) {
      if (pattern.test(caption)) {
        flags.push("Obvious AI phrasing detected");
        break;
      }
    }

    // Check emoji overuse
    const emojiCount = (caption.match(/[\u{1F300}-\u{1FFFF}]/gu) ?? []).length;
    const tolerance = voiceProfile?.emojiTolerance ?? 5;
    if (emojiCount > tolerance) {
      flags.push(`Emoji overuse: ${emojiCount} emojis (tolerance: ${tolerance})`);
    }

    // Check exclamation overuse
    const exclamationCount = (caption.match(/!/g) ?? []).length;
    if (exclamationCount > 3) {
      flags.push(`Exclamation overuse: ${exclamationCount} found`);
    }

    const riskLevel =
      flags.length === 0 ? "LOW" : flags.length <= 2 ? "MEDIUM" : "HIGH";

    return {
      riskLevel,
      flags,
      brandFitScore: riskLevel === "LOW" ? 88 : riskLevel === "MEDIUM" ? 72 : 50,
      confidenceNotes:
        flags.length === 0
          ? "No issues detected. Looks good."
          : `${flags.length} issue(s) found that may affect brand fit.`,
    };
  }

  async generateTalkingPoints(options: {
    livestreamTitle: string;
    bandName: string;
    runOfShowItems: string[];
  }): Promise<string[]> {
    const { livestreamTitle, bandName, runOfShowItems } = options;
    const isRD = isRadDad(bandName);

    const base = [
      `Welcome everyone, this is ${bandName}`,
      `Thanks for joining us for "${livestreamTitle}"`,
      "Give us a second while we check the levels",
      isRD
        ? "Let us know in the chat where you're watching from"
        : "We can see the chat, say hi if you want",
    ];

    const itemPrompts = runOfShowItems.slice(0, 3).map(
      (item) => `Transition into: ${item}`
    );

    const closing = [
      "Thank you for hanging out with us",
      isRD
        ? "We'll be back soon. Stay subscribed."
        : "More stuff coming. We'll let you know.",
    ];

    return [...base, ...itemPrompts, ...closing];
  }

  async generateEngagementPrompts(options: {
    bandName: string;
    platform: Platform;
  }): Promise<string[]> {
    const { bandName, platform } = options;
    const isRD = isRadDad(bandName);

    const prompts = isRD
      ? [
          "Drop your most requested song in the chat",
          "What decade do you wish you grew up in?",
          "First show you ever went to, go",
          "Name a song we have to play tonight",
          "Who brought a friend who didn't know we were a cover band",
        ]
      : [
          "What was the last show you actually cared about",
          "Drop a song you think we'd never play",
          "Who's been here since the early days",
          "What city should we hit next",
          "Tell us one thing you want more of from us",
        ];

    return prompts;
  }
}
