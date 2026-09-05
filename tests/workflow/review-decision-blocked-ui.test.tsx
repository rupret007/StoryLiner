/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReviewDecisionRail } from "@/components/storyliner/review-decision-rail";
import { reviewDecisionRail } from "@/lib/services/publish/review-decision";

describe("review decisions while local edits need attention", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each([
    { pending: false, blocked: true, disabled: true, spinning: false },
    { pending: true, blocked: false, disabled: true, spinning: true },
    { pending: true, blocked: true, disabled: true, spinning: true },
    { pending: false, blocked: false, disabled: false, spinning: false },
  ])("renders $pending pending / $blocked blocked honestly", (state) => {
    const onDecision = jest.fn();
    act(() => root.render(
      <ReviewDecisionRail
        rail={reviewDecisionRail({
          status: "IN_REVIEW",
          surface: "desk",
          possibleLiveWrite: false,
          riskLevel: "LOW",
        })}
        pending={state.pending}
        blocked={state.blocked}
        onDecision={onDecision}
      />
    ));

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(3);
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Approve", "Hold", "Deny",
    ]);
    for (const button of buttons) {
      expect(button.disabled).toBe(state.disabled);
      expect(Boolean(button.querySelector(".animate-spin"))).toBe(state.spinning);
      act(() => button.click());
    }
    expect(onDecision).toHaveBeenCalledTimes(state.disabled ? 0 : 3);
  });
});
