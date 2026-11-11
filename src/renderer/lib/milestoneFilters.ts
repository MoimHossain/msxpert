import type { NormalizedMilestone } from "../../shared/types";

export type MilestoneSortKey =
  | "number"
  | "name"
  | "date"
  | "status"
  | "commitment"
  | "ownerName"
  | "accountName"
  | "monthlyUse"
  | "solutionArea";

export type SortDirection = "asc" | "desc";

export interface MilestoneFilters {
  search: string;
  status: string;
  owner: string;
  account: string;
  commitment: string;
  month: string;
  solutionArea: string;
}

export const EMPTY_FILTERS: MilestoneFilters = {
  search: "",
  status: "",
  owner: "",
  account: "",
  commitment: "",
  month: "",
  solutionArea: "",
};

export function monthKey(date: string | null): string {
  if (!date) return "";
  return date.slice(0, 7);
}

export function monthLabel(key: string): string {
  if (!key) return "Unknown";
  const [year, month] = key.split("-");
  if (!year || !month) return key;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(date);
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

export interface MilestoneFilterOptions {
  statuses: string[];
  owners: string[];
  accounts: string[];
  commitments: string[];
  months: string[];
  solutionAreas: string[];
}

export function deriveFilterOptions(milestones: NormalizedMilestone[]): MilestoneFilterOptions {
  return {
    statuses: uniqueSorted(milestones.map((m) => m.status)),
    owners: uniqueSorted(milestones.map((m) => m.ownerName)),
    accounts: uniqueSorted(milestones.map((m) => m.accountName)),
    commitments: uniqueSorted(milestones.map((m) => m.commitment)),
    months: [...new Set(milestones.map((m) => monthKey(m.date)))].filter(Boolean).sort(),
    solutionAreas: uniqueSorted(milestones.map((m) => m.solutionArea)),
  };
}

function matchesSearch(milestone: NormalizedMilestone, term: string): boolean {
  if (!term) return true;
  const haystack = [
    milestone.number,
    milestone.name,
    milestone.ownerName,
    milestone.accountName,
    milestone.opportunityName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

export function applyFilters(
  milestones: NormalizedMilestone[],
  filters: MilestoneFilters,
): NormalizedMilestone[] {
  return milestones.filter((milestone) => {
    if (!matchesSearch(milestone, filters.search)) return false;
    if (filters.status && milestone.status !== filters.status) return false;
    if (filters.owner && milestone.ownerName !== filters.owner) return false;
    if (filters.account && milestone.accountName !== filters.account) return false;
    if (filters.commitment && milestone.commitment !== filters.commitment) return false;
    if (filters.month && monthKey(milestone.date) !== filters.month) return false;
    if (filters.solutionArea && milestone.solutionArea !== filters.solutionArea) return false;
    return true;
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function sortMilestones(
  milestones: NormalizedMilestone[],
  key: MilestoneSortKey,
  direction: SortDirection,
): NormalizedMilestone[] {
  const sorted = [...milestones].sort((a, b) => compareValues(a[key], b[key]));
  return direction === "asc" ? sorted : sorted.reverse();
}
