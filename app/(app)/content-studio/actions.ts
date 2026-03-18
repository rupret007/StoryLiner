"use server";

import { generateContent } from "@/lib/services/content/generate";
import { generateContentSchema } from "@/lib/schemas/content";
import type { Draft } from "@prisma/client";

export async function generateContentAction(
  input: Parameters<typeof generateContent>[0]
): Promise<Draft> {
  const parsed = generateContentSchema.parse(input);
  return generateContent(parsed);
}
