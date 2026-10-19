import { PrismaClient, type Prisma } from "@prisma/client";
import establishedProfiles from "@/tests/fixtures/established-band-profiles.json";
import { scripts } from "@/package.json";

const mockPrisma = {
  user: { upsert: jest.fn().mockResolvedValue({ id: "fixture-operator" }) },
  band: {
    upsert: jest.fn(async (args: Prisma.BandUpsertArgs) => ({
      id: `fixture-${args.create.slug}`,
      ...args.create,
    })),
  },
  bandVoiceProfile: { upsert: jest.fn<Promise<unknown>, [Prisma.BandVoiceProfileUpsertArgs]>().mockResolvedValue({}) },
  knowledgeEntry: {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({}),
  },
  platformAccount: {
    upsert: jest.fn(async (args: Prisma.PlatformAccountUpsertArgs) => ({
      id: `fixture-account-${args.create.bandId}-${args.create.platform}`,
      ...args.create,
    })),
  },
  event: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(async (args: Prisma.EventCreateArgs) => ({ id: `fixture-event-${args.data.bandId}` })),
  },
  campaign: {
    create: jest.fn(async (args: Prisma.CampaignCreateArgs) => ({ id: `fixture-campaign-${args.data.bandId}` })),
  },
  draft: {
    create: jest.fn(async (args: Prisma.DraftCreateArgs) => ({ id: `fixture-draft-${args.data.bandId}`, ...args.data })),
  },
  draftVersion: { create: jest.fn().mockResolvedValue({}) },
  publishedPost: { create: jest.fn().mockResolvedValue({}) },
  analyticsSnapshot: { create: jest.fn().mockResolvedValue({}) },
  livestreamEvent: { create: jest.fn().mockResolvedValue({ id: "fixture-stream" }) },
  livestreamRunOfShowItem: { create: jest.fn().mockResolvedValue({}) },
  livestreamDestination: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  $disconnect: jest.fn(),
};

jest.mock("@prisma/client", () => ({ PrismaClient: jest.fn(() => mockPrisma) }));

describe("Fault Lines seed canon", () => {
  it("uses the composed approved-band seed for the documented command", () => {
    expect(scripts["db:seed"]).toBe("tsx prisma/seed-approved.ts");
  });

  it.each([false, true])("keeps standalone demo seeding limited to the established bands when demo rows exist: %s", async (existingDemo) => {
    jest.clearAllMocks();
    mockPrisma.event.findFirst.mockResolvedValue(existingDemo ? { id: "fixture-existing-event" } : null);
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { seedDemoData } = await import("../../prisma/seed");
      await seedDemoData(new PrismaClient());

      expect(mockPrisma.band.upsert.mock.calls.map(([args]) => args.create.slug)).toEqual([
        "stalemate", "rad-dad",
      ]);
      expect(mockPrisma.band.upsert.mock.calls.map(([args]) => args)).toEqual(establishedProfiles.bands);
      expect(mockPrisma.bandVoiceProfile.upsert.mock.calls.map(([args]) => args)).toEqual(establishedProfiles.profiles);
    } finally {
      log.mockRestore();
    }
  });

  it.each([false, true])("leaves canon blank and existing profiles untouched when demo rows exist: %s", async (existingDemo) => {
    jest.clearAllMocks();
    mockPrisma.event.findFirst.mockResolvedValue(existingDemo ? { id: "fixture-existing-event" } : null);
    const disconnected = new Promise<void>((resolve) => {
      mockPrisma.$disconnect.mockImplementationOnce(async () => resolve());
    });
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    // Fail within Jest instead of exiting the test process on a seed error.
    const exit = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);
    try {
      await jest.isolateModulesAsync(async () => { await import("../../prisma/seed-approved"); });
      await disconnected;

      expect(exit).not.toHaveBeenCalled();
      expect(mockPrisma.band.upsert.mock.calls.map(([args]) => args.create.slug)).toEqual([
        "stalemate", "rad-dad", "fault-lines",
      ]);
      // Pin the established bands to main's pre-PR data, rather than merely
      // checking their slugs while allowing their voice or canon to change.
      expect(mockPrisma.band.upsert.mock.calls.slice(0, 2).map(([args]) => args)).toEqual(establishedProfiles.bands);
      const band = mockPrisma.band.upsert.mock.calls[2][0];
      expect(band.where).toEqual({ slug: "fault-lines" });
      expect(band.create).toEqual({
        userId: "fixture-operator",
        name: "Fault Lines",
        slug: "fault-lines",
        description: expect.stringContaining("owner-controlled canon"),
        coverColor: "#0f766e",
      });
      expect(band.update).toEqual({});
      const profiles = mockPrisma.bandVoiceProfile.upsert.mock.calls.map(([args]) => args);
      expect(profiles).toHaveLength(3);
      expect(profiles.slice(0, 2)).toEqual(establishedProfiles.profiles);
      expect(profiles[2].where).toEqual({ bandId: "fixture-fault-lines" });
      expect(profiles[2].create.bandId).toBe("fixture-fault-lines");
      expect(profiles[2].create.toneDescription).toMatch(/canon-pending/i);
      for (const profile of profiles) expect(profile.update).toEqual({});

      const writes: jest.Mock[] = [mockPrisma.knowledgeEntry.create, mockPrisma.platformAccount.upsert,
        mockPrisma.event.create, mockPrisma.campaign.create, mockPrisma.draft.create,
        mockPrisma.publishedPost.create, mockPrisma.analyticsSnapshot.create, mockPrisma.livestreamEvent.create];
      for (const write of writes) {
        if (!existingDemo) expect(write).toHaveBeenCalled();
        for (const [args] of write.mock.calls) {
          expect((args.create ?? args.data).bandId).toMatch(/^fixture-(stalemate|rad-dad)$/);
        }
      }
      expect(mockPrisma.knowledgeEntry.count.mock.calls).toEqual([
        [{ where: { bandId: "fixture-stalemate" } }],
        [{ where: { bandId: "fixture-rad-dad" } }],
      ]);
      expect(mockPrisma.event.findFirst).toHaveBeenCalledWith({
        where: { bandId: { in: ["fixture-stalemate", "fixture-rad-dad"] } },
        select: { id: true },
      });
      if (existingDemo) {
        for (const write of [mockPrisma.event.create, mockPrisma.campaign.create,
          mockPrisma.draft.create, mockPrisma.draftVersion.create, mockPrisma.publishedPost.create,
          mockPrisma.analyticsSnapshot.create, mockPrisma.livestreamEvent.create,
          mockPrisma.livestreamRunOfShowItem.create, mockPrisma.livestreamDestination.createMany]) {
          expect(write).not.toHaveBeenCalled();
        }
      }
    } finally {
      log.mockRestore();
      exit.mockRestore();
    }
  });
});
