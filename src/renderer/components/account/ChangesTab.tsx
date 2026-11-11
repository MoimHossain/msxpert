import { useState } from "react";
import type { AccountState, GoneReason, MilestoneSummary, ModifiedMilestone } from "../../../shared/types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorBanner } from "../ui/ErrorBanner";
import { formatDate, formatDateTime } from "../../lib/format";
import { statusTone } from "../../lib/status";
import {
  fieldLabel,
  formatFieldValue,
  hasOutstandingChanges,
  unwatchedModifications,
  watchedModifications,
} from "../../lib/changes";

interface ChangesTabProps {
  since: AccountState["since"];
  reviewedThrough: string | null;
  hasRuns: boolean;
  onMarkReviewed: () => Promise<void>;
}

function MilestoneLine({ milestone }: { milestone: MilestoneSummary }) {
  return (
    <div className="change-row">
      <div>
        <p className="change-row-name">{milestone.name ?? milestone.number ?? "Untitled"}</p>
        <p className="change-row-meta">
          {milestone.accountName ?? "Unknown account"}
          {milestone.ownerName ? ` - ${milestone.ownerName}` : ""}
          {milestone.date ? ` - ${formatDate(milestone.date)}` : ""}
        </p>
      </div>
      {milestone.status ? (
        <Badge tone={statusTone(milestone.status)}>{milestone.status}</Badge>
      ) : null}
    </div>
  );
}

function FieldDiffList({ fields }: { fields: ModifiedMilestone["fields"] }) {
  return (
    <ul className="field-diff-list">
      {fields.map((change) => (
        <li key={change.field}>
          <strong>{fieldLabel(change.field)}:</strong>{" "}
          <span className="diff-before">{formatFieldValue(change.before)}</span>
          <span aria-hidden="true"> -&gt; </span>
          <span className="diff-after">{formatFieldValue(change.after)}</span>
        </li>
      ))}
    </ul>
  );
}

function ModifiedRow({ milestone }: { milestone: ModifiedMilestone }) {
  return (
    <div className="change-card">
      <MilestoneLine milestone={milestone} />
      <FieldDiffList fields={milestone.fields} />
    </div>
  );
}

function goneSummary(gone: GoneReason | undefined): string {
  if (!gone) return "No longer matches the current scope.";
  return gone.summary;
}

function DisappearedRow({ milestone }: { milestone: MilestoneSummary }) {
  return (
    <div className="change-card">
      <MilestoneLine milestone={milestone} />
      <p className="change-row-reason">{goneSummary(milestone.gone)}</p>
      {milestone.gone && milestone.gone.causes.length > 0 ? (
        <ul className="field-diff-list">
          {milestone.gone.causes.map((cause) => (
            <li key={cause}>{cause}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ChangesTab({ since, reviewedThrough, hasRuns, onMarkReviewed }: ChangesTabProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watched = watchedModifications(since);
  const unwatched = unwatchedModifications(since);
  const outstanding = hasOutstandingChanges(since);

  const handleMarkReviewed = async () => {
    setBusy(true);
    setError(null);
    try {
      await onMarkReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="changes-tab">
      <div className="changes-toolbar">
        <p className="field-hint">
          {reviewedThrough
            ? `Reviewed through ${formatDateTime(reviewedThrough)}`
            : "Never reviewed"}
          {since.runCount > 0 ? ` - folding ${since.runCount} run(s) since then` : ""}
        </p>
        <Button
          variant="primary"
          busy={busy}
          disabled={!hasRuns || !outstanding}
          onClick={() => void handleMarkReviewed()}
        >
          Mark reviewed
        </Button>
      </div>
      {error ? <ErrorBanner message={error} /> : null}

      {!hasRuns ? (
        <EmptyState
          title="Nothing fetched yet"
          description="Fetch this account to see change history."
        />
      ) : !outstanding ? (
        <EmptyState
          title="No outstanding changes"
          description="Everything is folded in since the last review."
        />
      ) : (
        <>
          {since.added.length > 0 ? (
            <section>
              <h3>Added ({since.added.length})</h3>
              {since.added.map((milestone) => (
                <MilestoneLine key={milestone.id} milestone={milestone} />
              ))}
            </section>
          ) : null}

          {watched.length > 0 ? (
            <section>
              <h3>Modified ({watched.length})</h3>
              {watched.map((milestone) => (
                <ModifiedRow key={milestone.id} milestone={milestone} />
              ))}
            </section>
          ) : null}

          {unwatched.length > 0 ? (
            <section>
              <h3>Updated without watched-field changes ({unwatched.length})</h3>
              <p className="field-hint">
                The Dataverse record version changed, but none of the fields CSU Console
                watches were affected.
              </p>
              {unwatched.map((milestone) => (
                <MilestoneLine key={milestone.id} milestone={milestone} />
              ))}
            </section>
          ) : null}

          {since.disappeared.length > 0 ? (
            <section>
              <h3>No longer in scope ({since.disappeared.length})</h3>
              {since.disappeared.map((milestone) => (
                <DisappearedRow key={milestone.id} milestone={milestone} />
              ))}
            </section>
          ) : null}

          {since.churn.length > 0 ? (
            <section>
              <h3>Churn ({since.churn.length})</h3>
              <p className="field-hint">
                These milestones changed and then changed back since the last review.
              </p>
              {since.churn.map((milestone) => (
                <ModifiedRow key={milestone.id} milestone={milestone} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
