import { z } from "zod";
import { createBandSchema } from "@/lib/schemas/band";

const bandSetupSchema = createBandSchema.omit({ slug: true }).extend({
  name: z.string().trim().min(1, "Band name is required").max(80),
  toneDescription: z
    .string()
    .trim()
    .min(10, "Describe the band's voice in at least 10 characters")
    .max(1000),
  personalityTraits: z
    .string()
    .trim()
    .min(1, "Add at least one voice trait")
    .max(300)
    .refine(
      (value) => splitBandSetupList(value).length <= 10,
      "Use no more than 10 voice traits"
    ),
  bannedPhrases: z.string().trim().max(500).optional(),
});

export type BandSetupInput = z.infer<typeof bandSetupSchema>;

function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export function parseBandSetupForm(formData: FormData): BandSetupInput {
  return bandSetupSchema.parse({
    name: formData.get("name"),
    description: optionalText(formData.get("description")),
    genre: optionalText(formData.get("genre")),
    location: optionalText(formData.get("location")),
    founded: optionalText(formData.get("founded")),
    coverColor: formData.get("coverColor") || "#6d28d9",
    toneDescription: formData.get("toneDescription"),
    personalityTraits: formData.get("personalityTraits"),
    bannedPhrases: optionalText(formData.get("bannedPhrases")),
  });
}

export function splitBandSetupList(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function bandSlugBase(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return slug || "band";
}

export async function nextAvailableBandSlug(
  name: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = bandSlugBase(name);
  if (!(await exists(base))) return base;

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base.slice(0, 76 - String(suffix).length)}-${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }

  throw new Error("Could not create a unique band URL. Try a more specific name.");
}
