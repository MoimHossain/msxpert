import type { RunEntry } from "../../shared/types";

/** Grouped integer, e.g. 12345 -> "12,345". Returns a placeholder for null/undefined. */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * Aggregate monthly-use totals have no server-formatted companion field, unlike
 * per-milestone `monthlyUseFormatted`. MSX consumption figures are USD, matching
 * the existing Copilot canvas convention.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeToNow(value: string | null | undefined): string {
  if (!value) return "Never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const diffMs = Date.now() - then;
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function lastRunLabel(run: RunEntry | null | undefined): string {
  if (!run) return "Never fetched";
  if (!run.ok) return `Failed ${formatRelativeToNow(run.at)}`;
  return `${run.baseline ? "Baseline " : ""}${formatRelativeToNow(run.at)}`;
}

export function classNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}
