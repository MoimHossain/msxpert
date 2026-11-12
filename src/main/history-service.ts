import type { ChangeDocument, NormalizedMilestone, PortfolioAccount, RunEntry } from "../shared/types";
import type { HistoryDay, HistoryEvent, HistoryIndex, HistoryRun, HistorySelection } from "../shared/history";
import type { MilestoneDataset } from "../shared/milestones";
import { enrichMilestones } from "../domain/milestone-view";
import type { VaultStore } from "./storage/vault";

export class HistoryService {
  constructor(private readonly store: VaultStore, private readonly accounts: () => PortfolioAccount[]) {}

  getRun({ accountId, runId }: HistorySelection): HistoryRun {
    const account = this.accounts().find(row => row.id === accountId);
    if (!account) throw new Error("The selected history account is unavailable.");
    const run = this.store.get<RunEntry>(`runs:${accountId}`, runId);
    if (!run?.ok) throw new Error("This successful fetch is unavailable in saved history.");
    const changes = this.store.get<ChangeDocument>(`changes:${accountId}`, runId);
    if (!changes) throw new Error("The saved change document for this fetch is unavailable.");
    const snapshot = this.store.get<{ milestones: NormalizedMilestone[] }>(`snapshots:${accountId}`, runId);
    const runs = this.store.list<RunEntry>(`runs:${accountId}`).filter(row => row.ok).sort((a, b) => b.runId.localeCompare(a.runId));
    return { account, run, runs, changes, milestones: snapshot ? enrichMilestones(snapshot.milestones, account) : null,
      scope: { label: changes.filter.windowLabel, dateFrom: changes.filter.dateFrom, dateTo: changes.filter.dateTo,
        excludedStatusLabels: changes.filter.excludedStatuses, excludedStatusValues: [] } };
  }

  getMilestones(selection: HistorySelection, accountIds: string[]): MilestoneDataset {
    if (accountIds.length !== 1 || accountIds[0] !== selection.accountId) throw new Error("Historical export must match the selected account.");
    const history = this.getRun(selection);
    if (!history.milestones) throw new Error("This snapshot was pruned by an older version; only its saved changes remain.");
    return { milestones: history.milestones, accountIds, missingAccountIds: [], scope: history.scope };
  }

  getIndex(): HistoryIndex {
    const accounts = this.accounts();
    const days = new Map<string, HistoryDay>();
    for (const account of accounts) {
      for (const run of this.store.list<RunEntry>(`runs:${account.id}`)) {
        if (!run.ok || run.baseline || !run.counts) continue;
        const { added, modified, unwatchedOnly, disappeared } = run.counts;
        const total = added + modified + unwatchedOnly + disappeared;
        if (!total) continue;
        const date = run.runId.slice(0, 10);
        const day = days.get(date) ?? { date, added: 0, modified: 0, disappeared: 0, total: 0, runs: 0 };
        day.added += added; day.modified += modified + unwatchedOnly; day.disappeared += disappeared;
        day.total += total; day.runs++;
        days.set(date, day);
      }
    }
    return { accounts: accounts.map(({ id, name }) => ({ id, name })),
      days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)) };
  }

  getDay(date: string): HistoryEvent[] {
    const events: HistoryEvent[] = [];
    for (const account of this.accounts()) {
      for (const run of this.store.list<RunEntry>(`runs:${account.id}`)) {
        if (!run.ok || run.baseline || !run.runId.startsWith(`${date}T`)) continue;
        const changes = this.store.get<ChangeDocument>(`changes:${account.id}`, run.runId);
        if (!changes) throw new Error(`Saved changes are unavailable for ${account.name} at ${run.at}.`);
        for (const kind of ["added", "modified", "disappeared"] as const) {
          for (const milestone of changes[kind]) events.push({
            account: { id: account.id, name: account.name, tpid: account.tpid },
            runId: run.runId, at: run.at, kind, milestone,
          });
        }
      }
    }
    return events.sort((a, b) => b.runId.localeCompare(a.runId) || a.account.name.localeCompare(b.account.name));
  }
}
