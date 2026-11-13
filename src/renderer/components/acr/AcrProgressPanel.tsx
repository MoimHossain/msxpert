import { useEffect, useState } from "react";
import type { AcrProgress } from "../../../shared/acr";
import { SidePanel } from "../ui/SidePanel";
import { Button } from "../ui/Button";

const LABELS = { access: "Checking Power BI access", fetching: "Fetching account ACR",
  saving: "Saving complete snapshot", complete: "ACR fetch complete", failed: "Fetch failed", cancelled: "Fetch cancelled" };

export function AcrProgressPanel({ progress, onClose, onCancel }: {
  progress: AcrProgress | null; onClose: () => void; onCancel: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!progress?.running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress?.running]);
  const elapsed = progress ? Math.max(0, Math.floor(((progress.finishedAt ? Date.parse(progress.finishedAt) : now)
    - Date.parse(progress.startedAt)) / 1000)) : 0;
  return <SidePanel title="ACR fetch progress" onClose={onClose}>
    <div className="fetch-progress-panel" data-acr-phase={progress?.phase ?? "starting"}>
      <p className="field-hint">Closing this drawer does not stop the fetch. Your last good snapshot stays available until every permitted account succeeds.</p>
      <div className="fetch-overall" role="status" aria-live="polite">
        <h2>{progress ? LABELS[progress.phase] : "Preparing Power BI query"}</h2>
        <p>{progress?.completed ?? 0} / {progress?.total ?? 0} accounts
          {" | "}{Math.floor(elapsed / 60)}m {elapsed % 60}s elapsed</p>
        <progress aria-label="ACR accounts processed" value={progress?.completed ?? 0} max={Math.max(1, progress?.total ?? 1)} />
      </div>
      {progress?.error ? <p className="field-error" role="alert">{progress.error}</p> : null}
      <ul className="fetch-account-list">{progress?.active.map(account => <li key={account.tpid}
        className="fetch-account-active" data-acr-fetch-account={account.tpid}>
        <strong>{account.name}</strong>
        <div className="account-fetch-track" role="progressbar" aria-label={`Fetching ACR for ${account.name}`}
          aria-valuetext={`${account.fiscalYear}, ${account.pages} pages, ${account.rows} rows`}><span /></div>
        <p>TPID {account.tpid} | {account.fiscalYear} | {account.pages} pages | {account.rows.toLocaleString()} rows</p>
      </li>)}</ul>
      {progress?.failures.length ? <section><h3>Failed accounts</h3><ul className="acr-issues">
        {progress.failures.map(failure => <li key={failure.account.tpid}><strong>{failure.account.name}</strong>
          <p>{failure.error}</p></li>)}</ul></section> : null}
      {progress?.skipped.length ? <details><summary>{progress.skipped.length} accounts outside Power BI entitlement</summary>
        <ul>{progress.skipped.map(account => <li key={account.tpid}>{account.name} (TPID {account.tpid})</li>)}</ul></details> : null}
      {progress?.running ? <Button onClick={onCancel}>Cancel ACR fetch</Button> : null}
    </div>
  </SidePanel>;
}
