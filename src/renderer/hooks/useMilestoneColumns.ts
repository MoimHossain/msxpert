import { useEffect, useRef, useState } from "react";
import { SORT_KEYS, type MilestoneSortKey } from "../../shared/milestones";
import { useToast } from "../state/ToastProvider";

export const COLUMN_LABELS: Record<MilestoneSortKey, string> = {
  name: "Milestone", number: "Number", date: "Date", status: "Status", commitment: "Commitment",
  monthlyUse: "Monthly use", ownerName: "Owner", createdByName: "Raised By", portfolioAccountName: "Portfolio account",
  creatorOrg: "Creator org", ownerOrg: "Owner org",
  accountName: "MSX account", solutionArea: "Solution area", azureRegion: "Azure region",
  workload: "Workload", opportunityName: "Opportunity",
};
const DEFAULT_WIDTHS: Record<MilestoneSortKey, number> = {
  name: 360, number: 145, date: 130, status: 140, commitment: 155, monthlyUse: 155,
  ownerName: 220, createdByName: 220, portfolioAccountName: 230, accountName: 230, solutionArea: 190,
  creatorOrg: 150, ownerOrg: 150,
  azureRegion: 180, workload: 210, opportunityName: 250,
};
const STORAGE_KEY = "csu-console-milestone-columns-v1";
export const COLUMN_KEYS = [...SORT_KEYS, "actions"] as const;
export type MilestoneColumnKey = typeof COLUMN_KEYS[number];
interface ColumnLayout { widths: Record<MilestoneSortKey, number>; frozen: MilestoneSortKey | "none"; hidden: MilestoneColumnKey[] }
const defaults = (): ColumnLayout => ({ widths: { ...DEFAULT_WIDTHS }, frozen: "name", hidden: [] });
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const minimumWidth = (key: MilestoneSortKey) => key === "name" ? 180 : 90;

export function readMilestoneColumnLayout(text: string): ColumnLayout {
  const parsed: unknown = JSON.parse(text);
  if (!record(parsed) || !record(parsed.widths)) throw new Error("Invalid column layout.");
  const frozen = parsed.frozen === "none" ? "none" : SORT_KEYS.find(key => key === parsed.frozen);
  if (!frozen) throw new Error("Invalid frozen column.");
  const widths = { ...DEFAULT_WIDTHS };
  for (const key of SORT_KEYS) {
    const width = parsed.widths[key];
    // Added columns must not discard an older saved layout.
    if (["createdByName", "creatorOrg", "ownerOrg"].includes(key) && width === undefined) continue;
    if (typeof width !== "number" || !Number.isFinite(width)) throw new Error("Invalid column width.");
    widths[key] = Math.max(minimumWidth(key), Math.min(900, width));
  }
  const savedHidden = parsed.hidden;
  if (savedHidden !== undefined && (!Array.isArray(savedHidden) ||
    savedHidden.some(key => !COLUMN_KEYS.some(column => column === key)) ||
    new Set(savedHidden).size !== savedHidden.length || savedHidden.length >= COLUMN_KEYS.length)) {
    throw new Error("Invalid column visibility.");
  }
  const hidden = COLUMN_KEYS.filter(key => savedHidden?.includes(key));
  return { widths, frozen, hidden };
}

export function useMilestoneColumns() {
  const { notify } = useToast();
  const [layout, setLayout] = useState(defaults);
  const current = useRef(layout);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        current.current = readMilestoneColumnLayout(saved);
        setLayout(current.current);
      }
    } catch { notify("Saved milestone column layout could not be loaded. Defaults are shown.", "warning"); }
  }, [notify]);

  const update = (next: ColumnLayout, persist: boolean) => {
    current.current = next;
    setLayout(next);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
      catch { notify("Column layout changed, but could not be saved on this device.", "warning"); }
    }
  };
  return {
    ...layout,
    columns: (layout.frozen === "none" ? [...SORT_KEYS] : [layout.frozen, ...SORT_KEYS.filter(key => key !== layout.frozen)])
      .filter(key => !layout.hidden.includes(key)),
    showActions: !layout.hidden.includes("actions"),
    setVisible: (key: MilestoneColumnKey, visible: boolean) => {
      const hidden = visible ? current.current.hidden.filter(value => value !== key) :
        [...new Set([...current.current.hidden, key])];
      if (hidden.length === COLUMN_KEYS.length) {
        notify("Keep at least one milestone column visible.", "warning");
        return;
      }
      update({ ...current.current, hidden }, true);
    },
    resize: (key: MilestoneSortKey, width: number, persist = false) =>
      update({ ...current.current, widths: { ...current.current.widths, [key]: Math.max(minimumWidth(key), Math.min(900, width)) } }, persist),
    commit: () => update(current.current, true),
    resetWidth: (key: MilestoneSortKey) => update({ ...current.current, widths: { ...current.current.widths, [key]: DEFAULT_WIDTHS[key] } }, true),
    freeze: (key: MilestoneSortKey | "none") => update({
      ...current.current, frozen: key, hidden: current.current.hidden.filter(value => value !== key),
    }, true),
    reset: () => update(defaults(), true),
  };
}
