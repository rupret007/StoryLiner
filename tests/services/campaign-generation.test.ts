const prismaMock = {
  band: { findUnique: jest.fn(), findMany: jest.fn() },
  campaign: { findUnique: jest.fn() },
  event: { findUnique: jest.fn() },
  generationRun: { create: jest.fn() },
  draft: { create: jest.fn() },
  draftVersion: { create: jest.fn() },
  $transaction: jest.fn(),
};
const adapterMock = { name: "mock", generateContent: jest.fn() };
const getAdapterMock = jest.fn(() => adapterMock);
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
jest.mock("@/lib/services/llm", () => ({ getLlmAdapter: () => getAdapterMock() }));

import { generateContent } from "@/lib/services/content/generate";
import { generateContentAction } from "@/app/(app)/content-studio/actions";
import { loadGenerationContext } from "@/lib/services/content/campaign-context-server";
import { buildCampaignContextView, CAMPAIGN_CONTEXT_CHANGED, CAMPAIGN_CONTEXT_OFFLINE_ONLY, CAMPAIGN_CONTEXT_UNAVAILABLE } from "@/lib/services/content/campaign-context";
import { campaignFixture, BAND_ID, CAMPAIGN_ID, EVENT_ID, OTHER_ID, NOW } from "@/tests/fixtures/campaign-context";
import type { GenerateContentInput } from "@/lib/schemas/content";

const GENERATED = {
  caption: "Fixture listening night at Fixture Hall.", hashtags: [], fanReplies: [],
  brandFitScore: 80, confidenceNotes: "Offline fixture only", riskFlags: [],
};
let source = campaignFixture();

function linkedInput(): GenerateContentInput {
  return {
    bandId: BAND_ID, campaignId: CAMPAIGN_ID, campaignType: source.campaign.type,
    platform: "FACEBOOK", contentLength: "MEDIUM",
    contextReceipt: buildCampaignContextView(source).receipt,
    context: { additionalContext: "Keep the invitation welcoming." },
  };
}
function expectNoWrite() {
  expect(prismaMock.generationRun.create).not.toHaveBeenCalled();
  expect(prismaMock.draft.create).not.toHaveBeenCalled();
  expect(prismaMock.draftVersion.create).not.toHaveBeenCalled();
}
function expectNoGeneration() {
  expect(adapterMock.generateContent).not.toHaveBeenCalled();
  expect(prismaMock.$transaction).not.toHaveBeenCalled();
  expectNoWrite();
}

beforeEach(() => {
  jest.clearAllMocks();
  source = campaignFixture();
  adapterMock.name = "mock";
  adapterMock.generateContent.mockResolvedValue(GENERATED);
  prismaMock.band.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => where.id === source.band.id ? source.band : null);
  prismaMock.band.findMany.mockResolvedValue([{ name: "Rad Dad" }]);
  prismaMock.campaign.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => where.id === source.campaign.id ? source.campaign : null);
  prismaMock.event.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => where.id === source.event.id ? source.event : null);
  prismaMock.generationRun.create.mockResolvedValue({ id: "clhf5gt0000000test0run0001" });
  prismaMock.draft.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "clhf5gt0000000test0draft01", ...data, updatedAt: NOW }));
  prismaMock.draftVersion.create.mockResolvedValue({ id: "version-fixture" });
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
});

describe("actual campaign generation action/service", () => {
  it("uses one verified fact projection for preview, mock input, run provenance, and exact campaign association", async () => {
    const input = linkedInput();
    const result = await generateContentAction(input);
    const preview = buildCampaignContextView(source);
    expect(result).toMatchObject({ bandId: BAND_ID, campaignId: CAMPAIGN_ID, status: "IN_REVIEW", currentVersion: 1 });
    expect(adapterMock.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      band: source.band, contextSource: "saved-campaign-event", campaignType: source.campaign.type,
      context: { ...preview.facts, additionalContext: input.context?.additionalContext },
    }));
    const data = prismaMock.generationRun.create.mock.calls[0][0].data;
    expect(data.inputContext).toMatchObject({
      ...preview.facts, additionalContext: input.context?.additionalContext,
      missingFacts: preview.missingFacts,
      source: { kind: "saved-campaign-event", campaignId: CAMPAIGN_ID, eventId: EVENT_ID, receipt: preview.receipt },
    });
    expect(JSON.stringify(adapterMock.generateContent.mock.calls)).not.toContain("PRIVATE FIXTURE");
    expect(JSON.stringify(data.inputContext)).not.toContain("PRIVATE FIXTURE");
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(prismaMock.band.findUnique).toHaveBeenCalledTimes(2);
    expect(prismaMock.event.findUnique).toHaveBeenCalledTimes(2);
    expect(prismaMock.draftVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ draftId: result.id, version: 1 }) });
  });

  it("retains hard guardrails and never upgrades a linked generated draft to approval", async () => {
    adapterMock.generateContent.mockResolvedValue({ ...GENERATED, caption: "Rad Dad is excited to announce this.", riskFlags: [] });
    const result = await generateContent(linkedInput());
    expect(result.status).toBe("IN_REVIEW");
    expect(result.riskFlags.length).toBeGreaterThan(0);
    expect(result.riskLevel).not.toBe("LOW");
  });

  it.each(["openai", "unknown-provider"])("refuses %s for linked context before any adapter call or database write", async (name) => {
    adapterMock.name = name;
    await expect(generateContent(linkedInput())).rejects.toThrow(CAMPAIGN_CONTEXT_OFFLINE_ONLY);
    expectNoGeneration();
  });

  it.each(["openai", "unknown-mode"])("refuses configured %s before factory construction or credential checks", async (mode) => {
    const previousMode = process.env.LLM_ADAPTER;
    try {
      process.env.LLM_ADAPTER = mode;
      await expect(generateContent(linkedInput())).rejects.toThrow(CAMPAIGN_CONTEXT_OFFLINE_ONLY);
      expect(getAdapterMock).not.toHaveBeenCalled();
      expectNoGeneration();
    } finally {
      if (previousMode === undefined) delete process.env.LLM_ADAPTER;
      else process.env.LLM_ADAPTER = previousMode;
    }
  });

  it("preserves unlinked manual generation while verifying the selected band is active", async () => {
    adapterMock.name = "fixture-existing-provider";
    const context = { venue: "Operator supplied room", eventDetails: "Operator supplied detail", additionalContext: "Manual note" };
    const result = await generateContent({ bandId: BAND_ID, campaignType: "REHEARSAL", platform: "INSTAGRAM", contentLength: "LONG", context });
    expect(result.campaignId).toBeNull();
    expect(adapterMock.generateContent).toHaveBeenCalledWith(expect.objectContaining({ context }));
    expect(adapterMock.generateContent.mock.calls[0][0]).not.toHaveProperty("contextSource");
    expect(prismaMock.campaign.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });

  it.each(["missing-band", "inactive-band", "missing-campaign", "inactive-campaign", "foreign-campaign", "missing-event", "foreign-event", "cancelled-event"])("blocks %s before generation", async (caseName) => {
    const input = linkedInput();
    if (caseName === "missing-band") prismaMock.band.findUnique.mockResolvedValue(null);
    if (caseName === "inactive-band") source.band.isActive = false;
    if (caseName === "missing-campaign") prismaMock.campaign.findUnique.mockResolvedValue(null);
    if (caseName === "inactive-campaign") source.campaign.isActive = false;
    if (caseName === "foreign-campaign") source.campaign.bandId = OTHER_ID;
    if (caseName === "missing-event") prismaMock.event.findUnique.mockResolvedValue(null);
    if (caseName === "foreign-event") source.event.bandId = OTHER_ID;
    if (caseName === "cancelled-event") source.event.isCancelled = true;
    await expect(generateContent(input)).rejects.toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
    expectNoGeneration();
  });

  it("does not silently change the requested type or substitute another supplied event", async () => {
    await expect(generateContent({ ...linkedInput(), campaignType: "RECAP" })).rejects.toThrow(/content type must match/i);
    await expect(generateContent({ ...linkedInput(), eventId: OTHER_ID })).rejects.toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
    expectNoGeneration();
  });

  it("will not attach an unrelated event to a campaign without one", async () => {
    source.campaign.eventId = null;
    const view = buildCampaignContextView({ ...source, event: null });
    const input = { ...linkedInputWithoutBuilding(), contextReceipt: view.receipt, eventId: EVENT_ID };
    await expect(generateContent(input)).rejects.toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
    expectNoGeneration();
  });

  it("accepts an exact event-only context without inventing a campaign", async () => {
    const view = buildCampaignContextView({ ...source, campaign: null });
    const result = await generateContent({ bandId: BAND_ID, eventId: EVENT_ID, campaignType: "RECAP", platform: "YOUTUBE", contentLength: "MEDIUM", contextReceipt: view.receipt });
    expect(result.campaignId).toBeNull();
    expect(prismaMock.generationRun.create.mock.calls[0][0].data.inputContext.source.eventId).toBe(EVENT_ID);
  });

  it("requires the exact displayed receipt before calling even the mock adapter", async () => {
    await expect(generateContent({ ...linkedInput(), contextReceipt: "old or forged receipt" })).rejects.toThrow(CAMPAIGN_CONTEXT_CHANGED);
    expectNoGeneration();
  });

  it("validates direct service callers and refuses saved fact overrides", async () => {
    await expect(generateContent({ ...linkedInput(), context: { venue: "Wrong room" } })).rejects.toThrow(/cannot be overridden/i);
    await expect(generateContent({ ...linkedInput(), contextReceipt: undefined })).rejects.toThrow(/Review the linked/i);
    expectNoGeneration();
  });

  it.each(["venue", "type", "band", "event-deleted", "cancelled"])("rechecks %s after adapter completion and writes nothing when saved context changed", async (caseName) => {
    const input = linkedInput();
    adapterMock.generateContent.mockImplementation(async () => {
      if (caseName === "venue") source.event.venue = "Changed room";
      if (caseName === "type") source.campaign.type = "REMINDER";
      if (caseName === "band") source.band.updatedAt = new Date("2026-09-05T14:00:00Z");
      if (caseName === "event-deleted") prismaMock.event.findUnique.mockResolvedValue(null);
      if (caseName === "cancelled") source.event.isCancelled = true;
      return GENERATED;
    });
    await expect(generateContent(input)).rejects.toThrow();
    expect(adapterMock.generateContent).toHaveBeenCalledTimes(1);
    expectNoWrite();
  });

  it("rechecks an unlinked band's state after generation too", async () => {
    adapterMock.generateContent.mockImplementation(async () => { source.band.isActive = false; return GENERATED; });
    await expect(generateContent({ bandId: BAND_ID, campaignType: "REHEARSAL", platform: "FACEBOOK", contentLength: "SHORT" })).rejects.toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
    expectNoWrite();
  });

  it("propagates a failed version write instead of returning a saved draft; real rollback is covered by PostgreSQL tests", async () => {
    prismaMock.draftVersion.create.mockRejectedValueOnce(new Error("Fixture version write failure"));
    await expect(generateContent(linkedInput())).rejects.toThrow("Fixture version write failure");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("refuses mismatched row identities from a broken reader", async () => {
    prismaMock.band.findUnique.mockResolvedValue({ ...source.band, id: OTHER_ID });
    await expect(loadGenerationContext({ bandId: BAND_ID, campaignId: CAMPAIGN_ID })).rejects.toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
    expectNoGeneration();
  });
});

function linkedInputWithoutBuilding(): GenerateContentInput {
  return { bandId: BAND_ID, campaignId: CAMPAIGN_ID, campaignType: "SHOW_ANNOUNCEMENT", platform: "FACEBOOK", contentLength: "MEDIUM" };
}
