import { mkdtemp, open, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { milestone } from "../../tests/milestone-fixture";
import { defaultSettings } from "../domain/defaults";
import { initialMilestoneView, orderedMilestones } from "../domain/milestone-view";
import type { MilestoneExportRequest } from "../shared/milestones";
import { MilestoneExporter, milestoneHash } from "./milestone-export";

vi.mock("node:fs/promises", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return { ...fs, open: vi.fn(fs.open) };
});

describe("local filtered milestone Excel export", () => {
  let directory: string;
  const rows = Array.from({ length: 60 }, (_, index) => milestone({
    id: `m-${String(index).padStart(2, "0")}`, number: `000${index}`, name: ["=1+1", "+SUM(A1)", "-2+3", "@command"][index % 4] ?? "",
    monthlyUse: index === 0 ? null : index - 30, monthlyUseFormatted: index === 0 ? null : `EUR ${index - 30}`,
    forecastComments: "<xml> & \"quoted\"\nSecond line", ownerName: index % 2 ? "Sam" : "Alex",
    createdById: `creator-${index % 2}`, createdByName: index % 2 ? "=CREATOR()" : "Creating Agent",
  }));
  const dataset = () => ({ milestones: rows, accountIds: ["portfolio"], missingAccountIds: [], scope: defaultSettings().scope });
  const request = (): MilestoneExportRequest => {
    const view = initialMilestoneView();
    view.groupBy = ["owner"];
    view.sortKey = "monthlyUse";
    view.sortDirection = "desc";
    const ordered = orderedMilestones(rows, view);
    return { accountIds: ["portfolio"], view, expectedIds: ordered.map(row => row.id), expectedHash: milestoneHash(ordered) };
  };
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "mcaps-xlsx-")); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

  it("writes a genuine workbook containing all pages in grouped order, typed values, literal formulas, metadata and frozen panes", async () => {
    const reveal = vi.fn();
    const exporter = new MilestoneExporter(dataset, () => directory, reveal);
    const expected = request();
    const result = await exporter.export(expected);
    expect(result.rowCount).toBe(60);
    expect(result.revealError).toBeNull();
    expect(reveal).toHaveBeenCalledWith(result.path);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(result.path));
    const sheet = workbook.getWorksheet("Milestones")!;
    expect(sheet.rowCount).toBe(61);
    const column = (header: string) => {
      let found = 0;
      sheet.getRow(1).eachCell((cell, index) => { if (cell.value === header) found = index; });
      expect(found).toBeGreaterThan(0);
      return found;
    };
    expect(Array.from({ length: 60 }, (_, index) => sheet.getCell(index + 2, column("Milestone ID")).value)).toEqual(expected.expectedIds);
    for (let index = 2; index <= sheet.rowCount; index++) {
      expect(sheet.getCell(index, column("Milestone")).type).toBe(ExcelJS.ValueType.String);
      expect(sheet.getCell(index, column("Forecast comments")).value).toBe("<xml> & \"quoted\"\nSecond line");
      expect(sheet.getCell(index, column("Date")).value).toBeInstanceOf(Date);
      expect(sheet.getCell(index, column("TPID")).value).toBe("00100");
      const source = rows.find(row => row.id === expected.expectedIds[index - 2])!;
      expect(sheet.getCell(index, column("Raised By")).value).toBe(source.createdByName);
      expect(sheet.getCell(index, column("Raised By")).type).toBe(ExcelJS.ValueType.String);
      expect(sheet.getCell(index, column("Raised By (MSX user ID)")).value).toBe(source.createdById);
    }
    const nullIndex = expected.expectedIds.indexOf("m-00") + 2;
    expect(sheet.getCell(nullIndex, column("Monthly use (source units)")).value).toBeNull();
    expect(sheet.getCell(2, column("Monthly use (source units)")).type).toBe(ExcelJS.ValueType.Number);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
    expect(workbook.getWorksheet("View")?.rowCount).toBeGreaterThan(15);
    const another = await exporter.export(expected);
    expect(another.path).not.toBe(result.path);
    expect(await readdir(directory)).toHaveLength(2);
  });

  it("rejects changed row values or result order before creating a file", async () => {
    const exporter = new MilestoneExporter(dataset, () => directory, vi.fn());
    const invalid = request();
    invalid.expectedIds.reverse();
    await expect(exporter.export(invalid)).rejects.toThrow("Saved milestones changed");
    invalid.expectedIds.reverse();
    invalid.expectedHash = "0".repeat(64);
    await expect(exporter.export(invalid)).rejects.toThrow("Saved milestones changed");
    expect(await readdir(directory)).toEqual([]);
  });

  it("preserves successful exports when Explorer fails and reports failed writes without claiming success", async () => {
    const exporter = new MilestoneExporter(dataset, () => directory, () => { throw new Error("Explorer unavailable"); });
    const saved = await exporter.export(request());
    expect(saved.revealError).toContain("saved");
    expect((await readFile(saved.path)).length).toBeGreaterThan(1000);
    const reveal = vi.fn();
    const failed = new MilestoneExporter(dataset, () => join(directory, "missing"), reveal);
    await expect(failed.export(request())).rejects.toThrow();
    expect(reveal).not.toHaveBeenCalled();
    expect(failed.busy).toBe(false);
    expect(await readdir(directory)).toHaveLength(1);
  });

  it("removes its own incomplete file even when closing after a failed write also throws", async () => {
    const fs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(open).mockImplementationOnce(async (path, flags, mode) => {
      const file = await fs.open(path, flags, mode);
      const close = file.close.bind(file);
      vi.spyOn(file, "writeFile").mockRejectedValueOnce(new Error("Synthetic write failure"));
      vi.spyOn(file, "close").mockImplementationOnce(async () => { await close(); throw new Error("Synthetic close failure"); });
      return file;
    });
    const reveal = vi.fn();
    const exporter = new MilestoneExporter(dataset, () => directory, reveal);
    await expect(exporter.export(request())).rejects.toThrow("Synthetic close failure");
    expect(await readdir(directory)).toEqual([]);
    expect(reveal).not.toHaveBeenCalled();
    expect(exporter.busy).toBe(false);
  });

  it("rejects invalid bounds and oversize cells, and prevents duplicate concurrent exports", async () => {
    const exporter = new MilestoneExporter(dataset, () => directory, vi.fn());
    const invalid = request();
    invalid.view.filters.minMonthlyUse = "50";
    invalid.view.filters.maxMonthlyUse = "0";
    await expect(exporter.export(invalid)).rejects.toThrow("Minimum");
    const oversized = [milestone({ forecastComments: "x".repeat(32_768) })];
    const view = initialMilestoneView();
    const large = new MilestoneExporter(() => ({ ...dataset(), milestones: oversized }), () => directory, vi.fn());
    await expect(large.export({ accountIds: ["portfolio"], view, expectedIds: ["m1"], expectedHash: milestoneHash(oversized) }))
      .rejects.toThrow("cell length");
    const invalidDate = [milestone({ date: "2026-02-31" })];
    const invalidDates = new MilestoneExporter(() => ({ ...dataset(), milestones: invalidDate }), () => directory, vi.fn());
    await expect(invalidDates.export({ accountIds: ["portfolio"], view, expectedIds: ["m1"], expectedHash: milestoneHash(invalidDate) }))
      .rejects.toThrow("invalid date");
    expect(await readdir(directory)).toEqual([]);
    const active = exporter.export(request());
    await expect(exporter.export(request())).rejects.toThrow("already running");
    await Promise.all([active, exporter.waitForIdle()]);
    expect(exporter.busy).toBe(false);
  });
});
