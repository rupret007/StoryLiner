"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  nextAvailableBandSlug,
  parseBandSetupForm,
  splitBandSetupList,
} from "@/lib/services/bands/setup";

export type BandSetupState = {
  error?: string;
};

export async function createBandAction(
  _previousState: BandSetupState,
  formData: FormData
): Promise<BandSetupState> {
  let parsed: ReturnType<typeof parseBandSetupForm>;
  try {
    parsed = parseBandSetupForm(formData);
  } catch {
    return {
      error:
        "Check the required band name, voice description, and voice traits, then try again.",
    };
  }
  const personalityTraits = splitBandSetupList(parsed.personalityTraits);
  const bannedPhrases = splitBandSetupList(parsed.bannedPhrases);

  let bandId: string;
  try {
    bandId = await prisma.$transaction(async (tx) => {
      const user =
        (await tx.user.findFirst({ orderBy: { createdAt: "asc" } })) ??
        (await tx.user.create({ data: { name: "Operator" } }));
      const slug = await nextAvailableBandSlug(parsed.name, async (candidate) =>
        Boolean(
          await tx.band.findUnique({
            where: { slug: candidate },
            select: { id: true },
          })
        )
      );

      const band = await tx.band.create({
        data: {
          userId: user.id,
          name: parsed.name,
          slug,
          description: parsed.description,
          genre: parsed.genre,
          location: parsed.location,
          founded: parsed.founded,
          coverColor: parsed.coverColor,
          voiceProfile: {
            create: {
              toneDescription: parsed.toneDescription,
              personalityTraits,
              audienceNotes: "",
              postingGoals: [],
              toneRules: [],
              bannedPhrases,
              bannedTopics: [],
              defaultTone: "AUTHENTIC",
              humorLevel: 5,
              edgeLevel: 5,
              emojiTolerance: 3,
              isExplicitOk: false,
              preferredLengths: ["SHORT", "MEDIUM"],
              goodExamples: [],
              badExamples: [],
            },
          },
        },
      });
      return band.id;
    });
  } catch {
    return {
      error:
        "StoryLiner could not save this band. Nothing was connected or published; try again.",
    };
  }

  redirect(`/bands/${bandId}`);
}
