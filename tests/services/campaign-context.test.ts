import { buildCampaignContextView, CAMPAIGN_CONTEXT_UNAVAILABLE, generationContextLines } from "@/lib/services/content/campaign-context";
import { generateContentSchema } from "@/lib/schemas/content";
import { campaignFixture, BAND_ID, CAMPAIGN_ID, EVENT_ID, OTHER_ID } from "@/tests/fixtures/campaign-context";

describe("saved campaign context projection", () => {
  it("projects only bounded public saved facts with explicit Central display and raw instants in the receipt", () => {
    const source = campaignFixture();
    const view = buildCampaignContextView(source);
    expect(view).toMatchObject({ bandId: BAND_ID, campaignId: CAMPAIGN_ID, eventId: EVENT_ID, campaignType: "SHOW_ANNOUNCEMENT" });
    expect(view.facts).toMatchObject({ venue: source.event.venue, city: source.event.city, eventDetails: source.event.title });
    expect(view.facts.showDate).toContain("Saturday, September 19, 2026");
    expect(view.facts.showDate).toContain("7:00 PM CDT (America/Chicago)");
    expect(view.receipt).toContain("2026-09-20T00:00:00.000Z");
    expect(JSON.stringify(view)).not.toContain("PRIVATE FIXTURE");
    expect(generationContextLines(view.facts).join("\n")).toContain("Set time:");
  });

  it("uses explicit DST boundaries rather than machine-local dates", () => {
    const source = campaignFixture();
    source.event.eventDate = new Date("2026-11-01T06:30:00.000Z");
    source.event.doorsTime = new Date("2026-11-01T07:30:00.000Z");
    const view = buildCampaignContextView(source);
    expect(view.facts.showDate).toContain("1:30 AM CDT");
    expect(view.facts.doorsTime).toContain("1:30 AM CST");
  });

  it("never manufactures missing event times, venues, or ticket links", () => {
    const source = campaignFixture();
    source.event.doorsTime = null;
    source.event.setTime = null;
    source.event.venue = null;
    source.event.ticketUrl = null;
    const view = buildCampaignContextView(source);
    expect(view.facts).not.toHaveProperty("doorsTime");
    expect(view.facts).not.toHaveProperty("setTime");
    expect(view.facts).not.toHaveProperty("venue");
    expect(view.missingFacts).toContain("Doors time not saved");
    expect(view.missingFacts).toContain("Ticket link not saved");
  });

  it("supports event-only and non-event campaign context without borrowing an event", () => {
    const source = campaignFixture();
    expect(buildCampaignContextView({ ...source, campaign: null }).campaignType).toBeNull();
    source.campaign.eventId = null;
    const view = buildCampaignContextView({ ...source, event: null });
    expect(view.eventId).toBeNull();
    expect(view.facts.showDate).toBeUndefined();
    expect(view.missingFacts).toEqual(["No event linked — event dates, venue, and times are not supplied"]);
  });

  it("carries an eventless campaign target date without turning it into a show date", () => {
    const source = campaignFixture();
    source.campaign.eventId = null;
    source.campaign.type = "RELEASE_DAY";
    source.campaign.targetDate = new Date("2026-09-20T00:00:00.000Z");
    const view = buildCampaignContextView({ ...source, event: null });
    expect(view.facts.campaignTargetDate).toContain("Saturday, September 19, 2026");
    expect(view.facts.campaignTargetDate).toContain("7:00 PM CDT (America/Chicago)");
    expect(view.facts).not.toHaveProperty("showDate");
    expect(generationContextLines(view.facts)).toContain(`Campaign target date: ${view.facts.campaignTargetDate}`);
    expect(view.receipt).toContain("2026-09-20T00:00:00.000Z");
  });

  it.each([
    "inactive-band", "inactive-campaign", "cancelled-event", "foreign-campaign", "foreign-event", "different-event", "no-event", "no-link",
  ])("rejects %s rather than showing usable context", (caseName) => {
    const source = campaignFixture();
    if (caseName === "inactive-band") source.band.isActive = false;
    if (caseName === "inactive-campaign") source.campaign.isActive = false;
    if (caseName === "cancelled-event") source.event.isCancelled = true;
    if (caseName === "foreign-campaign") source.campaign.bandId = OTHER_ID;
    if (caseName === "foreign-event") source.event.bandId = OTHER_ID;
    if (caseName === "different-event") source.campaign.eventId = OTHER_ID;
    const input = { ...source, event: caseName === "no-event" || caseName === "no-link" ? null : source.event,
      campaign: caseName === "no-link" ? null : source.campaign };
    expect(() => buildCampaignContextView(input)).toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
  });

  it("changes the receipt for the exact public facts, campaign type, voice version, and source timestamps", () => {
    const source = campaignFixture();
    const original = buildCampaignContextView(source).receipt;
    for (const patch of [{ venue: "New venue" }, { eventDate: new Date("2026-09-21T01:00:00Z") },
      { updatedAt: new Date("2026-09-05T14:00:00Z") }, { ticketUrl: "https://example.com/new" }]) {
      expect(buildCampaignContextView({ ...source, event: { ...source.event, ...patch } }).receipt).not.toBe(original);
    }
    expect(buildCampaignContextView({ ...source, campaign: { ...source.campaign, type: "REMINDER" } }).receipt).not.toBe(original);
    expect(buildCampaignContextView({ ...source, band: { ...source.band, voiceProfile: { updatedAt: new Date("2026-09-05T14:00:00Z") } } }).receipt).not.toBe(original);
  });

  it.each(["javascript:alert(1)", "http://example.com/tickets", "https://user:password@example.com/", "https://example.com/\nprivate"])("rejects unsafe saved ticket URL %s", (ticketUrl) => {
    const source = campaignFixture();
    source.event.ticketUrl = ticketUrl;
    expect(() => buildCampaignContextView(source)).toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
  });

  it("rejects oversized or malformed stored facts instead of truncating the reviewed receipt", () => {
    const source = campaignFixture();
    source.campaign.description = "x".repeat(2001);
    expect(() => buildCampaignContextView(source)).toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
    source.campaign.description = "fine";
    source.event.eventDate = new Date("invalid");
    expect(() => buildCampaignContextView(source)).toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
    source.event.eventDate = new Date("2026-09-20T00:00:00Z");
    expect(() => buildCampaignContextView({ ...source, band: { ...source.band, updatedAt: "2026-09-05T13:00:00Z\n" } })).toThrow(CAMPAIGN_CONTEXT_UNAVAILABLE);
  });
});

describe("generation input source boundaries", () => {
  const base = { bandId: BAND_ID, campaignType: "SHOW_ANNOUNCEMENT", platform: "FACEBOOK" };
  it("requires a receipt for each linked entry and refuses receipt reuse after unlinking", () => {
    expect(generateContentSchema.safeParse(base).success).toBe(true);
    expect(generateContentSchema.safeParse({ ...base, campaignId: CAMPAIGN_ID }).success).toBe(false);
    expect(generateContentSchema.safeParse({ ...base, eventId: EVENT_ID }).success).toBe(false);
    expect(generateContentSchema.safeParse({ ...base, contextReceipt: "old-link" }).success).toBe(false);
    expect(generateContentSchema.safeParse({ ...base, campaignId: CAMPAIGN_ID, contextReceipt: "receipt", context: { additionalContext: "Operator note" } }).success).toBe(true);
  });
  it.each(["venue", "city", "showDate", "ticketUrl", "eventDetails"])("does not accept a linked caller override of %s", (field) => {
    expect(generateContentSchema.safeParse({ ...base, campaignId: CAMPAIGN_ID, contextReceipt: "receipt", context: { [field]: "" } }).success).toBe(false);
  });
});
