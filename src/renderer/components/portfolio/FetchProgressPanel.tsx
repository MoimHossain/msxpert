import { FETCH_STAGE_LABELS, isAccountFetching, type FetchProgress } from "../../../shared/fetch";
import { SidePanel } from "../ui/SidePanel";
import { Badge } from "../ui/Badge";
import { formatNumber } from "../../lib/format";

export function FetchProgressPanel({ progress, onClose }: { progress: FetchProgress | null; onClose: () => void }) {
  const active = progress?.accounts.find(isAccountFetching);
  const failed = progress?.accounts.filter(row => row.stage === "failed").length ?? 0;
  return <SidePanel title="Fetch progress" onClose={onClose}>
    <div className="fetch-progress-panel">
      <p className="field-hint">Closing this panel does not stop the fetch. You can reopen it from the progress button.</p>
      <div className="fetch-overall" role="status" aria-live="polite">
        <h2>{progress?.running ? active?.name ?? "Preparing accounts..." : progress ?
          failed ? `Finished with ${failed} failed account(s)` : "Fetch complete" : "Starting fetch..."}</h2>
        <p>{progress?.completed ?? 0} of {progress?.total ?? 0} accounts processed</p>
        <progress aria-label="Accounts processed" value={progress?.completed ?? 0} max={Math.max(1, progress?.total ?? 1)} />
      </div>
      <ol className="fetch-account-list">{progress?.accounts.map(row => <li key={row.accountId}
        data-fetch-account={row.accountId} className={isAccountFetching(row) ? "fetch-account-active" : ""}>
        <div><strong>{row.name}</strong><Badge tone={row.stage === "failed" ? "critical" : row.stage === "complete" ? "positive" : "info"}>
          {FETCH_STAGE_LABELS[row.stage]}</Badge></div>
        {isAccountFetching(row) ? <div className="account-fetch-track" role="progressbar"
          aria-label={`Fetching ${row.name}`} aria-valuetext={FETCH_STAGE_LABELS[row.stage]}><span /></div> : null}
        {row.stage !== "queued" ? <p>{formatNumber(row.accountRecords)} accounts in tree
          {" | "}{formatNumber(row.milestones)} milestones{" | "}{formatNumber(row.pages)} pages read
          {row.changes !== null ? ` | ${formatNumber(row.changes)} changes` : ""}</p> : null}
        {row.error ? <p className="field-error" role="alert">{row.error}</p> : null}
      </li>)}</ol>
    </div>
  </SidePanel>;
}
