import type { MilestoneRow, NormalizedMilestone, PortfolioAccount } from "../shared/types";
import {
  FACET_KEYS, NOT_SET,
  type MilestoneFacet, type MilestoneFilterSeeds, type MilestoneFilters,
  type MilestoneSortKey, type MilestoneViewState, type SortDirection,
} from "../shared/milestones";

export const FACET_LABELS: Record<MilestoneFacet, string> = {
  status: "Status", owner: "Owner", creator: "Raised By", portfolio: "Portfolio account", account: "MSX account",
  commitment: "Commitment", month: "Month", solutionArea: "Solution area", azureRegion: "Azure region", workload: "Workload",
};
const compareText = new Intl.Collator("en-US").compare;

export function enrichMilestones(rows: NormalizedMilestone[], account: PortfolioAccount): MilestoneRow[] {
  return rows.map(row => ({ ...row, createdById: row.createdById ?? null, createdByName: row.createdByName ?? null,
    portfolioAccountId: account.id, portfolioAccountName: account.name, portfolioTpid: account.tpid }));
}

export function emptyFilters(): MilestoneFilters {
  return {
    search: "", status: [], owner: [], creator: [], portfolio: [], account: [], commitment: [],
    month: [], solutionArea: [], azureRegion: [], workload: [],
    dateFrom: "", dateTo: "", minMonthlyUse: "", maxMonthlyUse: "",
  };
}

export function initialMilestoneView(seeds: MilestoneFilterSeeds = {}): MilestoneViewState {
  const filters = emptyFilters();
  for (const key of FACET_KEYS) if (seeds[key]) filters[key] = [seeds[key]];
  filters.search = seeds.search ?? "";
  return { filters, groupBy: [], sortKey: "date", sortDirection: "asc" };
}

export function monthKey(date: string | null): string {
  return date?.slice(0, 7) ?? "";
}

export function monthLabel(key: string): string {
  if (!key || key === NOT_SET) return "(not set)";
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function facetValue(row: MilestoneRow, key: MilestoneFacet): string {
  switch (key) {
    case "owner": return row.ownerName || NOT_SET;
    case "creator": return row.createdById || row.createdByName || NOT_SET;
    case "portfolio": return row.portfolioAccountId || NOT_SET;
    case "account": return row.accountName || NOT_SET;
    case "month": return monthKey(row.date) || NOT_SET;
    default: return row[key] || NOT_SET;
  }
}

export function facetLabel(key: MilestoneFacet, value: string, rows: MilestoneRow[]): string {
  if (value === NOT_SET) return "(not set)";
  if (key === "month") return monthLabel(value);
  if (key === "portfolio") return rows.find(row => row.portfolioAccountId === value)?.portfolioAccountName ?? value;
  if (key === "creator") {
    const name = rows.find(row => facetValue(row, key) === value)?.createdByName;
    if (!name) return value;
    return rows.some(row => row.createdByName === name && facetValue(row, key) !== value) ? `${name} (${value})` : name;
  }
  return value;
}

export function filterIssue(filters: MilestoneFilters): string | null {
  const { dateFrom, dateTo, minMonthlyUse, maxMonthlyUse } = filters;
  if (dateFrom && dateTo && dateFrom > dateTo) return "Date from must be on or before Date to.";
  if ([minMonthlyUse, maxMonthlyUse].some(value => value !== "" &&
    (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value))))) {
    return "Monthly use bounds must be finite numbers.";
  }
  if (minMonthlyUse !== "" && maxMonthlyUse !== "" && Number(minMonthlyUse) > Number(maxMonthlyUse)) {
    return "Minimum monthly use must not exceed the maximum.";
  }
  return null;
}

export function applyFilters(rows: MilestoneRow[], filters: MilestoneFilters, except?: MilestoneFacet): MilestoneRow[] {
  if (filterIssue(filters)) return [];
  const search = filters.search.trim().toLowerCase();
  return rows.filter(row => {
    if (FACET_KEYS.some(key => key !== except && filters[key].length && !filters[key].includes(facetValue(row, key)))) return false;
    if (search && ![
      row.name, row.number, row.ownerName, row.createdByName, row.portfolioAccountName, row.portfolioTpid, row.accountName,
      row.opportunityName, row.workload, row.azureRegion, row.forecastComments, row.milestoneComments,
    ].filter(Boolean).join(" ").toLowerCase().includes(search)) return false;
    const date = row.date?.slice(0, 10);
    if (filters.dateFrom && (!date || date < filters.dateFrom)) return false;
    if (filters.dateTo && (!date || date > filters.dateTo)) return false;
    if (filters.minMonthlyUse !== "" || filters.maxMonthlyUse !== "") {
      if (row.monthlyUse === null || !Number.isFinite(row.monthlyUse)) return false;
      if (filters.minMonthlyUse !== "" && row.monthlyUse < Number(filters.minMonthlyUse)) return false;
      if (filters.maxMonthlyUse !== "" && row.monthlyUse > Number(filters.maxMonthlyUse)) return false;
    }
    return true;
  });
}

export interface FacetOption { value: string; label: string; count: number }

export function deriveFilterOptions(rows: MilestoneRow[], filters: MilestoneFilters): Record<MilestoneFacet, FacetOption[]> {
  const options: Record<MilestoneFacet, FacetOption[]> = {
    status: [], owner: [], creator: [], portfolio: [], account: [], commitment: [], month: [], solutionArea: [], azureRegion: [], workload: [],
  };
  for (const key of FACET_KEYS) {
    const counts = new Map<string, number>();
    for (const row of applyFilters(rows, filters, key)) {
      const value = facetValue(row, key);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    for (const value of filters[key]) if (!counts.has(value)) counts.set(value, 0);
    options[key] = [...counts].map(([value, count]) => ({ value, count, label: facetLabel(key, value, rows) }))
      .sort((a, b) => a.value === NOT_SET ? 1 : b.value === NOT_SET ? -1 :
        key === "month" ? compareText(a.value, b.value) : compareText(a.label, b.label));
  }
  return options;
}

export function sortMilestones(rows: MilestoneRow[], key: MilestoneSortKey, direction: SortDirection): MilestoneRow[] {
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    const missingX = x === null || x === "", missingY = y === null || y === "";
    if (missingX !== missingY) return missingX ? 1 : -1;
    const compared = typeof x === "number" && typeof y === "number" ? x - y : compareText(String(x ?? ""), String(y ?? ""));
    return compared ? compared * (direction === "asc" ? 1 : -1) : compareText(a.id, b.id);
  });
}

export interface MilestoneGroup {
  id: string;
  field: MilestoneFacet;
  label: string;
  depth: number;
  rows: MilestoneRow[];
  children: MilestoneGroup[];
}

export function groupMilestones(rows: MilestoneRow[], fields: MilestoneFacet[], path: string[] = []): MilestoneGroup[] {
  const field = fields[path.length];
  if (!field) return [];
  const grouped = new Map<string, MilestoneRow[]>();
  for (const row of rows) {
    const value = facetValue(row, field);
    const group = grouped.get(value) ?? [];
    group.push(row);
    grouped.set(value, group);
  }
  return [...grouped].sort(([a], [b]) => a === NOT_SET ? 1 : b === NOT_SET ? -1 :
    field === "month" ? compareText(a, b) : compareText(facetLabel(field, a, rows), facetLabel(field, b, rows)) || compareText(a, b))
    .map(([value, members]) => ({
      id: JSON.stringify([...path, value]), field, label: facetLabel(field, value, rows), depth: path.length,
      rows: members, children: groupMilestones(members, fields, [...path, value]),
    }));
}

export function orderedMilestones(rows: MilestoneRow[], view: MilestoneViewState): MilestoneRow[] {
  const sorted = sortMilestones(applyFilters(rows, view.filters), view.sortKey, view.sortDirection);
  const flatten = (groups: MilestoneGroup[]): MilestoneRow[] => groups.flatMap(group => group.children.length ? flatten(group.children) : group.rows);
  return view.groupBy.length ? flatten(groupMilestones(sorted, view.groupBy)) : sorted;
}

export type MilestoneDisplayRow = { kind: "group"; group: MilestoneGroup } | { kind: "milestone"; milestone: MilestoneRow };

export function pageMilestoneRows(
  ordered: MilestoneRow[], groupBy: MilestoneFacet[], collapsed: Set<string>, offset: number, size: number,
): MilestoneDisplayRow[] {
  if (!groupBy.length) return ordered.slice(offset, offset + size).map(milestone => ({ kind: "milestone", milestone }));
  let position = 0;
  const result: MilestoneDisplayRow[] = [];
  const walk = (groups: MilestoneGroup[]) => {
    for (const group of groups) {
      const start = position, end = start + group.rows.length;
      if (end <= offset || start >= offset + size) { position = end; continue; }
      result.push({ kind: "group", group });
      if (collapsed.has(group.id)) position = end;
      else if (group.children.length) walk(group.children);
      else {
        for (const milestone of group.rows) {
          if (position >= offset && position < offset + size) result.push({ kind: "milestone", milestone });
          position++;
        }
      }
    }
  };
  walk(groupMilestones(ordered, groupBy));
  return result;
}
