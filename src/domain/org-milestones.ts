import type { MilestoneRow } from "../shared/types";
import type { OrgPerson } from "../shared/organization";
import type { MilestoneDataset } from "../shared/milestones";

export function enrichOrgMilestones(rows: MilestoneRow[], people: OrgPerson[]): MilestoneRow[] {
  const index = new Map<string, OrgPerson>();
  const conflicts = new Set<string>();
  for (const person of people) for (const id of person.msxUserIds) {
    const key = id.toLowerCase();
    if (index.has(key) && index.get(key)?.id !== person.id) conflicts.add(key);
    else index.set(key, person);
  }

  for (const key of conflicts) index.delete(key);
  return rows.map(row => {
    const { creatorOrg: _creator, ownerOrg: _owner, creatorOrgBasis: _creatorBasis, ownerOrgBasis: _ownerBasis,
      creatorOrgCheckedAt: _creatorAt, ownerOrgCheckedAt: _ownerAt, ...source } = row;
    if (!people.length) return source;
    const creator = row.createdById ? index.get(row.createdById.toLowerCase()) : undefined;
    const owner = row.ownerEntityType === "systemuser" && row.ownerId ? index.get(row.ownerId.toLowerCase()) : undefined;
    const basis = (person: OrgPerson | undefined) => {
      if (!person) return "No exact identity link";
      const source = person.source === "manual" ? "User-confirmed" : person.source === "imported" ? "Imported catalog" : "Role-title inference";
      return person.jobTitle ? `${source}: ${person.jobTitle}` : source;
    };
    const ownerBasis = !row.ownerId ? "No owner identity" : !row.ownerEntityType ?
      "Owner lookup type unavailable; refresh milestones" : row.ownerEntityType !== "systemuser" ?
      "MSX owner is not a user" : basis(owner);
    return { ...source, creatorOrg: creator?.org ?? "Unknown", ownerOrg: owner?.org ?? "Unknown",
      creatorOrgBasis: basis(creator), ownerOrgBasis: ownerBasis,
      creatorOrgCheckedAt: creator?.updatedAt ?? "", ownerOrgCheckedAt: owner?.updatedAt ?? "" };
  });
}

export function enrichOrgDataset(dataset: MilestoneDataset, state: { people: OrgPerson[]; revision: string }): MilestoneDataset {
  return { ...dataset, milestones: enrichOrgMilestones(dataset.milestones, state.people), orgRevision: state.revision };
}

export function orgMilestoneCoverage(rows: MilestoneRow[]): { creators: number; owners: number } {
  const result = { creators: 0, owners: 0 };
  for (const row of rows) {
    if (row.creatorOrg && row.creatorOrg !== "Unknown") result.creators++;
    if (row.ownerOrg && row.ownerOrg !== "Unknown") result.owners++;
  }
  return result;
}
