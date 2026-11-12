import { useState } from "react";
import type { RunEntry } from "../../../shared/types";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { formatDateTime, formatDuration, formatNumber } from "../../lib/format";
import { runTone } from "../../lib/status";
import { HistoryRunDrawer } from "./HistoryRunDrawer";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";

interface HistoryTabProps {
  accountId: string;
  runs: RunEntry[];
}

export function HistoryTab({ accountId, runs }: HistoryTabProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const filtered = runs.filter(run => [run.runId, run.ok ? run.baseline ? "baseline" : "success" : "failed", run.error]
    .join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No fetch history yet"
        description="Run a fetch to start building this account's history."
      />
    );
  }

  return (
    <div className="history-tab">
      <div className="history-account-heading"><div><h2>Every saved fetch</h2>
        <p>{runs.filter(run => run.ok).length} successful fetches, {runs.filter(run => !run.ok).length} failed attempts.
          Reviewed changes remain available. All new snapshots are retained in the encrypted vault.</p></div>
        <Button variant="secondary" disabled={!runs.some(run => run.ok)} onClick={() => setSelected(runs.find(run => run.ok)!.runId)}>Explore latest fetch</Button>
      </div>
      <TextField label="Search fetch history" value={search} onChange={event => setSearch(event.target.value)} placeholder="Date, success, baseline, failed, or error" />
      <p className="field-hint">Open a successful fetch to explore changes and captured milestones using Oldest / Previous / Next / Latest.</p>
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Result</th>
            <th>Duration</th>
            <th>Added</th>
            <th>Modified</th>
            <th>Disappeared</th>
            <th>Total</th>
            <th><span className="sr-only">Inspect fetch</span></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((run) => (
            <tr key={run.runId}>
              <td>{formatDateTime(run.at)}</td>
              <td>
                <Badge tone={runTone(run.ok)}>
                  {run.ok ? (run.baseline ? "Baseline" : "Success") : "Failed"}
                </Badge>
                {run.error ? <p className="field-hint">{run.error}</p> : null}
              </td>
              <td>{formatDuration(run.durationMs)}</td>
              <td>{run.counts ? formatNumber(run.counts.added) : "-"}</td>
              <td>
                {run.counts
                  ? formatNumber(run.counts.modified + run.counts.unwatchedOnly)
                  : "-"}
              </td>
              <td>{run.counts ? formatNumber(run.counts.disappeared) : "-"}</td>
              <td>{run.counts ? formatNumber(run.counts.total) : "-"}</td>
              <td>{run.ok ? <Button variant="ghost" onClick={() => setSelected(run.runId)}>Inspect fetch</Button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {filtered.length === 0 ? <EmptyState title="No matching fetches" description="Broaden the date or result search." /> : null}
      {selected ? <HistoryRunDrawer selection={{ accountId, runId: selected }} onChange={next => setSelected(next.runId)} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
