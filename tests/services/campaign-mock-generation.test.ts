import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MockLlmAdapter } from "@/lib/services/llm/mock-adapter";
import { buildCampaignContextView } from "@/lib/services/content/campaign-context";
import { campaignFixture } from "@/tests/fixtures/campaign-context";

describe("offline saved-context adapter", () => {
  it.each(["SHORT", "MEDIUM", "LONG"] as const)("retains the supplied event facts and operator note at %s length", async (contentLength) => {
    const source = campaignFixture();
    const view = buildCampaignContextView(source);
    const result = await new MockLlmAdapter().generateContent({
      band: source.band, campaignType: source.campaign.type, platform: "FACEBOOK", contentLength,
      contextSource: "saved-campaign-event", context: { ...view.facts, additionalContext: "Bring a friend." },
    });
    for (const value of Object.values(view.facts)) expect(result.caption).toContain(value);
    expect(result.caption).toContain("Operator note (not a replacement for saved facts): Bring a friend.");
    expect(result.caption).not.toContain("8pm");
    expect(result.caption).not.toMatch(/No opener|Thursday night|sixty people/i);
    expect(result.confidenceNotes).toMatch(/mock adapter/i);
  });

  it("does not invent doors, times, a show, or venue for a non-event campaign", async () => {
    const source = campaignFixture();
    source.campaign.eventId = null;
    source.campaign.targetDate = new Date("2026-09-25T18:00:00.000Z");
    const view = buildCampaignContextView({ ...source, event: null });
    const result = await new MockLlmAdapter().generateContent({
      band: source.band, campaignType: "RELEASE_TEASER", platform: "INSTAGRAM", contentLength: "SHORT",
      contextSource: "saved-campaign-event", context: view.facts,
    });
    expect(result.caption).toContain(source.campaign.name);
    expect(result.caption).toContain(`Campaign target date: ${view.facts.campaignTargetDate}`);
    expect(result.caption).not.toMatch(/Saturday|tonight|8pm|the venue|doors|show date/i);
  });

  it("does not create a new provider path in the offline adapter", () => {
    const source = readFileSync(join(__dirname, "../../lib/services/llm/mock-adapter.ts"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|new OpenAI|openaiCompletion|https\.request/);
  });
});
