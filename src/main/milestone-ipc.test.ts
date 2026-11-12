import { describe, expect, it, vi } from "vitest";
import { initialMilestoneView } from "../domain/milestone-view";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() }, app: { getPath: vi.fn() }, clipboard: { writeText: vi.fn() }, shell: { showItemInFolder: vi.fn() },
}));

import { milestoneExportSchema, msxLinkSchema } from "./ipc";
import { MSX_ORIGIN } from "./msx-client";

const request = () => ({
  accountIds: ["portfolio"], expectedIds: ["milestone"], expectedHash: "a".repeat(64), view: initialMilestoneView(),
});

describe("milestone export IPC validation", () => {
  it("only accepts HTTPS links on the configured MSX origin for opening and clipboard writes", () => {
    const url = `${MSX_ORIGIN}/main.aspx?etn=msp_engagementmilestone&id=example`;
    expect(msxLinkSchema.parse(url)).toBe(url);
    const opportunity = `${MSX_ORIGIN}/main.aspx?etn=opportunity&id=example`;
    expect(msxLinkSchema.parse(opportunity)).toBe(opportunity);
    for (const invalid of ["not-a-url", "javascript:alert(1)", "file:///C:/private", "https://example.invalid",
      url.replace("https:", "http:"), `${MSX_ORIGIN}.example.invalid/main.aspx`]) {
      expect(msxLinkSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("accepts bounded local scope/view requests but no renderer-selected file paths or extra workbook fields", () => {
    expect(milestoneExportSchema.parse(request())).toEqual(request());
    const history = { accountId: "portfolio", runId: "2026-10-01T10:00:00.000Z" };
    expect(milestoneExportSchema.parse({ ...request(), history }).history).toEqual(history);
    expect(milestoneExportSchema.safeParse({ ...request(), history: { ...history, path: "C:\\outside" } }).success).toBe(false);
    expect(milestoneExportSchema.safeParse({ ...request(), history: { ...history, runId: "not-a-run" } }).success).toBe(false);
    expect(milestoneExportSchema.safeParse({ ...request(), path: "C:\\outside\\file.xlsx" }).success).toBe(false);
    expect(milestoneExportSchema.safeParse({ ...request(), rows: [{ formula: "=1+1" }] }).success).toBe(false);
  });

  it("rejects malformed, duplicate or unbounded selections and invalid view configurations", () => {
    const valid = request();
    for (const invalid of [
      { ...valid, accountIds: [] }, { ...valid, accountIds: ["same", "same"] },
      { ...valid, expectedIds: ["same", "same"] }, { ...valid, expectedIds: Array(50_001).fill("x") },
      { ...valid, expectedHash: "not-a-hash" },
      { ...valid, view: { ...valid.view, groupBy: ["owner", "owner"] } },
      { ...valid, view: { ...valid.view, groupBy: ["owner", "month", "status", "workload"] } },
      { ...valid, view: { ...valid.view, sortKey: "unknown" } },
      { ...valid, view: { ...valid.view, filters: { ...valid.view.filters, dateFrom: "2026-02-31" } } },
      { ...valid, view: { ...valid.view, filters: { ...valid.view.filters, minMonthlyUse: "0x10" } } },
    ]) expect(milestoneExportSchema.safeParse(invalid).success).toBe(false);
  });
});
