import type { MilestoneRow, ScopeSettings } from "./types";

export const FACET_KEYS = ["status", "owner", "creator", "creatorOrg", "ownerOrg", "portfolio", "account", "commitment", "month", "solutionArea", "azureRegion", "workload"] as const;
export type MilestoneFacet = typeof FACET_KEYS[number];
export const SORT_KEYS = ["name", "number", "date", "status", "commitment", "monthlyUse", "ownerName", "createdByName", "creatorOrg", "ownerOrg", "portfolioAccountName", "accountName", "solutionArea", "azureRegion", "workload", "opportunityName"] as const;
export type MilestoneSortKey = typeof SORT_KEYS[number];
export type SortDirection = "asc" | "desc";
export const NOT_SET = "\u0000";
export const MAX_EXPORT_ROWS = 50_000;

export type MilestoneFilters = Record<MilestoneFacet, string[]> & {
  search: string;
  dateFrom: string;
  dateTo: string;
  minMonthlyUse: string;
  maxMonthlyUse: string;
};

export interface MilestoneViewState {
  filters: MilestoneFilters;
  groupBy: MilestoneFacet[];
  sortKey: MilestoneSortKey;
  sortDirection: SortDirection;
}

export type MilestoneFilterSeeds = Partial<Record<MilestoneFacet | "search", string>>;

export interface MilestoneDataset {
  milestones: MilestoneRow[];
  accountIds: string[];
  missingAccountIds: string[];
  scope: ScopeSettings;
  orgRevision?: string;
}

export interface MilestoneExportRequest {
  orgRevision?: string | undefined;
  history?: import("./history").HistorySelection | undefined;
  accountIds: string[];
  view: MilestoneViewState;
  expectedIds: string[];
  expectedHash: string;
}

export interface MilestoneExportResult {
  path: string;
  rowCount: number;
  revealError: string | null;
}
