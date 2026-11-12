import { useState } from "react";
import type { AccountState } from "../../../shared/types";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorBanner } from "../ui/ErrorBanner";
import { ChangeList } from "../changes/ChangeList";
import { formatDateTime } from "../../lib/format";
import { hasOutstandingChanges } from "../../lib/changes";

interface ChangesTabProps {
  since: AccountState["since"];
  reviewedThrough: string | null;
  hasRuns: boolean;
  onMarkReviewed: () => Promise<void>;
}

export function ChangesTab({ since, reviewedThrough, hasRuns, onMarkReviewed }: ChangesTabProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outstanding = hasOutstandingChanges(since);
  const markReviewed = async () => {
    setBusy(true); setError(null);
    try { await onMarkReviewed(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <div className="changes-tab">
    <div className="changes-toolbar">
      <div><p>{reviewedThrough ? `Reviewed through ${formatDateTime(reviewedThrough)}` : "Never reviewed"}</p>
        <p className="field-hint">{since.runCount} fetches folded into this view.
          {since.fromRunId && since.toRunId ? ` ${formatDateTime(since.fromRunId)} to ${formatDateTime(since.toRunId)}.` : ""}
          {" "}Reviewing clears the queue, not the saved history.</p></div>
      <Button variant="primary" busy={busy} disabled={!hasRuns || !outstanding} onClick={() => void markReviewed()}>Mark reviewed</Button>
    </div>
    {error ? <ErrorBanner message={error} /> : null}
    {!hasRuns ? <EmptyState title="Nothing fetched yet" description="Fetch this account to start recording changes." /> :
      !outstanding ? <EmptyState title="No outstanding changes" description="Everything is reviewed. Previous changes remain available in History." /> :
        <ChangeList changes={since} />}
  </div>;
}
