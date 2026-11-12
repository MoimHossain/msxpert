import { describe, expect, it } from "vitest";
import { SORT_KEYS } from "../../shared/milestones";
import { COLUMN_KEYS, readMilestoneColumnLayout } from "./useMilestoneColumns";

const saved = () => ({ widths: Object.fromEntries(SORT_KEYS.map(key => [key, 500])), frozen: "name" });

describe("saved milestone column preferences", () => {
  it("preserves existing widths/freezing when migrating layouts without visibility preferences", () => {
    expect(readMilestoneColumnLayout(JSON.stringify(saved()))).toEqual({ ...saved(), hidden: [] });
  });

  it("adds Raised By to old layouts while preserving every saved width, visibility and freeze preference", () => {
    const old = {
      widths: Object.fromEntries(SORT_KEYS.filter(key => key !== "createdByName").map(key => [key, 450])),
      frozen: "ownerName", hidden: ["name", "actions"],
    };
    expect(readMilestoneColumnLayout(JSON.stringify(old))).toEqual({
      ...old, widths: { ...old.widths, createdByName: 220 },
    });
  });

  it("retains hidden-column widths and a hidden frozen preference, but not filters or sorting", () => {
    const layout = readMilestoneColumnLayout(JSON.stringify({
      ...saved(), hidden: ["name", "actions"], filters: { search: "Not a saved preference" }, sortKey: "ownerName",
    }));
    expect(layout).toEqual({ ...saved(), hidden: ["name", "actions"] });
    expect(readMilestoneColumnLayout(JSON.stringify(layout))).toEqual(layout);
  });

  it("rejects unknown, duplicate or all-hidden preferences rather than restoring an unusable grid", () => {
    for (const hidden of [["unknown"], ["name", "name"], COLUMN_KEYS, null]) {
      expect(() => readMilestoneColumnLayout(JSON.stringify({ ...saved(), hidden }))).toThrow("visibility");
    }
  });
});
