export interface AcrMonth {
  key: string;
  label: string;
  year: number;
  provisional: boolean;
}

export interface AcrWindow {
  months: AcrMonth[];
  fiscalYear: string;
  fiscalYears: string[];
}

export interface AcrAccount {
  id: string;
  name: string;
  tpid: string;
}

export interface AcrUser {
  username: string;
  name: string;
}

export interface AcrNode {
  key: string;
  name: string;
  level: number;
  path: string[];
  values: Record<string, number>;
  total: number;
  delta: number;
  trend: number | null;
  children: AcrNode[];
}

export interface AcrAccountSnapshot {
  account: AcrAccount;
  totals: Record<string, number>;
  total: number;
  delta: number;
  trend: number | null;
  rows: number;
  hierarchy: AcrNode[];
  fetchedAt: string;
}

export interface AcrSnapshot extends AcrWindow {
  version: 1;
  currency: "USD";
  fetchedAt: string;
  fetchedBy: AcrUser;
  configuredTpids: string[];
  accounts: AcrAccountSnapshot[];
  skipped: AcrAccount[];
}

export interface AcrFailure {
  account: AcrAccount;
  error: string;
}

export interface AcrActiveAccount extends AcrAccount {
  fiscalYear: string;
  pages: number;
  rows: number;
}

export interface AcrProgress {
  scopeId: string;
  runId: string;
  running: boolean;
  phase: "access" | "fetching" | "saving" | "complete" | "failed" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  total: number;
  completed: number;
  active: AcrActiveAccount[];
  failures: AcrFailure[];
  skipped: AcrAccount[];
  error: string | null;
}

export interface AcrConnection {
  connected: boolean;
  user: AcrUser | null;
  error: string | null;
}

export interface AcrState {
  scopeId: string;
  connection: AcrConnection;
  snapshot: AcrSnapshot | null;
  progress: AcrProgress | null;
  configuredAccounts: number;
  coverageChanged: boolean;
  cacheError: string | null;
}
