import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { ChangeDocument, PortfolioAccount, RunEntry } from "../shared/types";
import { milestone } from "../../tests/milestone-fixture";
import { initialMilestoneView } from "../domain/milestone-view";
import { HistoryService } from "./history-service";
import { VaultStore } from "./storage/vault";
import { MilestoneExporter, milestoneHash } from "./milestone-export";

vi.mock("electron", () => ({
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString() },
}));

const account: PortfolioAccount = { id: "history-account", msxAccountId: "msx-account", tpid: "00100",
  name: "Synthetic history account", country: null, createdAt: "2026-10-01T10:00:00.000Z" };
const first = "2026-10-01T10:00:00.000Z", second = "2026-10-02T10:00:00.000Z";
const record = milestone({ id: "historic-milestone", monthlyUse: 25, name: "Original captured milestone" });
function document(runId: string, baseline = false): ChangeDocument {
  return { runId, generatedAt: runId, baseline, previousRunId: baseline ? null : first,
    account, filter: { windowLabel: "Historical window", dateFrom: "2026-07-01", dateTo: "2027-06-30",
      excludedStatuses: ["Cancelled"], accountIdCount: 1 },
    counts: { added: baseline ? 0 : 1, modified: 0, disappeared: 0, unwatchedOnly: 0, total: 1 },
    added: baseline ? [] : [record], modified: [], disappeared: [] };
}

describe("encrypted saved history", () => {
  let directory: string, store: VaultStore, history: HistoryService;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "mcaps-history-"));
    store = new VaultStore(directory);
    history = new HistoryService(store, () => [account]);
    for (const [runId, baseline] of [[first, true], [second, false]] as const) {
      const doc = document(runId, baseline);
      store.put(`runs:${account.id}`, runId, { runId, at: runId, durationMs: 200, ok: true, baseline, counts: doc.counts } satisfies RunEntry);
      store.put(`changes:${account.id}`, runId, doc);
      store.put(`snapshots:${account.id}`, runId, { milestones: [record], manifest: {} });
    }
    store.put(`runs:${account.id}`, "2026-10-03T10:00:00.000Z", {
      runId: "2026-10-03T10:00:00.000Z", at: "2026-10-03T10:00:00.000Z", ok: false, durationMs: 100, error: "Offline",
    });
  });
  afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

  it("keeps reviewed events visible, excludes baselines/failures from the timeline, and survives reopening the vault", () => {
    const watermark = { reviewedThrough: second };
    store.put(`watermark:${account.id}`, "current", watermark);
    store.close(); store = new VaultStore(directory);
    history = new HistoryService(store, () => [account]);
    expect(history.getIndex().days).toEqual([{ date: "2026-10-02", added: 1, modified: 0, disappeared: 0, total: 1, runs: 1 }]);
    expect(history.getDay("2026-10-02")[0]).toMatchObject({ runId: second, kind: "added", milestone: { id: record.id } });
    expect(history.getDay("2026-10-01")).toEqual([]);
    expect(store.get(`watermark:${account.id}`, "current")).toEqual(watermark);
  });

  it("loads the selected historical snapshot and successful navigation independently of current state", () => {
    store.put(`current:${account.id}`, "milestones", [milestone({ monthlyUse: 9999 })]);
    const result = history.getRun({ accountId: account.id, runId: first });
    expect(result.milestones?.[0]).toMatchObject({ id: record.id, monthlyUse: 25, portfolioAccountId: account.id });
    expect(result.runs.map(run => run.runId)).toEqual([second, first]);
    expect(result.scope).toMatchObject({ label: "Historical window", excludedStatusLabels: ["Cancelled"] });
  });

  it("preserves changes when an older snapshot was pruned and rejects mismatched, missing or failed selections", () => {
    store.delete(`snapshots:${account.id}`, first);
    expect(history.getRun({ accountId: account.id, runId: first })).toMatchObject({ milestones: null, changes: { baseline: true } });
    expect(() => history.getMilestones({ accountId: account.id, runId: first }, [account.id])).toThrow("pruned");
    expect(() => history.getMilestones({ accountId: account.id, runId: second }, ["other"])).toThrow("match");
    expect(() => history.getRun({ accountId: "other", runId: first })).toThrow("unavailable");
    expect(() => history.getRun({ accountId: account.id, runId: "2026-10-03T10:00:00.000Z" })).toThrow("unavailable");
  });

  it("exports the actual historical snapshot, not today's rows, and identifies the source run in Excel", async () => {
    const selection = { accountId: account.id, runId: first };
    const source = history.getMilestones(selection, [account.id]);
    store.put(`current:${account.id}`, "milestones", [milestone({ monthlyUse: 9999 })]);
    const reveal = vi.fn();
    const exporter = new MilestoneExporter((ids, selected) => {
      if (!selected) throw new Error("Historical selection is required.");
      return history.getMilestones(selected, ids);
    }, () => directory, reveal);
    const saved = await exporter.export({ history: selection, accountIds: [account.id], view: initialMilestoneView(),
      expectedIds: [record.id], expectedHash: milestoneHash(source.milestones) });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(saved.path);
    const sheet = workbook.getWorksheet("Milestones")!;
    const headers = sheet.getRow(1).values;
    if (!Array.isArray(headers)) throw new Error("Expected workbook header values.");
    const column = headers.indexOf("Monthly use (source units)");
    expect(sheet.getCell(2, column).value).toBe(25);
    expect(JSON.stringify(workbook.getWorksheet("View")!.getSheetValues())).toContain(first);
    expect(JSON.stringify(workbook.getWorksheet("View")!.getSheetValues())).toContain("Cancelled");
    expect(JSON.stringify(workbook.getWorksheet("View")!.getSheetValues())).not.toContain("Saved records may reflect an earlier scope");
    expect(reveal).toHaveBeenCalledWith(saved.path);
  });
});
