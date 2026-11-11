import type { AccountOverview, PodSummary, TeamPerson } from "../../shared/types";

export interface PodDiagnostics {
  uncoveredAccounts: AccountOverview[];
  duplicatedAccounts: Array<{ account: AccountOverview; podNames: string[] }>;
  unassignedPeople: TeamPerson[];
}

export function computePodDiagnostics(
  accounts: AccountOverview[],
  pods: PodSummary[],
  team: TeamPerson[],
): PodDiagnostics {
  const accountToPods = new Map<string, string[]>();
  for (const pod of pods) {
    for (const accountId of pod.accountIds) {
      const list = accountToPods.get(accountId) ?? [];
      list.push(pod.name);
      accountToPods.set(accountId, list);
    }
  }

  const uncoveredAccounts = accounts.filter((account) => !accountToPods.has(account.id));
  const duplicatedAccounts = accounts
    .filter((account) => (accountToPods.get(account.id)?.length ?? 0) > 1)
    .map((account) => ({ account, podNames: accountToPods.get(account.id) ?? [] }));

  const assignedPeople = new Set(
    pods.flatMap((pod) => pod.people.map((assignment) => assignment.personId)),
  );
  const unassignedPeople = team.filter((person) => !assignedPeople.has(person.id));

  return { uncoveredAccounts, duplicatedAccounts, unassignedPeople };
}
