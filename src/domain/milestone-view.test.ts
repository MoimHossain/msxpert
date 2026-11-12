import { describe, expect, it } from "vitest";
import { milestone } from "../../tests/milestone-fixture";
import { NOT_SET } from "../shared/milestones";
import {
  applyFilters, deriveFilterOptions, filterIssue, groupMilestones, initialMilestoneView, orderedMilestones, pageMilestoneRows,
} from "./milestone-view";

const rows = [
  milestone({ id: "a", status: "Blocked", monthlyUse: -100, forecastComments: "Sensitive migration timeline" }),
  milestone({ id: "b", status: "At Risk", ownerName: "Sam", monthlyUse: 0, date: "2026-11-01", azureRegion: "North Europe" }),
  milestone({ id: "c", status: "On Track", ownerName: null, monthlyUse: null, date: null, portfolioAccountId: "other", portfolioAccountName: "Other parent" }),
];

describe("shared milestone exploration", () => {
  it("searches, filters, groups and sorts by the creator independently of the current owner", () => {
    const data = [
      milestone({ id: "a", createdById: "creator-a", createdByName: "Jordan Creator", ownerName: "Sam" }),
      milestone({ id: "b", createdById: "creator-b", createdByName: "Jordan Creator", ownerName: "Alex" }),
      milestone({ id: "c", createdById: null, createdByName: null, ownerName: "Alex" }),
    ];
    const view = initialMilestoneView();
    expect(applyFilters(data, { ...view.filters, search: " jordan creator " }).map(row => row.id)).toEqual(["a", "b"]);
    expect(applyFilters(data, { ...view.filters, creator: ["creator-a"], owner: ["Sam"] }).map(row => row.id)).toEqual(["a"]);
    expect(applyFilters(data, { ...view.filters, creator: ["creator-a"], owner: ["Alex"] })).toEqual([]);
    expect(applyFilters(data, { ...view.filters, creator: [NOT_SET] }).map(row => row.id)).toEqual(["c"]);
    expect(deriveFilterOptions(data, view.filters).creator).toEqual([
      { value: "creator-a", label: "Jordan Creator (creator-a)", count: 1 },
      { value: "creator-b", label: "Jordan Creator (creator-b)", count: 1 },
      { value: NOT_SET, label: "(not set)", count: 1 },
    ]);
    expect(groupMilestones(data, ["creator"]).map(group => group.rows.map(row => row.id))).toEqual([["a"], ["b"], ["c"]]);
    for (const sortDirection of ["asc", "desc"] as const) {
      expect(orderedMilestones(data, { ...view, sortKey: "createdByName", sortDirection }).map(row => row.id)).toEqual(["a", "b", "c"]);
    }
  });

  it("searches comments and portfolio metadata, trims whitespace, and combines OR facets with AND constraints", () => {
    const view = initialMilestoneView();
    expect(applyFilters(rows, { ...view.filters, search: "  SENSITIVE  " }).map(row => row.id)).toEqual(["a"]);
    expect(applyFilters(rows, { ...view.filters, search: "00100" })).toHaveLength(3);
    expect(applyFilters(rows, { ...view.filters, status: ["Blocked", "At Risk"], owner: ["Sam"] }).map(row => row.id)).toEqual(["b"]);
    expect(applyFilters(rows, { ...view.filters, portfolio: ["other"] }).map(row => row.id)).toEqual(["c"]);
  });

  it("keeps missing values selectable and facets count against other filters, retaining zero-count selections", () => {
    const filters = { ...initialMilestoneView().filters, status: ["Blocked"], owner: ["Sam"] };
    const options = deriveFilterOptions(rows, filters);
    expect(options.status).toEqual([
      { value: "At Risk", label: "At Risk", count: 1 }, { value: "Blocked", label: "Blocked", count: 0 },
    ]);
    expect(options.owner.find(option => option.value === "Alex")?.count).toBe(1);
    expect(options.owner.find(option => option.value === "Sam")?.count).toBe(0);
    expect(applyFilters(rows, { ...initialMilestoneView().filters, owner: [NOT_SET], month: [NOT_SET] }).map(row => row.id)).toEqual(["c"]);
  });

  it("applies inclusive date and signed amount bounds without interpreting missing amounts as zero", () => {
    const filters = initialMilestoneView().filters;
    expect(applyFilters(rows, { ...filters, minMonthlyUse: "-100", maxMonthlyUse: "0" }).map(row => row.id)).toEqual(["a", "b"]);
    expect(applyFilters(rows, { ...filters, minMonthlyUse: "0", maxMonthlyUse: "0" }).map(row => row.id)).toEqual(["b"]);
    expect(applyFilters(rows, { ...filters, dateFrom: "2026-10-01", dateTo: "2026-10-01" }).map(row => row.id)).toEqual(["a"]);
    expect(filterIssue({ ...filters, minMonthlyUse: "1", maxMonthlyUse: "-1" })).toContain("Minimum");
    expect(filterIssue({ ...filters, minMonthlyUse: "Infinity" })).toContain("finite");
    expect(filterIssue({ ...filters, dateFrom: "2027-01-01", dateTo: "2026-01-01" })).toContain("Date");
    expect(applyFilters(rows, { ...filters, minMonthlyUse: "bad" })).toEqual([]);
  });

  it("sorts numbers correctly, keeps blanks last in either direction and breaks ties by ID", () => {
    const view = initialMilestoneView();
    expect(orderedMilestones(rows, { ...view, sortKey: "monthlyUse", sortDirection: "desc" }).map(row => row.id)).toEqual(["b", "a", "c"]);
    expect(orderedMilestones(rows, { ...view, sortKey: "monthlyUse" }).map(row => row.id)).toEqual(["a", "b", "c"]);
    expect(orderedMilestones([milestone({ id: "z" }), milestone({ id: "a" })], { ...view, sortKey: "name", sortDirection: "desc" })
      .map(row => row.id)).toEqual(["a", "z"]);
  });

  it("groups by chronological month then owner, paginates leaves with repeated full-count headings, and collapses without narrowing exports", () => {
    const data = [
      milestone({ id: "feb", date: "2027-02-01" }), milestone({ id: "dec-a", date: "2026-12-01" }),
      milestone({ id: "dec-b", date: "2026-12-02" }), milestone({ id: "missing", date: null }),
    ];
    const view = { ...initialMilestoneView(), groupBy: ["month", "owner"] as const };
    const mutableView = { ...view, groupBy: [...view.groupBy] };
    const ordered = orderedMilestones(data, mutableView);
    expect(ordered.map(row => row.id)).toEqual(["dec-a", "dec-b", "feb", "missing"]);
    const first = pageMilestoneRows(ordered, mutableView.groupBy, new Set(), 0, 1);
    const top = first.find(row => row.kind === "group");
    expect(top?.kind === "group" && top.group.rows.length).toBe(2);
    const second = pageMilestoneRows(ordered, mutableView.groupBy, new Set(), 1, 1);
    expect(second.filter(row => row.kind === "milestone").map(row => row.milestone.id)).toEqual(["dec-b"]);
    const collapsed = new Set(top?.kind === "group" ? [top.group.id] : []);
    expect(pageMilestoneRows(ordered, mutableView.groupBy, collapsed, 0, 1).filter(row => row.kind === "milestone")).toEqual([]);
    expect(orderedMilestones(data, mutableView)).toHaveLength(4);
  });
});
