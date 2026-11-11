import { useEffect, useState } from "react";
import type {
  TerritoryImportPreview, TerritoryImportProgress, TerritoryImportResult,
} from "../../../shared/types";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { ErrorBanner } from "../ui/ErrorBanner";
import { useUpdateBlocker } from "../../state/UpdateProvider";

interface TerritoryImportProps {
  territoryIds: string[];
  onDone: () => Promise<void>;
  onBack: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function TerritoryImport({ territoryIds, onDone, onBack, onBusyChange }: TerritoryImportProps) {
  const [preview, setPreview] = useState<TerritoryImportPreview | null>(null);
  const [progress, setProgress] = useState<TerritoryImportProgress | null>(null);
  const [result, setResult] = useState<TerritoryImportResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const selectionKey = territoryIds.join(",");
  useUpdateBlocker(busy || preview !== null);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => window.desktop.onTerritoryImportProgress(setProgress), []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setPreview(null);
    setResult(null);
    setProgress(null);
    window.desktop.previewTerritoryImport(selectionKey.split(",")).then((preview) => {
      if (!cancelled) setPreview(preview);
    }).catch((error: unknown) => {
      if (!cancelled) setError(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [selectionKey, retry]);

  const runImport = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try { setResult(await window.desktop.importTerritories(preview.id)); } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true);
    try { await onDone(); } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };
  const issues = [...(preview?.unresolved ?? []), ...(result?.failures ?? [])];

  return <div className="territory-import">
    <h2>{result ? "Import complete" : "Review top-parent accounts"}</h2>
    {!preview && busy ? <Spinner label="Paging territory accounts and resolving top parents..." /> : null}
    {error ? <ErrorBanner message={error} onRetry={() => setRetry((current) => current + 1)} /> : null}
    {preview ? <>
      <p className="import-summary">
        <strong>{preview.territories.length}</strong> territories, <strong>{preview.accounts.length}</strong> unique top-parent accounts,
        {" "}<strong>{preview.alreadyPresent}</strong> already present.
        {" "}<strong>{preview.accounts.length - preview.alreadyPresent}</strong> to add.
      </p>
      <ul className="import-accounts">
        {preview.accounts.map((account) => <li key={account.tpid}>
          <strong>{account.name}</strong> - TPID {account.tpid}
          {account.alreadyPresent ? " (already present; will skip)" : ""}
        </li>)}
      </ul>
      {issues.length > 0 ? <div className="callout callout-warning" role="status">
        <p>{issues.length} unresolved or failed account(s). These were not silently added.</p>
        <ul>{issues.map((issue, index) => <li key={`${issue.id}-${index}`}>{issue.name}: {issue.message}</li>)}</ul>
      </div> : null}
      {progress ? <div role="status" aria-live="polite">
        <progress value={progress.completed} max={Math.max(1, progress.total)} aria-label="Account import progress" />
        <p>{progress.completed} / {progress.total} processed; {progress.added} added, {progress.skipped} skipped, {progress.failed} failed.</p>
      </div> : null}
      {result ? <p role="status">Added {result.added}; skipped {result.skipped}; failed {result.failures.length}.</p> : null}
      <div className="onboarding-actions">
        {!result ? <Button variant="primary" busy={busy} disabled={Boolean(error)} onClick={() => void runImport()}>
          Confirm and import top parents
        </Button> : <Button variant="primary" busy={busy} onClick={() => void finish()}>
          {issues.length ? "Finish with imported accounts" : "Open workspace"}
        </Button>}
        {result && issues.length ? <Button disabled={busy} onClick={() => setRetry((current) => current + 1)}>Preview remaining accounts</Button> : null}
      </div>
    </> : null}
    <Button variant="ghost" disabled={busy} onClick={onBack}>Back to territories</Button>
  </div>;
}
