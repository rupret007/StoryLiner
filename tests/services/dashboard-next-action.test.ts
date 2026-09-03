import { dashboardNextAction } from "@/lib/services/dashboard-next-action";

const idle = {
  failedWriteStartedCount: 0,
  possibleLiveWriteCount: 0,
  reviewCount: 0,
  approvedCount: 0,
  scheduledCount: 0,
  bandCount: 2,
};

describe("dashboardNextAction", () => {
  it("puts a possible live write ahead of every normal workflow action", () => {
    const action = dashboardNextAction({
      ...idle,
      failedWriteStartedCount: 1,
      failedWriteDraftId: "draft unsafe",
      possibleLiveWriteCount: 2,
      reviewCount: 8,
      approvedCount: 4,
      scheduledCount: 3,
    });

    expect(action.tone).toBe("danger");
    expect(action.title).toMatch(/Verify 1 possible live write/i);
    expect(action.description).toMatch(/may already be live/i);
    expect(action.description).not.toMatch(/nothing was published/i);
    expect(action.href).toBe("/review-queue?focus=draft%20unsafe");
  });

  it("keeps a returned possible-live draft ahead of new review work", () => {
    const action = dashboardNextAction({
      ...idle,
      possibleLiveWriteCount: 1,
      possibleLiveWriteDraftId: "returned-draft",
      reviewCount: 3,
    });

    expect(action.title).toMatch(/Verify 1 possible live post/i);
    expect(action.description).toMatch(/before giving another schedule yes/i);
    expect(action.href).toBe("/review-queue?focus=returned-draft");
  });

  it("leads review before approved, scheduled, or creation work", () => {
    const action = dashboardNextAction({
      ...idle,
      reviewCount: 2,
      reviewDraftId: "review-first",
      approvedCount: 1,
      scheduledCount: 6,
    });

    expect(action.title).toBe("Review 2 drafts");
    expect(action.description).toMatch(/do not publish/i);
    expect(action.href).toBe("/review-queue?focus=review-first");
  });

  it("names schedule as a separate yes when only approved work waits", () => {
    const action = dashboardNextAction({
      ...idle,
      approvedCount: 2,
      approvedDraftId: "approved-first",
      scheduledCount: 4,
    });

    expect(action.title).toBe("Schedule 2 approved drafts");
    expect(action.description).toMatch(/opening it does not publish/i);
    expect(action.href).toBe("/review-queue?focus=approved-first");
  });

  it("reports a healthy queue before suggesting more content", () => {
    const action = dashboardNextAction({ ...idle, scheduledCount: 3 });

    expect(action.title).toBe("3 posts are queued");
    expect(action.href).toBe("/scheduled-posts");
  });

  it("starts with band setup only when no active band exists", () => {
    const action = dashboardNextAction({ ...idle, bandCount: 0 });

    expect(action.title).toBe("Add your first band");
    expect(action.href).toBe("/bands/new");
  });

  it("returns to guarded creation when no decision is waiting", () => {
    const action = dashboardNextAction(idle);

    expect(action.title).toBe("Create the next post");
    expect(action.description).toMatch(/nothing publishes automatically/i);
    expect(action.href).toBe("/content-studio");
  });
});
