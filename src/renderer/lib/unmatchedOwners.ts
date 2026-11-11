import type { AccountState, TeamPerson } from "../../shared/types";

export interface OwnerSighting {
  ownerId: string | null;
  ownerName: string;
  count: number;
  accountNames: Set<string>;
}

export function collectOwners(states: AccountState[]): OwnerSighting[] {
  const byKey = new Map<string, OwnerSighting>();
  for (const state of states) {
    for (const milestone of state.milestones) {
      if (!milestone.ownerName) continue;
      const key = milestone.ownerId ?? `name:${milestone.ownerName}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        if (milestone.accountName) existing.accountNames.add(milestone.accountName);
      } else {
        byKey.set(key, {
          ownerId: milestone.ownerId,
          ownerName: milestone.ownerName,
          count: 1,
          accountNames: new Set(milestone.accountName ? [milestone.accountName] : []),
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

/** Mirrors TEAM-04: owner ID, then alias owner ID, then exact display-name fallback. */
export function isMatched(owner: OwnerSighting, team: TeamPerson[]): boolean {
  if (owner.ownerId) {
    return team.some(
      (person) =>
        person.msxUserId === owner.ownerId ||
        person.aliases.some((alias) => alias.ownerId === owner.ownerId),
    );
  }
  return team.some(
    (person) =>
      person.name === owner.ownerName ||
      person.aliases.some((alias) => alias.ownerName === owner.ownerName),
  );
}

export function unmatchedOwners(states: AccountState[], team: TeamPerson[]): OwnerSighting[] {
  return collectOwners(states).filter((owner) => !isMatched(owner, team));
}
