import type { BandVoiceProfile } from "@prisma/client";
import { OpenAiLlmAdapter } from "@/lib/services/llm/openai-adapter";
import { campaignFixture } from "@/tests/fixtures/campaign-context";

const mockCompletion = jest.fn().mockResolvedValue({
  choices: [{ message: { content: JSON.stringify({ caption: "Fault Lines", riskFlags: [] }) } }],
});

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn(() => ({ chat: { completions: { create: mockCompletion } } })),
}));

describe("Fault Lines provider canon instructions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(process, "env", { ...process.env, OPENAI_API_KEY: "synthetic-test-key" });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([null, {
    toneDescription: "Context-led and concise",
    personalityTraits: [], toneRules: [], bannedPhrases: [], bannedTopics: [],
  } as unknown as BandVoiceProfile])("forbids inferred timing with profile %j", async (voiceProfile) => {
    const band = { ...campaignFixture().band, name: "Fault Lines", voiceProfile };
    await new OpenAiLlmAdapter().generateContent({
      band, campaignType: "LIVESTREAM_ANNOUNCEMENT", platform: "FACEBOOK", contentLength: "MEDIUM",
    });

    expect(mockCompletion).toHaveBeenCalledTimes(1);
    const system = mockCompletion.mock.calls[0][0].messages[0].content;
    expect(system).toContain("Fault Lines canon is pending. Use only supplied facts.");
    expect(system).toContain("Do not infer event dates, times, venues, genre, location, lineup, history, or audience.");
    expect(system).toContain("Missing details must remain unclaimed; never default to now, tonight, Saturday, or 8pm.");
    expect(system).not.toMatch(/best judgment based on the band name and genre/);
    expect(system).toContain("Never auto-publish");
  });
});
