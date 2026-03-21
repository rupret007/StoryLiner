import { getLlmAdapter } from "@/lib/services/llm";
import { prisma } from "@/lib/prisma";

async function smokeTest() {
  console.log("Starting StoryLiner OpenAI Smoke Test...");
  const adapter = getLlmAdapter();
  
  const band = await prisma.band.findFirst({
    where: { isActive: true },
    include: { voiceProfile: true }
  });

  if (!band) {
    console.error("No active band found. Run seed first.");
    process.exit(1);
  }

  console.log(`Testing with band: ${band.name}`);
  
  try {
    const result = await adapter.generateContent({
      band: band as any,
      campaignType: "SHOW_ANNOUNCEMENT",
      platform: "INSTAGRAM",
      contentLength: "SHORT",
      toneVariant: "AUTHENTIC",
      context: {
        venue: "The Metro",
        showDate: "Friday, April 10"
      }
    });

    console.log("SUCCESS: Content generated via OpenAI!");
    console.log("--- CAPTION ---");
    console.log(result.caption);
    console.log("--- HASHTAGS ---");
    console.log(result.hashtags.join(" "));
    console.log("--- CONFIDENCE NOTES ---");
    console.log(result.confidenceNotes);
  } catch (err) {
    console.error("SMOKE TEST FAILED:", err);
    process.exit(1);
  }
}

smokeTest();
