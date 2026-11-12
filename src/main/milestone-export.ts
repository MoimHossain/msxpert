import { createHash, randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import type { MilestoneRow } from "../shared/types";
import { FACET_KEYS, MAX_EXPORT_ROWS, type MilestoneDataset, type MilestoneExportRequest, type MilestoneExportResult } from "../shared/milestones";
import { FACET_LABELS, facetLabel, filterIssue, orderedMilestones } from "../domain/milestone-view";

const COLUMNS = [
  ["name", "Milestone", 60], ["number", "Number", 20], ["date", "Date", 16],
  ["status", "Status", 20], ["commitment", "Commitment", 20], ["monthlyUse", "Monthly use (source units)", 25],
  ["monthlyUseFormatted", "Monthly use (MSX display)", 25], ["ownerName", "Owner", 30],
  ["createdByName", "Raised By", 30], ["createdById", "Raised By (MSX user ID)", 40],
  ["portfolioAccountName", "Portfolio account", 35], ["portfolioTpid", "TPID", 18],
  ["accountName", "MSX account", 35], ["solutionArea", "Solution area", 28], ["azureRegion", "Azure region", 25],
  ["workload", "Workload", 30], ["opportunityName", "Opportunity", 40], ["statusReason", "Status reason", 45],
  ["forecastComments", "Forecast comments", 70], ["milestoneComments", "Milestone comments", 70],
  ["id", "Milestone ID", 40], ["portfolioAccountId", "Portfolio registration ID", 40],
  ["accountId", "MSX account ID", 40], ["opportunityId", "Opportunity ID", 40],
  ["url", "Milestone URL", 50], ["opportunityUrl", "Opportunity URL", 50],
] as const satisfies ReadonlyArray<readonly [keyof MilestoneRow, string, number]>;

export function milestoneHash(rows: MilestoneRow[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function assertCell(value: unknown): void {
  if (typeof value === "string" && value.length > 32_767) throw new Error("A milestone value exceeds Excel's cell length limit. No file was written.");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("A milestone contains a non-finite numeric value. No file was written.");
}

export async function buildMilestoneWorkbook(
  rows: MilestoneRow[], request: MilestoneExportRequest, dataset: MilestoneDataset, now = new Date(),
): Promise<Buffer> {
  if (!rows.length || rows.length > MAX_EXPORT_ROWS) throw new Error(`Export requires between 1 and ${MAX_EXPORT_ROWS} matching milestones.`);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MCAPS Console";
  workbook.created = now;
  const sheet = workbook.addWorksheet("Milestones", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  sheet.columns = COLUMNS.map(([key, header, width]) => ({ key, header, width }));
  for (const milestone of rows) {
    const values = COLUMNS.map(([key]) => {
      const value = milestone[key];
      assertCell(value);
      if (key === "date" && value) {
        const calendarDate = String(value).slice(0, 10);
        const date = new Date(`${calendarDate}T00:00:00Z`);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== calendarDate) throw new Error("A milestone has an invalid date. No file was written.");
        return date;
      }
      return value;
    });
    const row = sheet.addRow(values);
    row.font = { name: "Arial", size: 10 };
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell("date").numFmt = "yyyy-mm-dd";
    row.getCell("monthlyUse").numFmt = '#,##0.00;(#,##0.00);"-"';
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: COLUMNS.length } };
  const metadata = workbook.addWorksheet("View");
  metadata.columns = [{ width: 30 }, { width: 100 }];
  metadata.addRows([
    ["Setting", "Value"],
    ["Exported at (UTC)", now.toISOString()],
    ["Source", request.history ? `Historical snapshot: ${request.history.runId}. No MSX refresh was performed.` :
      "Latest saved captures for active portfolio registrations. No MSX refresh was performed."],
    ["Configured capture window", `${dataset.scope.label}: ${dataset.scope.dateFrom} to ${dataset.scope.dateTo}`],
    ["Capture window note", request.history ? "Original scope at this fetch. Later refreshes do not change this snapshot." :
      "Saved records may reflect an earlier scope until refreshed from Portfolio."],
    ["Capture status exclusions", dataset.scope.excludedStatusLabels.join("; ") || "None"],
    ["Privacy", "This unencrypted export is outside the app vault. Handle it under your organization's data policies."],
    ["Sort", `${request.view.sortKey} ${request.view.sortDirection}`],
    ["Grouping", request.view.groupBy.map(key => FACET_LABELS[key]).join(" > ") || "None"],
    ["Grouping note", "All matching milestones are included in fully expanded group order, regardless of UI pagination or collapsed groups."],
    ["Search", request.view.filters.search],
    ["Date from", request.view.filters.dateFrom], ["Date to", request.view.filters.dateTo],
    ["Minimum monthly use", request.view.filters.minMonthlyUse], ["Maximum monthly use", request.view.filters.maxMonthlyUse],
    ["Amount units", "Raw source units; no currency conversion or cross-currency totals."],
    ...FACET_KEYS.map(key => [FACET_LABELS[key], request.view.filters[key].map(value => facetLabel(key, value, dataset.milestones)).join("; ") || "All"]),
  ]);
  for (const worksheet of [sheet, metadata]) {
    worksheet.eachRow(row => row.eachCell(cell => {
      assertCell(cell.value);
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { vertical: "top", wrapText: true };
    }));
    const header = worksheet.getRow(1);
    header.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F6CBD" } };
    header.height = 30;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export class MilestoneExporter {
  private inFlight: Promise<MilestoneExportResult> | null = null;
  constructor(
    private readonly load: (accountIds: string[], history?: MilestoneExportRequest["history"]) => MilestoneDataset,
    private readonly downloads: () => string,
    private readonly reveal: (path: string) => void,
  ) {}

  get busy(): boolean { return this.inFlight !== null; }

  async waitForIdle(): Promise<void> {
    // The IPC caller reports export failures; shutdown waits for either outcome.
    await this.inFlight?.then(() => undefined, () => undefined);
  }

  async export(request: MilestoneExportRequest): Promise<MilestoneExportResult> {
    if (this.inFlight) throw new Error("A milestone export is already running.");
    const operation = this.perform(request);
    this.inFlight = operation;
    try { return await operation; } finally { this.inFlight = null; }
  }

  private async perform(request: MilestoneExportRequest): Promise<MilestoneExportResult> {
    const issue = filterIssue(request.view.filters);
    if (issue) throw new Error(issue);
    const dataset = this.load(request.accountIds, request.history);
    const rows = orderedMilestones(dataset.milestones, request.view);
    if (rows.length !== request.expectedIds.length || rows.some((row, index) => row.id !== request.expectedIds[index]) ||
      milestoneHash(rows) !== request.expectedHash) {
      throw new Error("Saved milestones changed. Reload saved data or reopen this view before exporting.");
    }
    const now = new Date();
    const buffer = await buildMilestoneWorkbook(rows, request, dataset, now);
    const name = `MCAPS-milestones-${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.xlsx`;
    const path = join(this.downloads(), name);
    const file = await open(path, "wx");
    try {
      try {
        await file.writeFile(buffer);
        await file.sync();
      } finally { await file.close(); }
    } catch (error) {
      try { await unlink(path); } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `Export failed and the incomplete file could not be removed: ${path}`);
      }
      throw error;
    }
    let revealError: string | null = null;
    try { this.reveal(path); } catch { revealError = "The file was saved, but File Explorer could not be opened."; }
    return { path, rowCount: rows.length, revealError };
  }
}
