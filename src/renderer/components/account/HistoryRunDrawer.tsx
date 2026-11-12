import { useEffect, useState } from "react";
import type { HistoryRun, HistorySelection } from "../../../shared/history";
import { SidePanel } from "../ui/SidePanel";
import { Button } from "../ui/Button";
import { Tabs } from "../ui/Tabs";
import { Spinner } from "../ui/Spinner";
import { ErrorBanner } from "../ui/ErrorBanner";
import { ChangeList } from "../changes/ChangeList";
import { MilestoneTable } from "./MilestoneTable";
import { formatDateTime, formatDuration, formatNumber } from "../../lib/format";

export function HistoryRunDrawer({ selection, onChange, onClose }: {
  selection: HistorySelection; onChange: (selection: HistorySelection) => void; onClose: () => void;
}) {
  const [data, setData] = useState<HistoryRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("changes");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    void window.desktop.getHistoryRun(selection).then(next => { if (active) setData(next); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection.accountId, selection.runId, retry]);
  const runs = data?.account.id === selection.accountId ? data.runs : [];
  const index = runs.findIndex(run => run.runId === selection.runId);
  const move = (index: number) => { if (runs[index]) onChange({ ...selection, runId: runs[index].runId }); };
  const ready = !loading && !error && data?.account.id === selection.accountId && data.run.runId === selection.runId ? data : null;
  return <SidePanel title="Fetch history" wide onClose={onClose}>
    <div className="history-run-navigation" role="group" aria-label="Fetch history navigation">
      <Button variant="secondary" disabled={index < 0 || index === runs.length - 1} onClick={() => move(runs.length - 1)}>Oldest</Button>
      <Button variant="secondary" disabled={index < 0 || index === runs.length - 1} onClick={() => move(index + 1)}>Previous</Button>
      <span>{index >= 0 ? `${runs.length - index} of ${runs.length} successful fetches` : "Loading fetch..."}</span>
      <Button variant="secondary" disabled={index <= 0} onClick={() => move(index - 1)}>Next</Button>
      <Button variant="secondary" disabled={index <= 0} onClick={() => move(0)}>Latest</Button>
    </div>
    <p className="history-run-date">{formatDateTime(selection.runId)}</p>
    <p className="field-hint">Read-only saved history. Browsing does not refresh MSX or mark changes reviewed.</p>
    {loading ? <Spinner label="Loading saved fetch..." /> : error ? <ErrorBanner message={error} onRetry={() => setRetry(value => value + 1)} /> : ready ? <>
      <div className="history-run-summary" data-run-id={ready.run.runId}>
        <h2>{ready.account.name}</h2><p>{ready.changes.baseline ? "Baseline capture" : "Successful fetch"}
          {" | "}{formatDuration(ready.run.durationMs)}{" | "}{ready.scope.label}: {ready.scope.dateFrom} to {ready.scope.dateTo}</p>
        <div className="history-run-counts">
          <strong>{formatNumber(ready.changes.counts.total)} milestones captured</strong>
          <span>{ready.changes.counts.added} new</span><span>{ready.changes.counts.modified} changed</span>
          <span>{ready.changes.counts.unwatchedOnly} other edits</span><span>{ready.changes.counts.disappeared} outside scope</span>
        </div>
      </div>
      <Tabs active={tab} onChange={setTab} ariaLabel="Historical fetch content" tabs={[
        { id: "changes", label: "Changes in this fetch" }, { id: "snapshot", label: "Captured milestones", badge: ready.changes.counts.total },
      ]} />
      <div className="tab-panel">
        {tab === "snapshot" ? ready.milestones ?
          <MilestoneTable key={selection.runId} milestones={ready.milestones} history={selection} /> :
          <ErrorBanner message="This snapshot was pruned by an older version. Its saved changes are still available. All new snapshots are now retained." /> :
          ready.changes.baseline ? <div className="history-baseline">
            <h3>The first saved position, not a change event</h3>
            <p>This fetch established a baseline of {ready.changes.counts.total} milestones. There is no earlier position to compare.</p>
            <Button variant="secondary" onClick={() => setTab("snapshot")}>Browse captured milestones</Button>
          </div> : <ChangeList key={selection.runId} changes={{ ...ready.changes, churn: [] }} />}
      </div>
    </> : null}
  </SidePanel>;
}
