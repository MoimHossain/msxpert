export interface BreakdownItem {
  label: string;
  count: number;
}

/**
 * Groups by `keyFn`, sorts descending by count, and folds anything past `limit`
 * into a single "Other" bucket so long tails (e.g. many child accounts) stay readable.
 */
export function groupCount<T>(
  items: T[],
  keyFn: (item: T) => string | null,
  limit = 8,
): BreakdownItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item) ?? "Unspecified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit);
  const otherCount = sorted.slice(limit).reduce((sum, item) => sum + item.count, 0);
  return [...head, { label: "Other", count: otherCount }];
}
