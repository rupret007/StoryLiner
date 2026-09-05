/**
 * Real PostgreSQL/Prisma proof. Run only via jest.postgres.config.ts.
 * Only the LLM is replaced; source reads, writes, isolation and rollback are real.
 */
import type { GeneratedContent, GenerateContentOptions } from "@/lib/services/llm/types";
import type { GenerateContentInput } from "@/lib/schemas/content";

jest.mock("@/lib/services/llm", () => ({
  getLlmAdapter: () => ({ name: "mock", generateContent: mockGenerate }),
}));

import { prisma } from "@/lib/prisma";
import { generateContent } from "@/lib/services/content/generate";
import { loadGenerationContext } from "@/lib/services/content/campaign-context-server";

const mockGenerate = jest.fn<Promise<GeneratedContent>, [GenerateContentOptions]>();
const ownedUsers = new Set<string>();
let databaseVerified = false;
let failureTriggerInstalled = false;

const generated: GeneratedContent = {
  caption: "A saved fixture show, with room for friends.",
  hashtags: ["#OfflineFixture"],
  fanReplies: [],
  brandFitScore: 95,
  confidenceNotes: "Synthetic offline response; no provider was contacted.",
  riskFlags: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  if (!databaseVerified) throw new Error("Fixture database identity was not verified.");
  const user = await prisma.user.create({ data: { name: "Offline PostgreSQL fixture" } });
  ownedUsers.add(user.id);
  const band = await prisma.band.create({ data: {
    userId: user.id,
    name: "Fixture Band",
    slug: `offline-postgres-${user.id}`,
  } });
  const event = await prisma.event.create({ data: {
    bandId: band.id,
    title: "Fixture room show",
    venue: "Fixture Hall",
    city: "Fixture City",
    eventDate: new Date("2026-10-20T01:00:00.000Z"),
    doorsTime: new Date("2026-10-20T00:00:00.000Z"),
    setTime: new Date("2026-10-20T01:30:00.000Z"),
    ticketUrl: "https://example.test/fixture-tickets",
    supportActs: [],
  } });
  const campaign = await prisma.campaign.create({ data: {
    bandId: band.id,
    eventId: event.id,
    type: "REMINDER",
    name: "Fixture campaign",
    description: "Use only the saved show facts.",
  } });
  const context = await loadGenerationContext({ bandId: band.id, campaignId: campaign.id });
  if (!context.linked) throw new Error("Linked fixture context is absent.");
  const input: GenerateContentInput = {
    bandId: band.id,
    campaignId: campaign.id,
    eventId: event.id,
    contextReceipt: context.linked.receipt,
    campaignType: "REMINDER",
    platform: "FACEBOOK",
    contentLength: "MEDIUM",
    toneVariant: "AUTHENTIC",
    context: { additionalContext: "Operator note from an offline fixture." },
  };
  return { user, band, event, campaign, context: context.linked, input };
}

async function recordCounts(bandId: string) {
  return {
    runs: await prisma.generationRun.count({ where: { bandId } }),
    drafts: await prisma.draft.count({ where: { bandId } }),
    versions: await prisma.draftVersion.count({ where: { draft: { bandId } } }),
    scheduled: await prisma.scheduledPost.count({ where: { bandId } }),
    published: await prisma.publishedPost.count({ where: { bandId } }),
  };
}

beforeAll(async () => {
  if (process.env.STORYLINER_POSTGRES_FIXTURE !== "1") {
    throw new Error("Explicit PostgreSQL fixture flag is required.");
  }
  const identities = await prisma.$queryRaw<Array<{
    database: string; username: string; address: string; port: number;
  }>>`SELECT current_database() AS database, current_user AS username,
      host(inet_server_addr()) AS address, inet_server_port() AS port`;
  expect(identities).toHaveLength(1);
  expect(identities[0]).toMatchObject({
    database: "storyliner_campaign_test", username: "storyliner_fixture",
  });
  if (process.env.STORYLINER_POSTGRES_FIXTURE_LAYOUT === "docker") {
    // Hosted service maps the strictly guarded client localhost:59319 endpoint
    // to its private container interface:5432, not to an operator database.
    expect(identities[0].port).toBe(5432);
    expect(identities[0].address).toMatch(/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/);
  } else {
    expect(identities[0]).toMatchObject({ address: "127.0.0.1", port: 59319 });
  }
  // Refuse a populated database; this suite never resets or seeds owner data.
  expect(await prisma.user.count()).toBe(0);
  expect(await prisma.band.count()).toBe(0);
  expect(await prisma.job.count()).toBe(0);
  databaseVerified = true;
});

beforeEach(() => {
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue({ ...generated });
});

afterEach(async () => {
  if (!databaseVerified) return;
  if (failureTriggerInstalled) {
    await prisma.$executeRawUnsafe('DROP TRIGGER "offline_fixture_fail_version" ON "DraftVersion"');
    await prisma.$executeRawUnsafe('DROP FUNCTION offline_fixture_fail_version()');
    failureTriggerInstalled = false;
  }
  for (const id of ownedUsers) {
    await prisma.user.delete({ where: { id } });
    ownedUsers.delete(id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("campaign generation with actual PostgreSQL transactions", () => {
  it("commits the exact campaign facts, guarded draft and version together, never a publish job", async () => {
    const f = await fixture();
    const draft = await generateContent(f.input);
    const saved = await prisma.draft.findUniqueOrThrow({
      where: { id: draft.id }, include: { campaign: true, versions: true, generationRun: true },
    });
    expect(saved.bandId).toBe(f.band.id);
    expect(saved.campaignId).toBe(f.campaign.id);
    expect(saved.campaign?.eventId).toBe(f.event.id);
    expect(saved.status).toBe("IN_REVIEW");
    expect(saved.currentVersion).toBe(1);
    expect(saved.versions).toHaveLength(1);
    expect(saved.versions[0]).toMatchObject({ version: 1, caption: generated.caption });
    expect(saved.generationRun?.inputContext).toMatchObject({
      campaignName: f.campaign.name,
      eventDetails: f.event.title,
      venue: f.event.venue,
      city: f.event.city,
      ticketUrl: f.event.ticketUrl,
      additionalContext: f.input.context?.additionalContext,
      source: { kind: "saved-campaign-event", bandId: f.band.id,
        campaignId: f.campaign.id, eventId: f.event.id, receipt: f.context.receipt },
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      contextSource: "saved-campaign-event",
      context: { ...f.context.facts, additionalContext: f.input.context?.additionalContext },
    });
    expect(await recordCounts(f.band.id)).toEqual({ runs: 1, drafts: 1, versions: 1, scheduled: 0, published: 0 });
    expect(await prisma.job.count()).toBe(0);
  });

  it("rejects an already stale receipt before the adapter and before any records", async () => {
    const f = await fixture();
    await prisma.event.update({ where: { id: f.event.id }, data: { venue: "A changed fixture room" } });
    await expect(generateContent(f.input)).rejects.toThrow(/changed|review/i);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(await recordCounts(f.band.id)).toEqual({ runs: 0, drafts: 0, versions: 0, scheduled: 0, published: 0 });
  });

  it("rejects an actual saved-event change while the adapter is pending, with zero partial records", async () => {
    const f = await fixture();
    const entered = deferred<void>();
    const release = deferred<GeneratedContent>();
    mockGenerate.mockImplementation(async () => {
      entered.resolve();
      return release.promise;
    });
    const result = generateContent(f.input).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    await entered.promise;
    await prisma.event.update({ where: { id: f.event.id }, data: { venue: "Changed during generation" } });
    release.resolve({ ...generated });
    const completion = await result;
    expect(completion.value).toBeNull();
    expect(completion.error).toBeInstanceOf(Error);
    expect((completion.error as Error).message).toMatch(/changed|review/i);
    expect(await recordCounts(f.band.id)).toEqual({ runs: 0, drafts: 0, versions: 0, scheduled: 0, published: 0 });
  });

  it("rolls back the real GenerationRun and Draft when the later version insert fails", async () => {
    const f = await fixture();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION offline_fixture_fail_version() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'offline fixture rejects version insert'; END;
    $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "offline_fixture_fail_version"
      BEFORE INSERT ON "DraftVersion" FOR EACH ROW EXECUTE FUNCTION offline_fixture_fail_version()`);
    failureTriggerInstalled = true;
    await expect(generateContent(f.input)).rejects.toThrow(/offline fixture rejects version insert/);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(await recordCounts(f.band.id)).toEqual({ runs: 0, drafts: 0, versions: 0, scheduled: 0, published: 0 });
  });

  it("refuses a real foreign-band campaign even when IDs and the receipt are syntactically valid", async () => {
    const a = await fixture();
    const b = await fixture();
    await expect(generateContent({ ...a.input, campaignId: b.campaign.id, eventId: b.event.id, contextReceipt: b.context.receipt }))
      .rejects.toThrow(/unavailable|active band|changed/i);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(await recordCounts(a.band.id)).toEqual({ runs: 0, drafts: 0, versions: 0, scheduled: 0, published: 0 });
    expect(await recordCounts(b.band.id)).toEqual({ runs: 0, drafts: 0, versions: 0, scheduled: 0, published: 0 });
  });
});
