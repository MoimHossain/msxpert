import { useMemo, useState } from "react";
import type { MilestoneRow } from "../../../shared/types";
import { StatCard } from "../ui/StatCard";
import { BreakdownList } from "../ui/BreakdownList";
import { MilestoneTable } from "./MilestoneTable";
import { formatCurrency, formatNumber } from "../../lib/format";
import { groupCount } from "../../lib/breakdown";
import { monthKey, monthLabel } from "../../../domain/milestone-view";

interface AccountDashboardTabProps {
  milestones: MilestoneRow[];
}

export function AccountDashboardTab({ milestones }: AccountDashboardTabProps) {
  const [drilldown, setDrilldown] = useState<
    "all" | "onTrack" | "atRisk" | "blocked" | "committed" | "uncommitted" | null
  >(null);

  const summary = useMemo(() => {
    const onTrack = milestones.filter((m) => m.status === "On Track").length;
    const atRisk = milestones.filter((m) => m.status === "At Risk").length;
    const blocked = milestones.filter((m) => m.status === "Blocked").length;
    const committed = milestones.filter((m) => m.commitment === "Committed").length;
    const uncommitted = milestones.filter((m) => m.commitment === "Uncommitted").length;
    const monthlyUse = milestones.reduce((sum, m) => sum + (m.monthlyUse ?? 0), 0);
    const owners = new Set(milestones.map((m) => m.ownerId).filter(Boolean)).size;
    return { onTrack, atRisk, blocked, committed, uncommitted, monthlyUse, owners };
  }, [milestones]);

  const drilldownConfig = {
    all: { title: "All milestones", filters: {} },
    onTrack: { title: "On track milestones", filters: { status: "On Track" } },
    atRisk: { title: "At risk milestones", filters: { status: "At Risk" } },
    blocked: { title: "Blocked milestones", filters: { status: "Blocked" } },
    committed: { title: "Committed milestones", filters: { commitment: "Committed" } },
    uncommitted: {
      title: "Uncommitted milestones",
      filters: { commitment: "Uncommitted" },
    },
  } as const;

  const openDrilldown = (next: NonNullable<typeof drilldown>) => {
    setDrilldown((current) => (current === next ? null : next));
  };

  const byStatus = useMemo(() => groupCount(milestones, (m) => m.status), [milestones]);
  const byOwner = useMemo(() => groupCount(milestones, (m) => m.ownerName), [milestones]);
  const byMonth = useMemo(
    () =>
      groupCount(milestones, (m) => monthKey(m.date) || null, 12).map((item) => ({
        ...item,
        label: item.label === "Unspecified" ? "No date" : monthLabel(item.label),
      })),
    [milestones],
  );
  const bySolutionArea = useMemo(
    () => groupCount(milestones, (m) => m.solutionArea),
    [milestones],
  );
  const byChildAccount = useMemo(
    () => groupCount(milestones, (m) => m.accountName),
    [milestones],
  );
  const byAzureRegion = useMemo(
    () => groupCount(milestones, (m) => m.azureRegion),
    [milestones],
  );

  if (milestones.length === 0) {
    return <p className="field-hint">No milestones in the current window yet.</p>;
  }

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="On track" value={formatNumber(summary.onTrack)} tone="positive" onClick={() => openDrilldown("onTrack")} active={drilldown === "onTrack"} />
        <StatCard label="At risk" value={formatNumber(summary.atRisk)} tone="warning" onClick={() => openDrilldown("atRisk")} active={drilldown === "atRisk"} />
        <StatCard label="Blocked" value={formatNumber(summary.blocked)} tone="critical" onClick={() => openDrilldown("blocked")} active={drilldown === "blocked"} />
        <StatCard label="Committed" value={formatNumber(summary.committed)} tone="info" onClick={() => openDrilldown("committed")} active={drilldown === "committed"} />
        <StatCard label="Uncommitted" value={formatNumber(summary.uncommitted)} tone="warning" onClick={() => openDrilldown("uncommitted")} active={drilldown === "uncommitted"} />
        <StatCard label="Monthly use" value={formatCurrency(summary.monthlyUse)} onClick={() => openDrilldown("all")} active={drilldown === "all"} />
        <StatCard label="Distinct owners" value={formatNumber(summary.owners)} tone="info" onClick={() => openDrilldown("all")} active={drilldown === "all"} />
      </div>
      {drilldown ? (
        <section className="metric-drilldown" aria-live="polite">
          <div className="metric-drilldown-header">
            <div>
              <h2>{drilldownConfig[drilldown].title}</h2>
              <p>Use the filters and sortable columns to explore the underlying data.</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setDrilldown(null)}>
              Close
            </button>
          </div>
          <MilestoneTable
            key={drilldown}
            milestones={milestones}
            initialFilters={drilldownConfig[drilldown].filters}
          />
        </section>
      ) : null}
      <div className="breakdown-grid">
        <BreakdownList title="By status" items={byStatus} />
        <BreakdownList title="By owner" items={byOwner} />
        <BreakdownList title="By month" items={byMonth} />
        <BreakdownList title="By solution area" items={bySolutionArea} />
        <BreakdownList title="By child account" items={byChildAccount} />
        <BreakdownList title="By Azure region" items={byAzureRegion} />
      </div>
    </div>
  );
}
