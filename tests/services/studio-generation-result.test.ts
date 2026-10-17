const generateMock = jest.fn();
jest.mock("@/lib/services/content/generate", () => ({ generateContent: (...args: unknown[]) => generateMock(...args) }));

import { generateStudioDraftAction, generateContentAction } from "@/app/(app)/content-studio/actions";
import {
  CAMPAIGN_CONTEXT_CHANGED, CAMPAIGN_CONTEXT_UNAVAILABLE,
  CAMPAIGN_CONTEXT_OFFLINE_ONLY, CAMPAIGN_CONTEXT_TYPE_MISMATCH,
} from "@/lib/services/content/campaign-context";
import { BAND_ID } from "@/tests/fixtures/campaign-context";
import type { GenerateContentInput } from "@/lib/schemas/content";

const INPUT: GenerateContentInput = {
  bandId: BAND_ID, campaignType: "REHEARSAL", platform: "FACEBOOK", contentLength: "MEDIUM",
};
beforeEach(() => jest.clearAllMocks());

describe("production-safe Studio action results", () => {
  it("returns the exact confirmed draft as data while keeping the legacy action contract", async () => {
    const draft = { id: "clhf5gt0000000test0draft01", status: "IN_REVIEW", caption: "Fixture draft" };
    generateMock.mockResolvedValue(draft);
    expect(await generateStudioDraftAction(INPUT)).toEqual({ status: "saved", draft });
    expect(await generateContentAction(INPUT)).toBe(draft);
  });

  it.each([
    [CAMPAIGN_CONTEXT_CHANGED, "context_changed"],
    [CAMPAIGN_CONTEXT_UNAVAILABLE, "context_unavailable"],
    [CAMPAIGN_CONTEXT_OFFLINE_ONLY, "offline_only"],
    [CAMPAIGN_CONTEXT_TYPE_MISMATCH, "type_mismatch"],
  ])("serializes the allowlisted refusal without relying on a thrown production message: %s", async (message, code) => {
    const error = Object.assign(new Error(message), { digest: "PRIVATE-DIGEST", internalDetail: "PRIVATE-DATABASE-DETAIL" });
    generateMock.mockRejectedValue(error);
    const result = await generateStudioDraftAction(INPUT);
    expect(JSON.parse(JSON.stringify(result))).toEqual({ status: "blocked", code });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(JSON.stringify(result)).not.toContain(message);
  });

  it("rejects invalid fields before generation without returning input values or validation internals", async () => {
    const result = await generateStudioDraftAction({ ...INPUT, bandId: "private-invalid-input" });
    expect(result).toEqual({ status: "blocked", code: "invalid_input" });
    expect(generateMock).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private-invalid-input");
  });

  it.each([
    new Error("postgresql://private.example/owner-db"),
    new Error("provider failure with a private payload"),
    new Error(`${CAMPAIGN_CONTEXT_CHANGED} injected private suffix`),
    { message: CAMPAIGN_CONTEXT_CHANGED, details: "private object" },
    "private provider response",
  ])("returns only unconfirmed for an unknown outcome, never a false no-write claim", async (error) => {
    generateMock.mockRejectedValue(error);
    expect(await generateStudioDraftAction(INPUT)).toEqual({ status: "unconfirmed" });
  });
});
