import type { RunEntry } from "../../../shared/types";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { formatDateTime, formatDuration, formatNumber } from "../../lib/format";
import { runTone } from "../../lib/status";

interface HistoryTabProps {
  runs: RunEntry[];
}

export function HistoryTab({ runs }: HistoryTabProps) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No fetch history yet"
        description="Run a fetch to start building this account's history."
      />
    );
  }

  return (
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
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
