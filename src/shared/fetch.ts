export type FetchStage = "queued" | "tree" | "milestones" | "explaining" | "saving" | "complete" | "failed";

export interface AccountFetchProgress {
  accountId: string;
  name: string;
  stage: FetchStage;
  accountRecords: number;
  milestones: number;
  pages: number;
  changes: number | null;
  error: string | null;
}

export interface FetchProgress {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  running: boolean;
  completed: number;
  total: number;
  accounts: AccountFetchProgress[];
}

export const FETCH_STAGE_LABELS: Record<FetchStage, string> = {
  queued: "Waiting", tree: "Resolving account tree", milestones: "Reading milestone pages",
  explaining: "Investigating milestones outside scope", saving: "Saving encrypted snapshot",
  complete: "Complete", failed: "Failed",
};

export function isAccountFetching(progress: AccountFetchProgress | undefined): boolean {
  return Boolean(progress && !["queued", "complete", "failed"].includes(progress.stage));
}
