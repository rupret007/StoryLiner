import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "./seed";

const prisma = new PrismaClient();

async function main() {
  const user = await seedDemoData(prisma);

  // ─── Band: Fault Lines ───────────────────────────────────────────────────────
  // The band identity is owner-confirmed. All other canon stays intentionally
  // blank until the operator supplies it; do not infer genre, location, lineup,
  // history, handles, or audience details just to make the demo look fuller.
  const faultLines = await prisma.band.upsert({
    where: { slug: "fault-lines" },
    create: {
      userId: user.id,
      name: "Fault Lines",
      slug: "fault-lines",
      description:
        "A StoryLiner band profile with owner-controlled canon. Add confirmed band facts and platform accounts when they are available.",
      coverColor: "#0f766e",
    },
    update: {},
  });

  await prisma.bandVoiceProfile.upsert({
    where: { bandId: faultLines.id },
    create: {
      bandId: faultLines.id,
      toneDescription:
        "Canon-pending and context-led. Fault Lines drafts are concise, natural, and limited to operator-supplied facts. Do not infer the band's genre, hometown, history, lineup, audience, sound, or personality.",
      personalityTraits: ["context-led", "concise", "canon-pending"],
      audienceNotes:
        "Not confirmed yet. Address only audience details supplied by the operator for the current draft.",
      postingGoals: [
        "Create useful review-only drafts from confirmed context",
        "Keep the Fault Lines voice separate from Stalemate and Rad Dad",
        "Leave unknown band facts visibly unclaimed",
      ],
      toneRules: [
        "Use only facts supplied in the current request or confirmed profile.",
        "Do not borrow Stalemate's dry voice or Rad Dad's nostalgic cover-band voice.",
        "Do not infer genre, location, lineup, history, venues, songs, or audience traits.",
        "Prefer a short neutral draft when context is sparse.",
        "Every result remains a draft until the operator reviews it.",
      ],
      bannedPhrases: [
        "excited to announce",
        "honored to share",
        "music journey",
        "critically acclaimed",
        "award-winning",
        "world-class",
        "game changer",
        "synergy",
      ],
      bannedTopics: [
        "unconfirmed genre or sound",
        "unconfirmed lineup or member names",
        "unconfirmed origin or hometown",
        "unconfirmed shows, songs, releases, or accomplishments",
      ],
      defaultTone: "AUTHENTIC",
      humorLevel: 3,
      edgeLevel: 3,
      emojiTolerance: 1,
      isExplicitOk: false,
      preferredLengths: ["SHORT", "MEDIUM"],
      instagramNotes:
        "Use no more than three context-supported hashtags. Do not infer a location or genre tag.",
      facebookNotes:
        "Use only confirmed event and link details supplied for the draft.",
      youtubeNotes:
        "Describe only the supplied video or channel context. Do not invent credits or release history.",
      goodExamples: [
        "Fault Lines. Confirmed details below.",
        "Show details are set. Date, time, and ticket link below.",
        "Thanks for being there.",
      ],
      badExamples: [
        "Chicago's biggest new band is taking over the scene!",
        "Our award-winning lineup is back with another genre-defining release!",
      ],
    },
    update: {},
  });

  console.log(`  Band: Fault Lines (${faultLines.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
