import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AccountOverview,
  MilestoneRow,
} from "../../../shared/types";
import { useLoadedAppData, useAppData } from "../../state/AppDataProvider";
import { useNavigation } from "../../state/NavigationProvider";
import { useToast } from "../../state/ToastProvider";
import { PageHeader } from "../ui/PageHeader";
import { StatCard, StatGroup } from "../ui/StatCard";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";
import { ErrorBanner } from "../ui/ErrorBanner";
import { MilestoneTable } from "../account/MilestoneTable";
import { AccountCard } from "./AccountCard";
import { AddAccountModal } from "./AddAccountModal";
import { RemoveAccountDialog } from "./RemoveAccountDialog";
import {
  formatCurrency,
  formatNumber,
  lastRunLabel,
} from "../../lib/format";
import {
  failedAccountCount,
  isFailed,
  isStale,
  staleAccountCount,
} from "../../lib/portfolioMetrics";

const ALL_SENTINEL = "__all__";

type PortfolioDrilldown =
  | "accounts"
  | "milestones"
  | "onTrack"
  | "atRisk"
  | "blocked"
  | "committed"
  | "uncommitted"
  | "monthlyUse"
  | "owners"
  | "stale"
  | "failed"
  | "unreviewed";

const MILESTONE_DRILLDOWNS = {
  milestones: { title: "All portfolio milestones", filters: {} },
  onTrack: { title: "On track milestones", filters: { status: "On Track" } },
  atRisk: { title: "At risk milestones", filters: { status: "At Risk" } },
  blocked: { title: "Blocked milestones", filters: { status: "Blocked" } },
  committed: { title: "Committed milestones", filters: { commitment: "Committed" } },
  uncommitted: {
    title: "Uncommitted milestones",
    filters: { commitment: "Uncommitted" },
  },
  monthlyUse: { title: "Monthly use by milestone", filters: {} },
  owners: { title: "Milestones by owner", filters: {} },
} as const;

export function PortfolioView() {
  const { overview } = useLoadedAppData();
  const { refreshOverview } = useAppData();
  const { goToAccount } = useNavigation();
  const { notify } = useToast();

  const [showAddModal, setShowAddModal] = useState(false);
  const [removingAccount, setRemovingAccount] = useState<AccountOverview | null>(null);
  const [activeFetch, setActiveFetch] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<PortfolioDrilldown | null>(null);
  const [portfolioMilestones, setPortfolioMilestones] =
    useState<MilestoneRow[] | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [territoriesLoading, setTerritoriesLoading] = useState(false);
  const [territoriesError, setTerritoriesError] = useState<string | null>(null);
  const missingTerritories = overview.accounts.some((account) => account.territory === undefined);
  const loadTerritories = useCallback(async () => {
    setTerritoriesLoading(true);
    setTerritoriesError(null);
    try {
      await window.desktop.refreshAccountTerritories();
      await refreshOverview();
    } catch (error) {
      setTerritoriesError(error instanceof Error ? error.message : String(error));
    } finally { setTerritoriesLoading(false); }
  }, [refreshOverview]);

  useEffect(() => {
    if (missingTerritories) void loadTerritories();
  }, [missingTerritories, loadTerritories]);

  const territoryGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; accounts: AccountOverview[] }>();
    for (const account of overview.accounts) {
      const id = account.territory?.id ?? (account.territory === undefined ? "not-loaded" : "unassigned");
      const name = account.territory?.name ?? (account.territory === undefined ? "Territory not loaded" : "No territory assigned");
      const group = groups.get(id) ?? { id, name, accounts: [] };
      group.accounts.push(account);
      groups.set(id, group);
    }
    return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [overview.accounts]);

  const totals = useMemo(() => {
    const committed = overview.accounts.reduce((sum, account) => sum + account.committed, 0);
    const uncommitted = overview.accounts.reduce(
      (sum, account) => sum + account.uncommitted,
      0,
    );
    const owners = overview.accounts.reduce((sum, account) => sum + account.owners, 0);
    const onTrack = overview.accounts.reduce((sum, account) => sum + account.onTrack, 0);
    return { committed, uncommitted, owners, onTrack };
  }, [overview.accounts]);

  const openDrilldown = async (next: PortfolioDrilldown) => {
    if (drilldown === next) {
      setDrilldown(null);
      return;
    }
    setDrilldown(next);
    setDrilldownError(null);
    if (!(next in MILESTONE_DRILLDOWNS) || portfolioMilestones) return;

    setDrilldownLoading(true);
    try {
      const dataset = await window.desktop.getMilestones();
      setPortfolioMilestones(dataset.milestones);
    } catch (error) {
      setDrilldownError(error instanceof Error ? error.message : String(error));
    } finally {
      setDrilldownLoading(false);
    }
  };

  const drilldownAccounts = useMemo(() => {
    switch (drilldown) {
      case "stale":
        return overview.accounts.filter(isStale);
      case "failed":
        return overview.accounts.filter(isFailed);
      case "unreviewed":
        return overview.accounts.filter((account) => account.pendingChanges > 0);
      default:
        return overview.accounts;
    }
  }, [drilldown, overview.accounts]);

  const accountDrilldownTitle =
    drilldown === "stale"
      ? "Stale accounts"
      : drilldown === "failed"
        ? "Failed refreshes"
        : drilldown === "unreviewed"
          ? "Accounts with unreviewed changes"
          : "Portfolio accounts";

  const runFetch = async (accountId?: string) => {
    setActiveFetch(accountId ?? ALL_SENTINEL);
    try {
      const result = await window.desktop.fetchAccounts(accountId);
      const failed = result.accounts.filter((entry) => !entry.ok);
      if (failed.length > 0) {
        notify(
          `${result.accounts.length - failed.length} of ${result.accounts.length} accounts refreshed. Failed: ${failed
            .map((entry) => entry.name)
            .join(", ")}`,
          "warning",
        );
      } else {
        notify(`Refreshed ${result.accounts.length} account(s) successfully.`, "positive");
      }
      await refreshOverview();
      setPortfolioMilestones(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "critical");
    } finally {
      setActiveFetch(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Portfolio"
        subtitle={`Scope: ${overview.scope.label} (${overview.scope.dateFrom} to ${overview.scope.dateTo})`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(true)}>
              Add customer
            </Button>
            <Button
              variant="primary"
              busy={activeFetch === ALL_SENTINEL}
              disabled={activeFetch !== null && activeFetch !== ALL_SENTINEL}
              onClick={() => void runFetch()}
            >
              Fetch all
            </Button>
          </>
        }
      />

      <div className="portfolio-summary-grid">
        <StatGroup title="Portfolio overview" subtitle="Your accounts, people and consumption" tone="info">
          <StatCard compact label="Accounts" value={formatNumber(overview.accounts.length)} tone="info" onClick={() => void openDrilldown("accounts")} active={drilldown === "accounts"} />
          <StatCard compact label="Owners" value={formatNumber(totals.owners)} tone="info" onClick={() => void openDrilldown("owners")} active={drilldown === "owners"} />
          <StatCard compact label="Milestones" value={formatNumber(overview.totals.milestones)} onClick={() => void openDrilldown("milestones")} active={drilldown === "milestones"} />
          <StatCard compact className="stat-metric-wide" label="Monthly use" value={formatCurrency(overview.totals.monthlyUse)} onClick={() => void openDrilldown("monthlyUse")} active={drilldown === "monthlyUse"} />
        </StatGroup>
        <StatGroup title="Delivery &amp; commitment" subtitle="Milestone health and pipeline coverage" tone="positive">
          <StatCard compact label="On track" value={formatNumber(totals.onTrack)} tone="positive" onClick={() => void openDrilldown("onTrack")} active={drilldown === "onTrack"} />
          <StatCard compact label="At risk" value={formatNumber(overview.totals.atRisk)} tone="warning" onClick={() => void openDrilldown("atRisk")} active={drilldown === "atRisk"} />
          <StatCard compact label="Blocked" value={formatNumber(overview.totals.blocked)} tone="critical" onClick={() => void openDrilldown("blocked")} active={drilldown === "blocked"} />
          <StatCard compact className="stat-metric-half" label="Committed" value={formatNumber(totals.committed)} tone="info" onClick={() => void openDrilldown("committed")} active={drilldown === "committed"} />
          <StatCard compact className="stat-metric-half" label="Uncommitted" value={formatNumber(totals.uncommitted)} tone="warning" onClick={() => void openDrilldown("uncommitted")} active={drilldown === "uncommitted"} />
        </StatGroup>
        <StatGroup title="Needs attention" subtitle="Data freshness and your review queue" tone="warning">
          <StatCard compact
            label="Stale accounts"
            value={formatNumber(staleAccountCount(overview.accounts))}
            tone={staleAccountCount(overview.accounts) > 0 ? "warning" : "neutral"}
            onClick={() => void openDrilldown("stale")}
            active={drilldown === "stale"}
          />
          <StatCard compact
            label="Failed refreshes"
            value={formatNumber(failedAccountCount(overview.accounts))}
            tone={failedAccountCount(overview.accounts) > 0 ? "critical" : "neutral"}
            onClick={() => void openDrilldown("failed")}
            active={drilldown === "failed"}
          />
          <StatCard compact
            label="Unreviewed changes"
            value={formatNumber(overview.totals.pendingChanges)}
            tone={overview.totals.pendingChanges > 0 ? "info" : "neutral"}
            onClick={() => void openDrilldown("unreviewed")}
            active={drilldown === "unreviewed"}
          />
          <p className="stat-group-note">Stale: no successful fetch in 14+ days.</p>
        </StatGroup>
      </div>

      {drilldown ? (
        <section className="metric-drilldown" aria-live="polite">
          <div className="metric-drilldown-header">
            <div>
              <h2>
                {drilldown in MILESTONE_DRILLDOWNS
                  ? MILESTONE_DRILLDOWNS[
                      drilldown as keyof typeof MILESTONE_DRILLDOWNS
                    ].title
                  : accountDrilldownTitle}
              </h2>
              <p>Sortable, filterable source data for the selected dashboard metric.</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setDrilldown(null)}>
              Close
            </button>
          </div>
          {drilldown in MILESTONE_DRILLDOWNS ? (
            drilldownLoading ? (
              <Spinner label="Loading portfolio milestones..." />
            ) : drilldownError ? (
              <p className="field-error" role="alert">{drilldownError}</p>
            ) : portfolioMilestones ? (
              <MilestoneTable
                key={drilldown}
                milestones={portfolioMilestones}
                initialFilters={
                  MILESTONE_DRILLDOWNS[
                    drilldown as keyof typeof MILESTONE_DRILLDOWNS
                  ].filters
                }
              />
            ) : null
          ) : drilldownAccounts.length === 0 ? (
            <EmptyState
              title={`No ${accountDrilldownTitle.toLowerCase()}`}
              description="There are no portfolio accounts matching this metric."
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>TPID</th>
                    <th>Milestones</th>
                    <th>At risk</th>
                    <th>Blocked</th>
                    <th>Unreviewed</th>
                    <th>Last refresh</th>
                    <th><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {drilldownAccounts.map((account) => (
                    <tr key={account.id}>
                      <td>{account.name}</td>
                      <td>{account.tpid}</td>
                      <td>{formatNumber(account.milestones)}</td>
                      <td>{formatNumber(account.atRisk)}</td>
                      <td>{formatNumber(account.blocked)}</td>
                      <td>{formatNumber(account.pendingChanges)}</td>
                      <td>{lastRunLabel(account.lastRun)}</td>
                      <td>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            goToAccount(
                              account.id,
                              drilldown === "unreviewed" ? "changes" : "dashboard",
                            )
                          }
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {overview.accounts.length === 0 ? (
        <EmptyState
          title="No customers tracked yet"
          description="Add a customer to start fetching MSX milestones for your portfolio."
          action={
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              Add your first customer
            </Button>
          }
        />
      ) : (
        <section className="portfolio-accounts" aria-labelledby="portfolio-accounts-heading">
          <div className="portfolio-accounts-heading">
            <div>
              <p className="section-eyebrow">Customer workspace</p>
              <h2 id="portfolio-accounts-heading">Accounts by territory</h2>
              <p>Top-parent accounts grouped by their MSX territory. Territory names can be selected and copied.</p>
            </div>
            <span className="territory-account-count">{formatNumber(overview.accounts.length)} accounts</span>
          </div>
          {territoriesLoading ? <Spinner label="Loading account territories..." /> : null}
          {territoriesError ? <ErrorBanner message={`Account territories could not be loaded. ${territoriesError}`} onRetry={() => void loadTerritories()} /> : null}
          {territoryGroups.map((group) => (
            <section className="territory-account-group" key={group.id} aria-label={group.name}>
              <div className="territory-account-heading">
                <h3 className="territory-name" title="Select and copy this territory name">{group.name}</h3>
                <span className="territory-account-count">{formatNumber(group.accounts.length)} {group.accounts.length === 1 ? "account" : "accounts"}</span>
              </div>
              <div className="account-grid">
                {group.accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onOpen={() => goToAccount(account.id)}
                    onFetch={() => void runFetch(account.id)}
                    onRemove={() => setRemovingAccount(account)}
                    fetching={activeFetch === account.id || activeFetch === ALL_SENTINEL}
                  />
                ))}
              </div>
            </section>
          ))}
        </section>
      )}

      {showAddModal ? (
        <AddAccountModal
          existingAccounts={overview.accounts}
          onClose={() => setShowAddModal(false)}
          onAdded={(account) => {
            notify(`${account.name} added. Baseline captured.`, "positive");
            void refreshOverview();
          }}
          onOpenExisting={(accountId) => goToAccount(accountId)}
        />
      ) : null}

      {removingAccount ? (
        <RemoveAccountDialog
          account={removingAccount}
          onCancel={() => setRemovingAccount(null)}
          onRemoved={() => {
            notify(`${removingAccount.name} removed from the portfolio.`, "positive");
            setRemovingAccount(null);
            void refreshOverview();
          }}
        />
      ) : null}
    </div>
  );
}
