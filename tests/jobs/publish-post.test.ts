/**
 * Tests for publish-post handler behavior around draft-only adapters.
 * Validates the isDraftOnly flag semantics and status transitions.
 */

import { mockTikTokAdapter, mockInstagramAdapter } from "@/lib/adapters/social/mock-adapter";

describe("draft-only adapter publish result", () => {
  it("TikTok adapter sets isDraftOnly = true", async () => {
    const result = await mockTikTokAdapter.publish({ caption: "test", hashtags: [] });
    expect(result.success).toBe(true);
    expect(result.isDraftOnly).toBe(true);
  });

  it("TikTok adapter does not return a live post URL", async () => {
    const result = await mockTikTokAdapter.publish({ caption: "test", hashtags: [] });
    // URL should indicate draft context
    expect(result.externalPostUrl).toContain("/draft/");
  });

  it("Instagram adapter does NOT set isDraftOnly", async () => {
    const result = await mockInstagramAdapter.publish({ caption: "test", hashtags: [] });
    expect(result.success).toBe(true);
    expect(result.isDraftOnly).toBe(false);
  });

  it("Instagram adapter returns a live post URL", async () => {
    const result = await mockInstagramAdapter.publish({ caption: "test", hashtags: [] });
    expect(result.externalPostUrl).toContain("/posts/");
  });
});

describe("adapter capabilities", () => {
  it("TikTok declares canDraftOnly = true and canDirectPublish = false", () => {
    expect(mockTikTokAdapter.capabilities.canDraftOnly).toBe(true);
    expect(mockTikTokAdapter.capabilities.canDirectPublish).toBe(false);
  });

  it("Instagram declares canDirectPublish = true and canDraftOnly = false", () => {
    expect(mockInstagramAdapter.capabilities.canDirectPublish).toBe(true);
    expect(mockInstagramAdapter.capabilities.canDraftOnly).toBe(false);
  });

  it("TikTok degradation warning mentions manual publish", () => {
    const warning = mockTikTokAdapter.getDegradationWarning("publish");
    expect(warning).not.toBeNull();
    expect(warning?.toLowerCase()).toContain("draft");
  });

  it("Instagram has no degradation warning for publish", () => {
    const warning = mockInstagramAdapter.getDegradationWarning("publish");
    expect(warning).toBeNull();
  });
});
