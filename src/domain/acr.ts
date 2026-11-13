import type { AcrAccount, AcrAccountSnapshot, AcrNode, AcrWindow } from "../shared/acr";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface AcrRow {
  month: string;
  acr: number;
  services: string[];
}

export function acrWindow(now = new Date()): AcrWindow {
  if (!Number.isFinite(now.getTime())) throw new Error("The ACR window needs a valid date.");
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const label = MONTHS[month];
    if (!label) throw new Error("The ACR window contains an invalid month.");
    const fiscalYear = year + (month >= 6 ? 1 : 0);
    return { key: `FY${String(fiscalYear).slice(-2)}-${label}`, label,
      year, provisional: index === 11 };
  });
  return { months, fiscalYear: months[11]!.key.slice(0, 4),
    fiscalYears: [...new Set(months.map(month => month.key.slice(0, 4)))] };
}

export function closedTrend(values: Record<string, number>, window: AcrWindow) {
  const closed = window.months.filter(month => !month.provisional);
  if (closed.length < 2) throw new Error("ACR trend needs two closed months.");
  const comparison = values[closed.at(-1)!.key] ?? 0;
  const prior = values[closed.at(-2)!.key] ?? 0;
  const delta = comparison - prior;
  const trend = prior ? delta / prior : null;
  if (!Number.isFinite(delta) || (trend !== null && !Number.isFinite(trend))) {
    throw new Error("Power BI ACR trend exceeded the numeric safety limit.");
  }
  return { delta, trend };
}

export function shapeAcrAccount(
  account: AcrAccount, rows: AcrRow[], window: AcrWindow, fetchedAt: string,
): AcrAccountSnapshot {
  const totals = Object.fromEntries(window.months.map(month => [month.key, 0]));
  const roots: AcrNode[] = [];
  const nodes = new Map<string, AcrNode>();
  for (const row of rows) {
    if (!Object.hasOwn(totals, row.month) || !Number.isFinite(row.acr) || row.services.length !== 5) {
      throw new Error("Power BI returned an invalid or out-of-window ACR row.");
    }
    totals[row.month] = (totals[row.month] ?? 0) + row.acr;
    const path: string[] = [];
    let parent: AcrNode | null = null;
    row.services.forEach((value, index) => {
      const name = value.trim();
      if (!name || /^(?:N\/?A|NOT APPLICABLE|\(BLANK\)|BLANK|-)$/i.test(name)) return;
      path.push(name);
      const key = JSON.stringify(path);
      let node = nodes.get(key);
      if (!node) {
        node = { key, name, level: index + 1, path: [...path], values: {}, total: 0,
          delta: 0, trend: null, children: [] };
        nodes.set(key, node);
        (parent ? parent.children : roots).push(node);
      }
      node.values[row.month] = (node.values[row.month] ?? 0) + row.acr;
      node.total += row.acr;
      parent = node;
    });
  }
  const finish = (siblings: AcrNode[]) => {
    for (const node of siblings) {
      if (!Number.isFinite(node.total) || Object.values(node.values).some(value => !Number.isFinite(value))) {
        throw new Error("Power BI ACR hierarchy exceeded the numeric safety limit.");
      }
      Object.assign(node, closedTrend(node.values, window));
      finish(node.children);
    }
    siblings.sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
  };
  finish(roots);
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || Object.values(totals).some(value => !Number.isFinite(value))) {
    throw new Error("Power BI ACR totals exceeded the numeric safety limit.");
  }
  return { account, totals, total, ...closedTrend(totals, window), rows: rows.length, hierarchy: roots, fetchedAt };
}
