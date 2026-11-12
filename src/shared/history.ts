import type { ChangeDocument, MilestoneRow, MilestoneSummary, ModifiedMilestone, PortfolioAccount, RunEntry, ScopeSettings } from "./types";

export interface HistorySelection { accountId: string; runId: string }

export interface HistoryRun {
  account: PortfolioAccount;
  run: RunEntry;
  runs: RunEntry[];
  changes: ChangeDocument;
  milestones: MilestoneRow[] | null;
  scope: ScopeSettings;
}

export interface HistoryDay {
  date: string;
  added: number;
  modified: number;
  disappeared: number;
  total: number;
  runs: number;
}

export interface HistoryEvent {
  account: Pick<PortfolioAccount, "id" | "name" | "tpid">;
  runId: string;
  at: string;
  kind: "added" | "modified" | "disappeared";
  milestone: MilestoneSummary | ModifiedMilestone;
}

export interface HistoryIndex {
  days: HistoryDay[];
  accounts: Array<Pick<PortfolioAccount, "id" | "name">>;
}
