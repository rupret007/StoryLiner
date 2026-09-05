import { renderToStaticMarkup } from "react-dom/server";
import CampaignBuilderPage from "@/app/(app)/campaign-builder/page";
import { prisma } from "@/lib/prisma";
import { campaignStudioHref, standaloneStudioHref } from "@/lib/services/content/campaign-navigation";

jest.mock("@/lib/prisma", () => ({ prisma: {
  band: { findMany: jest.fn() }, campaign: { findMany: jest.fn() },
} }));

const BAND_ID = "clhf5gt0000000test0band0001";
const CAMPAIGN_ID = "clhf5gt0000000test0campaign";
const EVENT_ID = "clhf5gt0000000test0event001";
const updatedAt = new Date("2026-09-05T18:00:00.000Z");
const band = { id: BAND_ID, name: "Fixture band", isActive: true, updatedAt, coverColor: "#123456" };
const event = {
  id: EVENT_ID, bandId: BAND_ID, title: "Fixture saved show", venue: "Fixture hall",
  city: "Fixture city", eventDate: new Date("2026-09-20T01:00:00.000Z"),
  doorsTime: null, setTime: null, ticketUrl: null, isCancelled: false, updatedAt,
};
const campaign = {
  id: CAMPAIGN_ID, bandId: BAND_ID, eventId: EVENT_ID, type: "REMINDER",
  name: "Fixture reminder campaign", description: "Saved fixture description",
  targetDate: null, isActive: true, updatedAt, band, event, _count: { drafts: 3 },
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.band.findMany as jest.Mock).mockResolvedValue([band]);
  (prisma.campaign.findMany as jest.Mock).mockResolvedValue([campaign]);
});

async function render(bandId?: string | string[]) {
  return renderToStaticMarkup(await CampaignBuilderPage({ searchParams: Promise.resolve({ bandId }) }));
}

test("the actual campaign page links the exact saved campaign and shows a labelled Central date", async () => {
  const html = await render(BAND_ID);
  expect(html).toContain(`href="/content-studio?bandId=${BAND_ID}&amp;campaignId=${CAMPAIGN_ID}"`);
  expect(html).toContain("Generate content");
  expect(html).toContain("Fixture saved show");
  expect(html).toContain("Sep 19, 2026 (America/Chicago)");
  expect(html).toContain("Reminder");
  expect(html).toContain("3 drafts");
  expect(html).toContain("nothing publishes here");
  expect(prisma.campaign.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { bandId: BAND_ID } }));
});

test.each(["unknown-band", "", [BAND_ID, "another-band"]])("invalid explicit band %p never falls back or reads all campaigns", async (badBand) => {
  const html = await render(badBand);
  expect(html).toContain("Band unavailable");
  expect(html).toContain('href="/campaign-builder"');
  expect(html).not.toContain("Fixture reminder campaign");
  expect(prisma.campaign.findMany).not.toHaveBeenCalled();
});

test.each([
  { ...campaign, isActive: false },
  { ...campaign, band: { ...band, isActive: false } },
  { ...campaign, event: { ...event, isCancelled: true } },
  { ...campaign, event: { ...event, bandId: "foreign-band", title: "Foreign event must not render" } },
  { ...campaign, event: null },
])("unusable campaign/event is visible as unavailable, without a misleading generation path", async (row) => {
  (prisma.campaign.findMany as jest.Mock).mockResolvedValue([row]);
  const html = await render();
  expect(html).toContain("Unavailable for generation");
  expect(html).not.toContain("Generate content");
  expect(html).not.toContain("Fixture saved show");
  expect(html).not.toContain("Foreign event must not render");
});

test("an eventless active campaign still links as its own campaign, without borrowing a show", async () => {
  (prisma.campaign.findMany as jest.Mock).mockResolvedValue([{ ...campaign, eventId: null, event: null }]);
  const html = await render();
  expect(html).toContain("Generate content");
  expect(html).not.toContain("Fixture saved show");
  expect(html).not.toContain("Unavailable for generation");
});

test("empty campaigns offer an existing standalone-draft path, never an inert creation button", async () => {
  (prisma.campaign.findMany as jest.Mock).mockResolvedValue([]);
  const html = await render(BAND_ID);
  expect(html).toContain("No campaigns yet");
  expect(html).toContain(`href="/content-studio?bandId=${BAND_ID}"`);
  expect(html).toContain("Create a standalone draft");
  expect(html).not.toContain("New Campaign");
});

test("navigation encodes identifiers and never accepts a new origin or fact query through an ID", () => {
  const link = new URL(campaignStudioHref("band&venue=unreviewed", "campaign#fragment"), "https://fixture.invalid");
  expect(link.origin).toBe("https://fixture.invalid");
  expect(link.searchParams.get("bandId")).toBe("band&venue=unreviewed");
  expect(link.searchParams.get("campaignId")).toBe("campaign#fragment");
  expect(link.searchParams.has("venue")).toBe(false);
  expect(link.hash).toBe("");
  expect(standaloneStudioHref()).toBe("/content-studio");
});
