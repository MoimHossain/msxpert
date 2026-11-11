import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountState } from "../../../shared/types";
import { useLoadedAppData, useAppData } from "../../state/AppDataProvider";
import { useNavigation } from "../../state/NavigationProvider";
import { useToast } from "../../state/ToastProvider";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";
import { Badge } from "../ui/Badge";
import { ChangesTab } from "../account/ChangesTab";
import { formatNumber } from "../../lib/format";

export function AllChangesView() {
  const { overview } = useLoadedAppData();
  const { refreshOverview } = useAppData();
  const { goToAccount } = useNavigation();
  const { notify } = useToast();

  const activeAccounts = useMemo(
    () => overview.accounts.filter((account) => account.pendingChanges > 0),
    [overview.accounts],
  );
  const quietAccounts = useMemo(
    () => overview.accounts.filter((account) => account.pendingChanges === 0),
    [overview.accounts],
  );
  const activeIds = useMemo(() => activeAccounts.map((a) => a.id), [activeAccounts]);

  const [states, setStates] = useState<Record<string, AccountState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const nextStates: Record<string, AccountState> = {};
    const nextErrors: Record<string, string> = {};
    await Promise.all(
      activeIds.map(async (id) => {
        try {
          nextStates[id] = await window.desktop.getAccountState(id);
        } catch (error) {
          nextErrors[id] = error instanceof Error ? error.message : String(error);
        }
      }),
    );
    setStates(nextStates);
    setErrors(nextErrors);
    setLoading(false);
    // Depends on the id list content, not the array identity, to avoid refetch loops.
  }, [activeIds.join(",")]);

  useEffect(() => {
    void load();
  }, [load]);

  const markReviewed = async (accountId: string) => {
    await window.desktop.markReviewed(accountId);
    notify("Marked as reviewed.", "positive");
    await refreshOverview();
    await load();
  };

  return (
    <div>
      <PageHeader
        title="All changes"
        subtitle="Accounts with outstanding milestone changes since your last review."
        actions={
          <Button variant="secondary" busy={loading} onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {overview.accounts.length === 0 ? (
        <EmptyState
          title="No customers tracked yet"
          description="Add a customer from the Portfolio page to start seeing changes here."
        />
      ) : loading && Object.keys(states).length === 0 ? (
        <Spinner label="Loading changes across your portfolio..." />
      ) : activeAccounts.length === 0 ? (
        <EmptyState
          title="No outstanding changes"
          description="Every tracked account has been reviewed since its most recent fetch."
        />
      ) : (
        <div className="all-changes-list">
          {activeAccounts.map((account) => {
            const accountState = states[account.id];
            const accountError = errors[account.id];
            return (
            <details key={account.id} className="account-changes-panel" open>
              <summary>
                <span className="account-changes-title">{account.name}</span>
                <Badge tone="info">{formatNumber(account.pendingChanges)} changes</Badge>
                <button
                  type="button"
                  className="link-button"
                  onClick={(event) => {
                    event.preventDefault();
                    goToAccount(account.id, "changes");
                  }}
                >
                  Open account
                </button>
              </summary>
              {accountError ? (
                <p className="field-error" role="alert">
                  {accountError}
                </p>
              ) : accountState ? (
                <ChangesTab
                  since={accountState.since}
                  reviewedThrough={accountState.reviewedThrough}
                  hasRuns={accountState.runs.length > 0}
                  onMarkReviewed={() => markReviewed(account.id)}
                />
              ) : (
                <Spinner label="Loading..." />
              )}
            </details>
            );
          })}
        </div>
      )}

      {quietAccounts.length > 0 ? (
        <details className="quiet-accounts">
          <summary>{quietAccounts.length} account(s) with no outstanding changes</summary>
          <ul>
            {quietAccounts.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => goToAccount(account.id)}
                >
                  {account.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
