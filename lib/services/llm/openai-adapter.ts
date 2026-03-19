/**
 * OpenAI LLM Adapter -- production implementation.
 * Uses GPT-4o for all content generation, rewriting, risk assessment,
 * talking points, and engagement prompts.
 *
 * All prompts are engineered to match the output shape of MockLlmAdapter
 * so the rest of the app (generate.ts, rewrite.ts, guardrails) works
 * identically once this adapter is active.
 */

import OpenAI from "openai";
import type { Band, BandVoiceProfile, Platform } from "@prisma/client";
import type {
  LLMAdapter,
  GenerateContentOptions,
  GeneratedContent,
  RewriteOptions,
  RiskAssessment,
} from "./types";
import { campaignTypeLabel, platformLabel } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Client bootstrap
// ---------------------------------------------------------------------------

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set. Set it in .env.local to use the OpenAI adapter."
    );
  }
  return new OpenAI({ apiKey: key });
}

function model(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o";
}

// ---------------------------------------------------------------------------
// Prompt assembly helpers
// ---------------------------------------------------------------------------

function buildGenerateSystemPrompt(
  band: Band & { voiceProfile: BandVoiceProfile | null },
  platform: Platform
): string {
  const vp = band.voiceProfile;
  const isRadDad = band.name.toLowerCase().includes("rad dad");

  const platformNoteMap = vp
    ? { FACEBOOK: vp.facebookNotes, INSTAGRAM: vp.instagramNotes, YOUTUBE: vp.youtubeNotes, BLUESKY: vp.blueskyNotes, TIKTOK: vp.tiktokNotes, TWITCH: vp.twitchNotes }
    : null;
  const platformNotes = platformNoteMap ? platformNoteMap[platform as keyof typeof platformNoteMap] : null;

  const toneDescription = vp?.toneDescription ?? (
    isRadDad
      ? "Pop-punk cover band energy -- nostalgic, crowd-first, fun, self-aware, not too serious."
      : "Dry indie rock -- scene-rooted, honest, a little distant, values substance over flash."
  );

  const personalityTraits = vp?.personalityTraits?.length
    ? vp.personalityTraits.join(", ")
    : isRadDad
    ? "energetic, playful, crowd-driven, self-aware, fun-loving"
    : "reserved, genuine, a bit distant, substance-focused, low-ego";

  const bannedPhrases = vp?.bannedPhrases?.length
    ? vp.bannedPhrases.join(", ")
    : "none";

  const bannedTopics = vp?.bannedTopics?.length
    ? vp.bannedTopics.join(", ")
    : "none specified";

  const humorLevel = vp?.humorLevel ?? (isRadDad ? 8 : 5);
  const edgeLevel = vp?.edgeLevel ?? (isRadDad ? 5 : 7);
  const emojiTolerance = vp?.emojiTolerance ?? 3;
  const isExplicitOk = vp?.isExplicitOk ?? false;

  return `You are the voice and social media copywriter for ${band.name}.

BAND TONE DESCRIPTION:
${toneDescription}

BAND PERSONALITY TRAITS: ${personalityTraits}

BAND-SPECIFIC VOICE RULES:
- Tone rules: ${vp?.toneRules?.length ? vp.toneRules.join("; ") : "match the tone description above"}
- BANNED PHRASES (never use): ${bannedPhrases}
- BANNED TOPICS (avoid): ${bannedTopics}

CONTENT SETTINGS:
- Humor level: ${humorLevel}/10 (10 = very funny/jokey, 1 = dead serious)
- Edge level: ${edgeLevel}/10 (10 = raw/honest/provocative, 1 = safe/corporate)
- Emoji tolerance: ${emojiTolerance}/10 (10 = emoji-heavy, 0 = no emoji)
- Explicit content OK: ${isExplicitOk}
${platformNotes ? `\nPLATFORM NOTES (${platformLabel(platform)}):\n${platformNotes}` : ""}

OUTPUT FORMAT:
Always respond with a valid JSON object matching this exact schema:
{
  "caption": "...",
  "hashtags": ["#tag1", "#tag2", ...],
  "ctaText": "optional call-to-action text, omit if not relevant",
  "altText": "optional alt text for an associated image, omit if not relevant",
  "imagePrompt": "optional DALL-E image generation prompt, omit if not relevant",
  "fanReplies": ["reply1", "reply2", "reply3"],
  "brandFitScore": 85,
  "confidenceNotes": "brief note on how you applied the voice profile",
  "riskFlags": []
}

The "fanReplies" field should contain 2-3 realistic short comments that fans might leave on this post. Make them specific to ${band.name}'s personality, not generic.

The "brandFitScore" is 0-100 -- rate how well the caption matches the band's voice profile.

The "riskFlags" field must be an empty array if the caption is clean, or contain short string descriptions of any issues found.

${!vp ? `\nNOTE: No voice profile is configured for this band. Use your best judgment based on the band name and genre, and note this in confidenceNotes.` : ""}`;
}

function buildGenerateUserPrompt(
  options: GenerateContentOptions
): string {
  const { band, campaignType, platform, contentLength, toneVariant, context } = options;
  const isRadDad = band.name.toLowerCase().includes("rad dad");

  const typeLabel = campaignTypeLabel(campaignType).toLowerCase();
  const platformLabelStr = platformLabel(platform);

  let contentLengthInstruction = "";
  if (contentLength === "SHORT") {
    contentLengthInstruction =
      platform === "INSTAGRAM"
        ? "Caption must be 150 characters or fewer."
        : "Caption must be 200 characters or fewer. One short paragraph only.";
  } else if (contentLength === "LONG") {
    contentLengthInstruction =
      "Write a longer caption -- multiple paragraphs welcome. Include backstory, context, or a genuine note that fits the band's voice.";
  }

  const contextSection = context
    ? `\nCONTEXT FOR THIS POST:\n${[
        context.showDate ? `Show date: ${context.showDate}` : null,
        context.venue ? `Venue: ${context.venue}` : null,
        context.city ? `City: ${context.city}` : null,
        context.ticketUrl ? `Ticket URL: ${context.ticketUrl}` : null,
        context.additionalContext ? `Additional context: ${context.additionalContext}` : null,
      ]
        .filter(Boolean)
        .join("\n")}`
    : "";

  const toneInstruction =
    toneVariant && toneVariant !== "AUTHENTIC"
      ? `\nTONE VARIANT: ${toneVariant} -- adjust the delivery accordingly.\n`
      : "\n";

  // Platform-specific constraints
  const platformConstraints: Record<string, string> = {
    FACEBOOK:
      "Facebook supports longer posts. Can include line breaks for readability. Emojis optional.",
    INSTAGRAM:
      "Instagram caption -- lead with the hook. The first line must grab attention because it shows in the feed preview. Hashtags can go at the end.",
    YOUTUBE:
      "YouTube community post -- can be conversational and link-focused. Less formal than a show announcement.",
    BLUESKY:
      "Bluesky -- concise, conversational, maximum 300 characters recommended. No hashtag spam.",
    TIKTOK:
      "TikTok -- punchy, no-fluff, hooks fast. Consider whether it plays over a video clip.",
    TWITCH:
      "Twitch community -- casual, in-the-moment energy, conversational.",
  };

  const platformInstruction = platformConstraints[platform] ?? "";

  // Campaign guidance: separate objects by band type, combined at runtime.
  // This avoids a TypeScript parsing quirk with ternary expressions as object property values.
  const stalemateGuidance: Record<string, string> = {
    SHOW_ANNOUNCEMENT: "Announce the show with the vibe of someone who expects the room to show up. State the facts (venue, date), then add one line that sets the tone. Dry energy, not cheerleading.",
    SHOW_REMINDER: "Gentle reminder. The kind of post someone sees and thinks 'oh right, I meant to get tickets.' State the facts plainly.",
    LAST_CALL: "Last call. Keep it terse. The kind of post that hits different if you've been on the fence.",
    DAY_OF_SHOW: "Day-of post. Shorter, punchier. Could be the soundcheck, could be a photo from load-in. Add one line of dry anticipation.",
    RECAP: "Recap a show. Acknowledge what happened without overselling it. Could mention something specific about the room or the set. Thank the people who came.",
    LIVE: "Promote a livestream. Note what makes this stream worth watching live. Could be a specific song, a Q&A, something happening that won't be on the replay.",
    GENERAL: "General band content. Could be about practice, new material, a random thought. Stalemate voice: dry, a little detached, honest. Don't overshare.",
    CAMPAIGN: "Write content for an ongoing campaign. Keep the messaging consistent with the campaign's theme.",
    PROMO: "Promotional content. Honest and direct. Don't oversell.",
    CONTEST: "Write a contest announcement or call-to-action. Be clear about the prize, how to enter, and the deadline.",
    PODCAST: "Write a podcast episode announcement or episode note. Name the episode topic, what listeners will get out of it.",
    BLOG: "Write a blog post or update. Can be longer form, more personal, or more detailed than a social post.",
    NEWSLETTER: "Write a newsletter update. Conversational but more considered than a social post. Can be longer.",
    THANK_YOU: "Say thank you without it sounding like an obligation. One genuine sentence beats a paragraph of praise.",
    UNSPECIFIED: "Write a natural, in-character band post.",
  };

  const radDadGuidance: Record<string, string> = {
    SHOW_ANNOUNCEMENT: "Write like you're hyped to play this show and want everyone there. Name the venue, date, and what makes this show worth showing up to. Enthusiastic but not desperate.",
    SHOW_REMINDER: "Remind people the show is coming up. Create urgency without being annoying. Name what's at stake -- last chance to hear X song, this is the biggest room we've played, etc.",
    LAST_CALL: "Final push. Tickets are almost gone or the show is tonight/tomorrow. Create real urgency -- name the number of tickets left if known, or just lean into the 'this is your last chance' energy.",
    DAY_OF_SHOW: "Post on the day of the show. Build excitement for tonight. Can include details about what to expect, who to find, where to park. Ends with a clear invitation.",
    RECAP: "Recap a show that already happened. Celebrate the crowd, reference a specific moment, thank the city. Energy should be post-high -- still buzzing but not frantic.",
    LIVE: "Promote an upcoming livestream. Make it sound like you want people to show up in real time, not just watch the replay. Include what they'll see/hear.",
    GENERAL: "General band content -- practice, new ideas, behind-the-scenes. Keep it light and conversational. Don't force it -- if there's nothing interesting to say, say it in an interesting way.",
    CAMPAIGN: "Write content for an ongoing campaign. Keep the messaging consistent with the campaign's theme.",
    PROMO: "Promotional content. Build interest in the band, a show, or a release. Keep it energetic without being obvious about 'selling' something.",
    CONTEST: "Write a contest announcement or call-to-action. Be clear about the prize, how to enter, and the deadline.",
    PODCAST: "Write a podcast episode announcement or episode note. Name the episode topic, what listeners will get out of it.",
    BLOG: "Write a blog post or update. Can be longer form, more personal, or more detailed than a social post.",
    NEWSLETTER: "Write a newsletter update. Conversational but more considered than a social post. Can be longer.",
    THANK_YOU: "Thank the crowd, venue, another band, or fans. Be specific if possible. Rad Dad thanks with energy and warmth -- not corporate gratitude.",
    UNSPECIFIED: "Write a natural, in-character band post.",
  };

  const campaignGuidance = isRadDad ? radDadGuidance : stalemateGuidance;
  const campaignInstruction = campaignGuidance[typeLabel] ?? campaignGuidance.UNSPECIFIED;

  return `${campaignInstruction}

Band name: ${band.name}
Content type: ${typeLabel}
Platform: ${platformLabelStr}
${contentLengthInstruction}
${contextSection}
${toneInstruction}
${platformInstruction}

Write the JSON output now.`;
}

function buildRewriteSystemPrompt(
  band: Band & { voiceProfile: BandVoiceProfile | null }
): string {
  const vp = band.voiceProfile;
  const isRadDad = band.name.toLowerCase().includes("rad dad");

  const toneDescription = vp?.toneDescription ?? (
    isRadDad
      ? "Pop-punk cover band energy -- nostalgic, crowd-first, fun, self-aware."
      : "Dry indie rock -- scene-rooted, honest, a little distant."
  );

  const bannedPhrases = vp?.bannedPhrases?.length
    ? vp.bannedPhrases.join(", ")
    : "none";

  return `You are rewriting social media copy for ${band.name}.

BAND TONE: ${toneDescription}

BANNED PHRASES (never re-introduce these): ${bannedPhrases}

The user will provide:
1. The original caption
2. A rewrite directive (e.g., "funnier", "morePunk", "shorterHashtags", "addCTA", "noHashtags")

Apply the directive while keeping the caption in ${band.name}'s voice.
Do not re-introduce banned phrases.
Return only the rewritten caption as plain text -- no JSON, no explanation.

If the directive is not recognized, apply its literal meaning sensibly.
If the directive is "shorterHashtags", keep only short hashtags (under 15 characters).
If the directive is "noHashtags", remove all hashtags entirely.
If the directive is "addCTA", append a natural call-to-action that fits the band's voice.
If the directive is "funnier", add humor consistent with the band's personality.
If the directive is "morePunk" (Stalemate) or "moreFun" (Rad Dad), adjust tone accordingly.`;
}

function buildRiskSystemPrompt(
  band: Band & { voiceProfile: BandVoiceProfile | null }
): string {
  const vp = band.voiceProfile;
  const isRadDad = band.name.toLowerCase().includes("rad dad");

  const bannedPhrases = vp?.bannedPhrases?.length
    ? vp.bannedPhrases.join(", ")
    : "none";

  const emojiTolerance = vp?.emojiTolerance ?? 3;

  return `You are a brand safety reviewer for ${band.name}.

BAND VOICE PROFILE:
- Tone: ${vp?.toneDescription ?? (isRadDad ? "pop-punk, fun, crowd-first" : "dry indie rock, honest, scene-rooted")}
- BANNED PHRASES: ${bannedPhrases}
- Emoji tolerance: ${emojiTolerance}/10

Evaluate the provided caption and return a JSON object:
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "flags": ["issue1", "issue2", ...],  // empty if LOW
  "brandFitScore": 0-100,
  "confidenceNotes": "..."
}

Risk flags to check (flag if found):
- Contains any banned phrase from the band's profile
- LinkedIn-influencer phrasing: "excited to announce", "thrilled to be", "crushing it", "game-changer", "synergy", "leverage", "honored to share"
- Obvious AI phrasing: "dive into", "delve into", "in the realm of", "it's worth noting", "as an AI"
- Emoji overuse (more than ${emojiTolerance} emojis)
- More than 3 exclamation marks
- Anything that sounds corporate or fake for ${band.name}'s voice

brandFitScore: 88-100 = excellent fit, 72-87 = good, 50-71 = questionable, below 50 = poor

Return the JSON now.`;
}

// ---------------------------------------------------------------------------
// Shared OpenAI call
// ---------------------------------------------------------------------------

async function openaiCompletion<T>({
  system,
  user,
  responseFormat,
  temperature = 0.8,
}: {
  system: string;
  user: string;
  responseFormat: OpenAI.Chat.ChatCompletionCreateParams["response_format"];
  temperature?: number;
}): Promise<T> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: model(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: responseFormat,
    temperature,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned an empty response.");
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`OpenAI response was not valid JSON: ${raw.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export class OpenAiLlmAdapter implements LLMAdapter {
  name = "openai";

  async generateContent(options: GenerateContentOptions): Promise<GeneratedContent> {
    const system = buildGenerateSystemPrompt(options.band, options.platform);
    const user = buildGenerateUserPrompt(options);

    const result = await openaiCompletion<GeneratedContent>({
      system,
      user,
      responseFormat: { type: "json_object" },
      temperature: 0.8,
    });

    // Ensure riskFlags exists and is an array
    if (!Array.isArray(result.riskFlags)) {
      result.riskFlags = [];
    }

    return result;
  }

  async rewriteContent(options: RewriteOptions): Promise<string> {
    const { originalCaption, directive, band } = options;

    const system = buildRewriteSystemPrompt(band);

    const user = `Original caption:
${originalCaption}

Directive: ${directive}

Rewritten caption:`;

    const result = await openaiCompletion<{ caption?: string; text?: string }>({
      system,
      user,
      responseFormat: { type: "json_object" },
      temperature: 0.7,
    });

    return result.caption ?? result.text ?? originalCaption;
  }

  async assessRisk(
    caption: string,
    band: Band & { voiceProfile: BandVoiceProfile | null }
  ): Promise<RiskAssessment> {
    const system = buildRiskSystemPrompt(band);

    const user = `Caption to review:
${caption}

Return your risk assessment as JSON now.`;

    return openaiCompletion<RiskAssessment>({
      system,
      user,
      responseFormat: { type: "json_object" },
      temperature: 0.3, // Low temperature for consistent risk assessment
    });
  }

  async generateTalkingPoints(options: {
    livestreamTitle: string;
    bandName: string;
    runOfShowItems: string[];
  }): Promise<string[]> {
    const { livestreamTitle, bandName, runOfShowItems } = options;
    const isRadDad = bandName.toLowerCase().includes("rad dad");

    const system = `You are a ${bandName} band member writing talking points for a livestream.
${isRadDad ? "Rad Dad voice: energetic, playful, crowd-friendly, fun." : "Stalemate voice: dry, genuine, a little reserved, substance-focused."}
Generate 4-6 short talking point strings. Each should be a single sentence or phrase a host can say to transition or open.
Return JSON: { "points": ["point1", "point2", ...] }`;

    const user = `Livestream title: ${livestreamTitle}
Run of show items: ${runOfShowItems.join(" | ")}
Return JSON now.`;

    const result = await openaiCompletion<{ points: string[] }>({
      system,
      user,
      responseFormat: { type: "json_object" },
      temperature: 0.7,
    });

    return result.points ?? [];
  }

  async generateEngagementPrompts(options: {
    bandName: string;
    platform: Platform;
  }): Promise<string[]> {
    const { bandName, platform } = options;
    const isRadDad = bandName.toLowerCase().includes("rad dad");

    const system = `You are a social media strategist for ${bandName}.
Generate 5 short engagement prompts (1-2 sentences each) that a ${platformLabel(platform).toLowerCase()} post from this band should ask fans.
These should feel natural and specific to the band's personality -- not generic.
Return JSON: { "prompts": ["prompt1", "prompt2", ...] }`;

    const user = `Band: ${bandName}
Platform: ${platformLabel(platform)}
Return JSON now.`;

    const result = await openaiCompletion<{ prompts: string[] }>({
      system,
      user,
      responseFormat: { type: "json_object" },
      temperature: 0.8,
    });

    return result.prompts ?? [];
  }
}
