import { useState } from "react";
import { useAccountState } from "../../hooks/useAccountState";
import { useAppData } from "../../state/AppDataProvider";
import { useNavigation, type AccountTab } from "../../state/NavigationProvider";
import { useToast } from "../../state/ToastProvider";
import { PageHeader } from "../ui/PageHeader";
import { Tabs } from "../ui/Tabs";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { ErrorBanner } from "../ui/ErrorBanner";
import { RemoveAccountDialog } from "../portfolio/RemoveAccountDialog";
import { AccountDashboardTab } from "./AccountDashboardTab";
import { MilestoneTable } from "./MilestoneTable";
import { ChangesTab } from "./ChangesTab";
import { HistoryTab } from "./HistoryTab";
import { lastRunLabel } from "../../lib/format";
import { pendingChangeCount } from "../../lib/changes";

interface AccountDetailViewProps {
  accountId: string;
  tab: AccountTab;
}

export function AccountDetailView({ accountId, tab }: AccountDetailViewProps) {
  const { data, loading, error, reload, markReviewed } = useAccountState(accountId);
  const { refreshOverview } = useAppData();
  const { navigate, goToAccount } = useNavigation();
  const { notify } = useToast();
  const [fetching, setFetching] = useState(false);
  const [removing, setRemoving] = useState(false);

  const runFetch = async () => {
    setFetching(true);
    try {
      const result = await window.desktop.fetchAccounts(accountId);
      const entry = result.accounts.find((item) => item.accountId === accountId);
      if (entry && !entry.ok) {
        notify(`Fetch failed: ${entry.error ?? "Unknown error"}`, "critical");
      } else {
        notify("Fetch complete.", "positive");
      }
      reload();
      void refreshOverview();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "critical");
    } finally {
      setFetching(false);
    }
  };

  if (loading && !data) {
    return <Spinner label="Loading account..." />;
  }
  if (error && !data) {
    return <ErrorBanner message={error} onRetry={reload} />;
  }
  if (!data) return null;

  const pending = pendingChangeCount(data.since);

  return (
    <div>
      <PageHeader
        title={data.account.name}
        subtitle={`TPID ${data.account.tpid} - ${data.scope.label} (${data.scope.dateFrom} to ${data.scope.dateTo}) - ${lastRunLabel(
          data.runs[0] ?? null,
        )}`}
        breadcrumb={[
          { label: "Portfolio", onClick: () => navigate({ name: "portfolio" }) },
          { label: data.account.name },
        ]}
        actions={
          <>
            <Button variant="secondary" busy={fetching} onClick={() => void runFetch()}>
              Fetch now
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(true)}>
              Remove account
            </Button>
          </>
        }
      />

      <Tabs
        ariaLabel="Account sections"
        active={tab}
        onChange={(next) => goToAccount(accountId, next)}
        tabs={[
          { id: "dashboard", label: "Dashboard" },
          { id: "milestones", label: "Milestones", badge: data.milestones.length },
          { id: "changes", label: "Changes", badge: pending },
          { id: "history", label: "History" },
        ]}
      />

      <div className="tab-panel">
        {!data.hasData ? (
          <ErrorBanner message="This account has not been fetched yet. Select Fetch now to capture a baseline." />
        ) : null}
        {tab === "dashboard" ? <AccountDashboardTab milestones={data.milestones} /> : null}
        {tab === "milestones" ? <MilestoneTable milestones={data.milestones} /> : null}
        {tab === "changes" ? (
          <ChangesTab
            since={data.since}
            reviewedThrough={data.reviewedThrough}
            hasRuns={data.runs.length > 0}
            onMarkReviewed={async () => {
              await markReviewed();
              notify("Marked as reviewed.", "positive");
              void refreshOverview();
            }}
          />
        ) : null}
        {tab === "history" ? <HistoryTab runs={data.runs} /> : null}
      </div>

      {removing ? (
        <RemoveAccountDialog
          account={data.account}
          onCancel={() => setRemoving(false)}
          onRemoved={() => {
            notify(`${data.account.name} removed from the portfolio.`, "positive");
            void refreshOverview();
            navigate({ name: "portfolio" });
          }}
        />
      ) : null}
    </div>
  );
}
