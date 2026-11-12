import { useCallback, useEffect, useState } from "react";
import type { MilestoneDataset } from "../../../shared/milestones";
import { useNavigation } from "../../state/NavigationProvider";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { ErrorBanner } from "../ui/ErrorBanner";
import { EmptyState } from "../ui/EmptyState";
import { MilestoneTable } from "../account/MilestoneTable";

export function MilestonesView() {
  const [dataset, setDataset] = useState<MilestoneDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { navigate } = useNavigation();
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setDataset(await window.desktop.getMilestones()); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="milestones-page">
      <PageHeader title="Milestones" subtitle="Explore the latest saved MSX milestones across your portfolio."
        actions={<Button variant="secondary" busy={loading} onClick={() => void load()}>Reload saved data</Button>} />
      <p className="field-hint">Search, grouping and exports work locally. Use Portfolio &gt; Fetch all to capture changes from MSX.</p>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && !dataset ? <Spinner label="Loading saved milestones..." /> : null}
      {dataset ? <>
        <p className="field-hint">Configured window: {dataset.scope.label} ({dataset.scope.dateFrom} to {dataset.scope.dateTo}).
          Saved captures may reflect an earlier scope until refreshed.</p>
        {dataset.milestones.some(row => !row.createdById && !row.createdByName) ? <p className="field-hint">
          Raised By is unavailable for some saved records. Use Portfolio &gt; Fetch to capture creator details where MSX provides them.
        </p> : null}
        {dataset.missingAccountIds.length ? <p className="callout callout-warning" role="status">
          {dataset.missingAccountIds.length} of {dataset.accountIds.length} tracked accounts have no saved capture. Fetch them from Portfolio for complete coverage.
        </p> : null}
        {!dataset.accountIds.length ? <EmptyState title="No tracked accounts" description="Add a customer in Portfolio to start capturing milestones."
          action={<Button variant="secondary" onClick={() => navigate({ name: "portfolio" })}>Go to Portfolio</Button>} /> :
          !dataset.milestones.length ? <EmptyState title="No saved milestones" description="Fetch tracked accounts from Portfolio, or review the configured milestone window." /> :
            <MilestoneTable milestones={dataset.milestones} />}
      </> : null}
    </div>
  );
}
