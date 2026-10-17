import type { Band, BandVoiceProfile, Campaign, Event } from "@prisma/client";

export const BAND_ID = "clhf5gt0000000test0band001";
export const CAMPAIGN_ID = "clhf5gt0000000test0camp001";
export const EVENT_ID = "clhf5gt0000000test0event01";
export const OTHER_ID = "clhf5gt0000000test0other01";
export const NOW = new Date("2026-09-05T13:00:00.000Z");

/** Synthetic-only records. No seed, owner data, provider, or runtime access. */
export function campaignFixture() {
  const band: Band & { voiceProfile: BandVoiceProfile | null } = {
    id: BAND_ID, userId: "clhf5gt0000000test0user001", name: "Stalemate", slug: "fixture-stalemate",
    description: null, genre: null, location: null, founded: null, coverColor: "#111111",
    isActive: true, voiceProfile: null, createdAt: NOW, updatedAt: NOW,
  };
  const event: Event = {
    id: EVENT_ID, bandId: BAND_ID, title: "Fixture listening night", venue: "Fixture Hall",
    city: "Fixture City", state: null, country: "US", eventDate: new Date("2026-09-20T00:00:00.000Z"),
    doorsTime: new Date("2026-09-19T23:00:00.000Z"), setTime: new Date("2026-09-20T01:00:00.000Z"),
    ticketUrl: "https://example.com/fixture-tickets", isHeadlining: true, supportActs: [],
    notes: "PRIVATE FIXTURE NOTE MUST NOT ENTER THE PROMPT", isCancelled: false,
    createdAt: NOW, updatedAt: NOW,
  };
  const campaign: Campaign = {
    id: CAMPAIGN_ID, bandId: BAND_ID, eventId: EVENT_ID, type: "SHOW_ANNOUNCEMENT",
    name: "Fixture campaign", description: "One room, a short set, all welcome.",
    targetDate: null, isActive: true, createdAt: NOW, updatedAt: NOW,
  };
  return { band, campaign, event };
}
