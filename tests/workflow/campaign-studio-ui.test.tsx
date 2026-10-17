/** @jest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockFindBands = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/prisma", () => ({ prisma: { band: { findMany: (...args: unknown[]) => mockFindBands(...args) } } }));
jest.mock("@/lib/services/content/campaign-context-server", () => ({ loadGenerationContext: jest.fn() }));
jest.mock("@/app/(app)/content-studio/actions", () => ({ generateStudioDraftAction: jest.fn() }));

import { ContentStudioClient } from "@/app/(app)/content-studio/client";
import ContentStudioPage from "@/app/(app)/content-studio/page";
import { generateStudioDraftAction } from "@/app/(app)/content-studio/actions";
import { loadGenerationContext } from "@/lib/services/content/campaign-context-server";
import { CAMPAIGN_CONTEXT_CHANGED, CAMPAIGN_CONTEXT_OFFLINE_ONLY, CAMPAIGN_CONTEXT_UNAVAILABLE, type CampaignContextView } from "@/lib/services/content/campaign-context";
import { toast } from "sonner";

type Props = ComponentProps<typeof ContentStudioClient>;
type Band = Props["bands"][number];
type SavedDraft = Extract<Awaited<ReturnType<typeof generateStudioDraftAction>>, { status: "saved" }>;
type PersistedDraft = SavedDraft["draft"];
const BAND_A = "clhf5gt0000000test0bandid1";
const BAND_B = "clhf5gt0000000test0bandid2";
const CAMPAIGN_A = "clhf5gt0000000test0campid1";
const EVENT_A = "clhf5gt0000000test0event01";
const DRAFT_A = "clhf5gt0000000test0draft01";
const DATE = new Date("2026-09-05T12:00:00.000Z");
const generate = jest.mocked(generateStudioDraftAction);
const loadContext = jest.mocked(loadGenerationContext);

function band(id: string, name: string): Band {
  return {
    id, name, slug: name.toLowerCase().replaceAll(" ", "-"), userId: "fixture-operator",
    description: null, genre: null, location: null, founded: null, coverColor: "#557799",
    isActive: true, createdAt: DATE, updatedAt: DATE, voiceProfile: null, platformAccounts: [],
  };
}
const bands = [band(BAND_A, "Rad Dad"), band(BAND_B, "Stalemate")];
function linked(overrides: Partial<CampaignContextView> = {}): CampaignContextView {
  return {
    bandId: BAND_A, bandName: "Rad Dad", campaignId: CAMPAIGN_A, eventId: EVENT_A,
    campaignType: "REMINDER", campaignName: "September fixture reminder",
    campaignDescription: "One recorded fixture campaign.", eventTitle: "Fixture show night",
    receipt: "fixture-reviewed-context-v1",
    facts: { campaignName: "September fixture reminder", eventDetails: "Fixture show night", venue: "Fixture venue", city: "Fixture city", showDate: "Saturday, September 19, 2026 at 7:00 PM CDT (America/Chicago)", ticketUrl: "https://example.test/fixture-tickets" },
    missingFacts: ["Doors time not saved", "Set time not saved"],
    ...overrides,
  };
}
function draft(overrides: Partial<PersistedDraft> = {}): SavedDraft {
  return { status: "saved", draft: {
    id: DRAFT_A, bandId: BAND_A, campaignId: CAMPAIGN_A, generationRunId: "fixture-run",
    platform: "INSTAGRAM", status: "IN_REVIEW", toneVariant: "AUTHENTIC", contentLength: "MEDIUM",
    caption: "Fixture caption for Rad Dad.", hashtags: ["#fixture"], mediaUrls: [],
    ctaText: null, altText: null, imagePrompt: null, fanReplies: [], brandFitScore: 80,
    confidenceNotes: null, riskLevel: "LOW", riskFlags: [], reviewedAt: null, reviewNotes: null,
    rejectedAt: null, rejectedReason: null, currentVersion: 1, createdAt: DATE, updatedAt: DATE,
    ...overrides,
  } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch;
let confirm: jest.SpyInstance;
beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalFetch = globalThis.fetch;
});
beforeEach(() => {
  jest.clearAllMocks(); generate.mockReset(); loadContext.mockReset(); mockRefresh.mockReset();
  globalThis.fetch = jest.fn().mockRejectedValue(new Error("No network allowed in fixture UI tests"));
  confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  mockFindBands.mockResolvedValue(bands);
  loadContext.mockResolvedValue({ band: bands[0], linked: linked() });
  generate.mockResolvedValue(draft());
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); confirm.mockRestore(); jest.useRealTimers();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
async function render(overrides: Partial<Props> = {}) {
  await act(async () => root.render(<ContentStudioClient bands={bands} selectedBandId={BAND_A} linkedContext={linked()} contextIdentity="linked-a" {...overrides} />));
}
function button(label: string): HTMLButtonElement {
  const node = [...container.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label);
  if (!node) throw new Error(`Missing button ${label}: ${container.textContent}`);
  return node;
}
async function click(label: string) { await act(async () => button(label).click()); }
function field(id: string) {
  const node = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#studio-${id}`);
  if (!node) throw new Error(`Missing field ${id}`);
  return node;
}
async function type(id: string, value: string) {
  const input = field(id);
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(field(id).value).toBe(value);
}

describe("campaign-linked generation through actual Content Studio", () => {
  function warnsBeforeLeaving() {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it.each([
    ["venue", "Fixture venue"], ["city", "Fixture city"], ["date", "2026-10-31"],
    ["ticket", "https://example.test/tickets"], ["notes", "Keep my instructions"],
    ["media", "https://example.test/photo.jpg"],
  ])("warns for typed %s and releases after clearing it without generating", async (id, value) => {
    await render({ linkedContext: null, contextIdentity: "unlinked-a" });
    expect(warnsBeforeLeaving()).toBe(false);
    await type(id, value);
    expect(warnsBeforeLeaving()).toBe(true);
    expect(field(id).value).toBe(value);
    await type(id, "");
    expect(warnsBeforeLeaving()).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it("warns during generation with empty input and releases after a confirmed result", async () => {
    const request = deferred<SavedDraft>(); generate.mockReturnValue(request.promise);
    await render();
    expect(warnsBeforeLeaving()).toBe(false);
    await click("Generate Draft");
    expect(warnsBeforeLeaving()).toBe(true);
    await act(async () => request.resolve(draft()));
    expect(warnsBeforeLeaving()).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps an unconfirmed generation warning until the explicit queue check, without retrying", async () => {
    generate.mockRejectedValueOnce(new Error("Fixture unavailable"));
    await render(); await click("Generate Draft");
    expect(warnsBeforeLeaving()).toBe(true);
    await click("I checked the review queue");
    expect(warnsBeforeLeaving()).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("removes the leave listener when the Studio unmounts", async () => {
    await render(); await type("notes", "Session-only input");
    expect(warnsBeforeLeaving()).toBe(true);
    await act(async () => root.render(<div>Another page</div>));
    expect(warnsBeforeLeaving()).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it("loads the exact campaign link and sends its receipt/type, not editable copies of saved facts", async () => {
    const page = await ContentStudioPage({ searchParams: Promise.resolve({ bandId: BAND_A, campaignId: CAMPAIGN_A }) });
    await act(async () => root.render(page));
    expect(loadContext).toHaveBeenCalledWith({ bandId: BAND_A, campaignId: CAMPAIGN_A });
    expect(container.textContent).toContain("Fixture venue");
    expect(container.textContent).toContain("Doors time not saved");
    expect(container.textContent).toContain("America/Chicago");
    expect(container.textContent).toContain("live AI context sharing needs owner approval");
    expect(container.querySelector("#studio-venue")).toBeNull();
    expect(button("Campaign Type").disabled).toBe(true);
    await type("notes", "Use a short fixture invitation.");
    await click("Generate Draft");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toMatchObject({
      bandId: BAND_A, campaignId: CAMPAIGN_A, eventId: EVENT_A, contextReceipt: linked().receipt,
      campaignType: "REMINDER", context: { additionalContext: "Use a short fixture invitation." },
    });
    expect(Object.keys(generate.mock.calls[0][0].context!)).toEqual(["additionalContext"]);
    expect(container.querySelector('[data-testid="generated-origin"]')?.textContent).toContain("Rad Dad · Instagram · Reminder");
    expect(container.querySelector('[data-testid="generated-origin"]')?.textContent).toContain("September fixture reminder");
    expect(container.querySelector('a[href*="focus="]')?.getAttribute("href")).toContain(DRAFT_A);
    expect(container.textContent).toContain("Guarded snapshot is ready.");
  });

  it.each([
    { bandId: "not-a-band", campaignId: CAMPAIGN_A },
    { campaignId: CAMPAIGN_A },
    { bandId: [BAND_A, BAND_B], campaignId: CAMPAIGN_A },
    { bandId: BAND_A, campaignId: "" },
  ])("blocks malformed or missing explicit band context without choosing the first band: %j", async (query) => {
    const page = await ContentStudioPage({ searchParams: Promise.resolve(query) });
    await act(async () => root.render(page));
    expect(loadContext).not.toHaveBeenCalled();
    expect(button("Generate Draft").matches(":disabled")).toBe(true);
    expect(container.textContent).toContain("Campaign context unavailable");
    await click("Start unlinked for Stalemate");
    expect(mockPush).toHaveBeenCalledWith(`/content-studio?bandId=${BAND_B}`);
    expect(generate).not.toHaveBeenCalled();
  });

  it("makes unavailable, inactive, or cancelled linked context an explicit recovery hold", async () => {
    loadContext.mockRejectedValue(new Error("Synthetic internal details must not reach the UI"));
    const page = await ContentStudioPage({ searchParams: Promise.resolve({ bandId: BAND_A, campaignId: CAMPAIGN_A }) });
    await act(async () => root.render(page));
    expect(container.textContent).toContain(CAMPAIGN_CONTEXT_UNAVAILABLE);
    expect(container.textContent).not.toContain("Synthetic internal details");
    await click("Generate Draft");
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses a mismatched linked band even if inconsistent props reach the client", async () => {
    await render({ selectedBandId: BAND_B });
    expect(container.textContent).toContain("Campaign context unavailable");
    expect(container.querySelector('[data-testid="campaign-context-preview"]')).toBeNull();
    await click("Generate Draft"); expect(generate).not.toHaveBeenCalled();
  });

  it("confirms explicit unlink and clears operator text, media, and the displayed result", async () => {
    await render(); await type("notes", "Keep this until I agree."); await type("media", "https://example.test/my-photo.jpg");
    await click("Generate Draft");
    confirm.mockReturnValueOnce(false);
    await click("Start unlinked draft");
    expect(mockPush).not.toHaveBeenCalled(); expect(field("notes").value).toBe("Keep this until I agree.");
    expect(container.querySelector('[data-testid="generated-snapshot"]')).not.toBeNull();
    await click("Start unlinked draft");
    expect(mockPush).toHaveBeenCalledWith(`/content-studio?bandId=${BAND_A}`);
    expect(field("notes").value).toBe(""); expect(field("media").value).toBe("");
    expect(container.querySelector('[data-testid="generated-snapshot"]')).toBeNull();
    await render({ linkedContext: null, contextIdentity: "unlinked-a" });
    expect(field("venue").value).toBe("");
  });

  it("isolates same-mounted URL changes and ignores completion from the old campaign", async () => {
    const request = deferred<SavedDraft>(); generate.mockReturnValue(request.promise);
    await render(); await type("notes", "Rad Dad fixture only."); await click("Generate Draft");
    await render({ selectedBandId: BAND_B, linkedContext: null, contextIdentity: "unlinked-b" });
    expect(field("notes").value).toBe(""); expect(field("media").value).toBe("");
    await act(async () => request.resolve(draft()));
    expect(container.querySelector('[data-testid="generated-snapshot"]')).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("guards synchronous double clicks and freezes the entire generation configuration", async () => {
    const request = deferred<SavedDraft>(); generate.mockReturnValue(request.promise);
    await render();
    await act(async () => { button("Generate Draft").click(); button("Generate Draft").click(); });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(button("Select band Stalemate").matches(":disabled")).toBe(true);
    expect(button("Platform Facebook").matches(":disabled")).toBe(true);
    expect(field("notes").matches(":disabled")).toBe(true);
    await act(async () => request.resolve(draft()));
    expect(button("Select band Stalemate").matches(":disabled")).toBe(false);
    expect(container.querySelector('[data-testid="generated-origin"]')?.textContent).toContain("Rad Dad");
  });

  it.each([
    { bandId: BAND_B }, { campaignId: null }, { platform: "FACEBOOK" },
    { status: "APPROVED" }, { hashtags: null }, { id: "not-an-id" },
  ])("never labels a wrong or malformed result successful: %j", async (difference) => {
    generate.mockResolvedValue(draft(difference as Partial<PersistedDraft>));
    await render(); await click("Generate Draft");
    expect(container.querySelector('[data-testid="generated-snapshot"]')).toBeNull();
    expect(container.textContent).toContain("Generation is not confirmed");
    expect(button("Generate Draft").disabled).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps a failed attempt's input and requires an explicit queue check before another attempt", async () => {
    generate.mockRejectedValueOnce(new Error("Private transport diagnostic"));
    await render(); await type("notes", "Do not lose this fixture note."); await click("Generate Draft");
    expect(field("notes").value).toBe("Do not lose this fixture note.");
    expect(container.textContent).not.toContain("Private transport diagnostic");
    await click("Generate Draft"); expect(generate).toHaveBeenCalledTimes(1);
    await click("I checked the review queue"); expect(generate).toHaveBeenCalledTimes(1);
    expect(button("Generate Draft").disabled).toBe(false);
    await click("Generate Draft"); expect(generate).toHaveBeenCalledTimes(2);
  });

  it("times out honestly and ignores a late successful generation response", async () => {
    jest.useFakeTimers(); const request = deferred<SavedDraft>(); generate.mockReturnValue(request.promise);
    await render(); await type("notes", "Retain timeout note."); await click("Generate Draft");
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(container.textContent).toContain("Generation is not confirmed");
    expect(field("notes").value).toBe("Retain timeout note.");
    await act(async () => request.resolve(draft()));
    expect(container.querySelector('[data-testid="generated-snapshot"]')).toBeNull();
    expect(toast.success).not.toHaveBeenCalled(); expect(generate).toHaveBeenCalledTimes(1);
  });

  it("blocks stale saved facts and reloads deliberately instead of borrowing a newer receipt", async () => {
    generate.mockResolvedValueOnce({ status: "blocked", code: "context_changed" });
    await render(); await type("notes", "Old context note."); await click("Generate Draft");
    expect(container.textContent).toContain(CAMPAIGN_CONTEXT_CHANGED);
    await click("Generate Draft"); expect(generate).toHaveBeenCalledTimes(1);
    mockRefresh.mockImplementationOnce(() => root.render(<ContentStudioClient bands={bands} selectedBandId={BAND_A} linkedContext={linked({ receipt: "fixture-reviewed-context-v2", facts: { venue: "Changed recorded venue" } })} contextIdentity="linked-a" />));
    await click("Reload campaign facts"); expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(field("notes").value).toBe("");
    expect(container.textContent).toContain("Changed recorded venue");
    expect(button("Generate Draft").matches(":disabled")).toBe(false);
  });

  it("does not carry reload approval into a later unrelated fact refresh after an unchanged response", async () => {
    const original = linked();
    generate.mockResolvedValueOnce({ status: "blocked", code: "context_changed" });
    await render({ linkedContext: original }); await click("Generate Draft");
    // This refresh has no changed prop objects or values, like an unchanged
    // server payload. Its completed transition must retire reload approval.
    await click("Reload campaign facts");
    await type("notes", "Keep work typed after that completed refresh.");
    await render({ linkedContext: linked({ receipt: "unrelated-later-receipt", facts: { venue: "Later saved venue" } }) });
    expect(field("notes").value).toBe("Keep work typed after that completed refresh.");
    expect(container.textContent).toContain("Your input and previous result are kept");
    expect(button("Generate Draft").matches(":disabled")).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("confirms losing a displayed result even when no context or media was typed", async () => {
    await render(); await click("Generate Draft");
    confirm.mockReturnValueOnce(false);
    await click("Start unlinked draft");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="generated-snapshot"]')).not.toBeNull();
  });

  it("keeps ordinary unlinked Studio usable with explicitly entered manual context", async () => {
    generate.mockResolvedValue(draft({ campaignId: null }));
    await render({ linkedContext: null, contextIdentity: "manual-a" });
    await type("venue", "Manual fixture venue"); await type("city", "Manual fixture city");
    await type("date", "2026-09-19"); await type("ticket", "https://example.test/manual");
    await click("Generate Draft");
    expect(generate.mock.calls[0][0]).toMatchObject({ bandId: BAND_A, campaignType: "SHOW_ANNOUNCEMENT", context: { venue: "Manual fixture venue", city: "Manual fixture city", showDate: "2026-09-19", ticketUrl: "https://example.test/manual" } });
    expect(generate.mock.calls[0][0]).not.toHaveProperty("campaignId");
    expect(generate.mock.calls[0][0]).not.toHaveProperty("contextReceipt");
    expect(container.textContent).toContain("Unlinked draft");
  });

  it("never transfers manual work when a no-query refresh chooses a different first active band", async () => {
    await render({ linkedContext: null, contextIdentity: "[null,null,null]" });
    await type("venue", "Only Rad Dad's fixture venue"); await type("notes", "Only Rad Dad's note");
    await type("media", "https://example.test/rad-dad-only.jpg");
    await render({ bands: [bands[1]], selectedBandId: BAND_B, linkedContext: null, contextIdentity: "[null,null,null]" });
    expect(field("venue").value).toBe("Only Rad Dad's fixture venue");
    expect(field("notes").value).toBe("Only Rad Dad's note");
    expect(field("media").value).toBe("https://example.test/rad-dad-only.jpg");
    expect(container.textContent).toContain("work will not move to another band automatically");
    await click("Generate Draft"); expect(generate).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(false); await click("Start unlinked for Stalemate");
    expect(mockPush).not.toHaveBeenCalled();
    await click("Start unlinked for Stalemate");
    expect(mockPush).toHaveBeenCalledWith(`/content-studio?bandId=${BAND_B}`);
    expect(field("notes").value).toBe("");
  });

  it("retains input and the previous result across unsolicited same-URL fact refresh, until explicit review", async () => {
    await render(); await type("notes", "Retain same-campaign note."); await type("media", "https://example.test/retained.jpg");
    await click("Generate Draft");
    const newer = linked({ receipt: "fixture-receipt-newer", campaignType: "RECAP", facts: { venue: "A newly saved venue" } });
    await render({ linkedContext: newer });
    expect(field("notes").value).toBe("Retain same-campaign note.");
    expect(field("media").value).toBe("https://example.test/retained.jpg");
    expect(container.querySelector('[data-testid="generated-origin"]')?.textContent).toContain("Reminder");
    expect(container.textContent).toContain("Your input and previous result are kept");
    expect(button("Generate Draft").matches(":disabled")).toBe(true);
    confirm.mockReturnValueOnce(false);
    await click("Reload campaign facts");
    expect(field("notes").value).toBe("Retain same-campaign note.");
    expect(mockRefresh).not.toHaveBeenCalled();
    await click("Reload campaign facts");
    expect(field("notes").value).toBe(""); expect(field("media").value).toBe("");
    expect(container.querySelector('[data-testid="generated-snapshot"]')).toBeNull();
    expect(container.textContent).toContain("A newly saved venue");
    await click("Generate Draft");
    expect(generate.mock.calls[1][0]).toMatchObject({ campaignType: "RECAP", contextReceipt: newer.receipt });
  });

  it("keeps same-URL work if a background context read fails rather than unmounting the editor", async () => {
    await render(); await type("notes", "Retain through server read failure.");
    await render({ linkedContext: null, contextError: CAMPAIGN_CONTEXT_UNAVAILABLE });
    expect(field("notes").value).toBe("Retain through server read failure.");
    expect(button("Generate Draft").matches(":disabled")).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([{ remainingBands: [bands[1]] }, { remainingBands: [] }])("retains same-URL work when the selected band disappears from active bands: %j", async ({ remainingBands }) => {
    await render(); await type("notes", "Retain after the band was deactivated.");
    await type("media", "https://example.test/retained-band.jpg"); await click("Generate Draft");
    await render({ bands: remainingBands, selectedBandId: undefined, linkedContext: null, contextError: CAMPAIGN_CONTEXT_UNAVAILABLE });
    expect(field("notes").value).toBe("Retain after the band was deactivated.");
    expect(field("media").value).toBe("https://example.test/retained-band.jpg");
    expect(container.querySelector('[data-testid="generated-origin"]')?.textContent).toContain("Rad Dad");
    expect(button("Generate Draft").matches(":disabled")).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("shows the pre-provider privacy hold without claiming an uncertain send or suggesting settings changes", async () => {
    generate.mockResolvedValue({ status: "blocked", code: "offline_only" });
    await render(); await type("notes", "Retain private-context fixture note."); await click("Generate Draft");
    expect(container.textContent).toContain(CAMPAIGN_CONTEXT_OFFLINE_ONLY);
    expect(container.textContent).toContain("No provider settings have been changed");
    expect(container.textContent).not.toContain("Generation is not confirmed");
    expect(container.querySelector('[data-testid="generated-snapshot"]')).toBeNull();
    expect(button("Generate Draft").matches(":disabled")).toBe(true);
    expect(field("notes").value).toBe("Retain private-context fixture note.");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("labels an eventless campaign target date separately and never invents event facts", async () => {
    await render({ linkedContext: linked({ eventId: null, eventTitle: null, campaignType: "RELEASE_DAY", facts: { campaignTargetDate: "Friday, October 2, 2026 at 7:00 PM CDT (America/Chicago)" }, missingFacts: ["No event linked — event dates, venue, and times are not supplied"] }) });
    expect(container.textContent).toContain("Campaign target date");
    expect(container.textContent).toContain("Friday, October 2, 2026");
    expect(container.textContent).toContain("No event linked");
    await click("Generate Draft");
    expect(generate.mock.calls[0][0]).not.toHaveProperty("eventId");
    expect(generate.mock.calls[0][0].context).not.toHaveProperty("showDate");
    expect(generate.mock.calls[0][0].context).not.toHaveProperty("campaignTargetDate");
  });

  it("keeps invalid fields editable after a typed pre-generation refusal without suggesting a duplicate-risk queue check", async () => {
    generate.mockResolvedValueOnce({ status: "blocked", code: "invalid_input" });
    await render(); await type("notes", "Keep this editable."); await click("Generate Draft");
    expect(container.textContent).toContain("Generation did not start");
    expect(container.textContent).not.toContain("I checked the review queue");
    expect(field("notes").matches(":disabled")).toBe(false);
    expect(button("Generate Draft").matches(":disabled")).toBe(false);
    await type("notes", "Corrected fixture input."); await click("Generate Draft");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Guarded snapshot is ready.");
  });

  it.each(["unconfirmed", "unexpected"])("never treats a %s result envelope as a saved draft", async (status) => {
    generate.mockResolvedValueOnce({ status } as Awaited<ReturnType<typeof generateStudioDraftAction>>);
    await render(); await click("Generate Draft");
    expect(container.textContent).toContain("Generation is not confirmed");
    expect(container.querySelector('[data-testid="generated-snapshot"]')).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
