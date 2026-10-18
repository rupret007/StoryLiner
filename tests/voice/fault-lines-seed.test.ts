import type { Prisma } from "@prisma/client";

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
      await jest.isolateModulesAsync(async () => { await import("../../prisma/seed"); });
      await disconnected;

      expect(exit).not.toHaveBeenCalled();
      expect(mockPrisma.band.upsert.mock.calls.map(([args]) => args.create.slug)).toEqual([
        "stalemate", "rad-dad", "fault-lines",
      ]);
      const band = mockPrisma.band.upsert.mock.calls[2][0];
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
    } finally {
      log.mockRestore();
      exit.mockRestore();
    }
  });
});
