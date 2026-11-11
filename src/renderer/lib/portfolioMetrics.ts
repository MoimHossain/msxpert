import type { AccountOverview } from "../../shared/types";

const STALE_DAYS = 14;

export function isStale(account: AccountOverview): boolean {
  if (!account.lastRun || !account.lastRun.ok) return account.lastRun == null;
  const ageMs = Date.now() - new Date(account.lastRun.at).getTime();
  return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

export function isFailed(account: AccountOverview): boolean {
  return account.lastRun != null && !account.lastRun.ok;
}

export function staleAccountCount(accounts: AccountOverview[]): number {
  return accounts.filter(isStale).length;
}

export function failedAccountCount(accounts: AccountOverview[]): number {
  return accounts.filter(isFailed).length;
}

export function unreviewedAccountCount(accounts: AccountOverview[]): number {
  return accounts.filter((account) => account.pendingChanges > 0).length;
}

export const STALE_THRESHOLD_DAYS = STALE_DAYS;
