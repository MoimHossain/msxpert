import { describe, expect, it } from "vitest";
import { milestone } from "../../tests/milestone-fixture";
import type { OrgPerson } from "../shared/organization";
import { enrichOrgMilestones, orgMilestoneCoverage } from "./org-milestones";
import { applyFilters, groupMilestones, initialMilestoneView } from "./milestone-view";

const person = (id: string, org: OrgPerson["org"], links: string[]): OrgPerson => ({
  id, org, msxUserIds: links, name: "Same display name", upn: `${id}@example.invalid`, alias: id,
  jobTitle: "Example title", source: "manual", updatedAt: "2026-11-12T10:00:00.000Z",
});

describe("organization milestone enrichment", () => {
  it("joins exact creator and owner identities independently, never by display name", () => {
    const source = [
      milestone({ id: "a", createdById: "CREATOR", ownerId: "owner", ownerEntityType: "systemuser", createdByName: "Same display name" }),
      milestone({ id: "b", createdById: "unmapped", ownerId: null, createdByName: "Same display name" }),
    ];
    const rows = enrichOrgMilestones(source, [person("creator", "STU", ["creator"]), person("owner", "CSU", ["owner"])]);
    expect(rows[0]).toMatchObject({ creatorOrg: "STU", ownerOrg: "CSU", creatorOrgBasis: "User-confirmed: Example title" });
    expect(rows[1]).toMatchObject({ creatorOrg: "Unknown", ownerOrg: "Unknown" });
    expect(source[0]).not.toHaveProperty("creatorOrg");
    expect(orgMilestoneCoverage(rows)).toEqual({ creators: 1, owners: 1 });
    const filters = initialMilestoneView().filters;
    expect(applyFilters(rows, { ...filters, creatorOrg: ["STU", "ATU"], ownerOrg: ["CSU"] }).map(row => row.id)).toEqual(["a"]);
    expect(applyFilters(rows, { ...filters, creatorOrg: ["CSU"], ownerOrg: ["CSU"] })).toEqual([]);
    expect(applyFilters(rows, { ...filters, creatorOrg: ["Unknown"] }).map(row => row.id)).toEqual(["b"]);
    expect(groupMilestones(rows, ["ownerOrg"]).map(group => group.label)).toEqual(["CSU", "Unknown"]);
  });

  it("rejects conflicting identity associations and removes stale derived fields when the cache is empty", () => {
    const source = [milestone({ createdById: "duplicate" })];
    const rows = enrichOrgMilestones(source, [person("one", "CSU", ["duplicate"]), person("two", "STU", ["DUPLICATE"])]);
    expect(rows[0]?.creatorOrg).toBe("Unknown");
    expect(enrichOrgMilestones(rows, [])).toEqual(source);
  });

  it("does not mistake team owners or missing legacy lookup types for employees", () => {
    const rows = enrichOrgMilestones([
      milestone({ ownerId: "owner", ownerEntityType: "team" }),
      milestone({ ownerId: "owner", ownerEntityType: null }),
    ], [person("owner", "CSU", ["owner"])]);
    expect(rows.map(row => row.ownerOrg)).toEqual(["Unknown", "Unknown"]);
    expect(rows[1]?.ownerOrgBasis).toContain("refresh milestones");
  });

  it("preserves imported ISD classification and catalog provenance in milestone views", () => {
    const imported = { ...person("import", "ISD", ["creator"]), source: "imported" as const };
    const rows = enrichOrgMilestones([milestone({ createdById: "creator" })], [imported]);
    expect(rows[0]?.creatorOrgBasis).toBe("Imported catalog: Example title");
    expect(applyFilters(rows, { ...initialMilestoneView().filters, creatorOrg: ["ISD"] })).toHaveLength(1);
  });
});
