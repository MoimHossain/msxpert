import type { MouseEvent } from "react";
import type { AccountOverview } from "../../../shared/types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { formatCurrency, formatNumber, lastRunLabel } from "../../lib/format";
import { isFailed, isStale } from "../../lib/portfolioMetrics";
import { FETCH_STAGE_LABELS, isAccountFetching, type AccountFetchProgress } from "../../../shared/fetch";

interface AccountCardProps {
  account: AccountOverview;
  onOpen: () => void;
  onFetch: () => void;
  onRemove: () => void;
  progress: AccountFetchProgress | undefined;
  fetchBusy: boolean;
}

export function AccountCard({ account, onOpen, onFetch, onRemove, progress, fetchBusy }: AccountCardProps) {
  const fetching = isAccountFetching(progress);
  const stopAndRun = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.stopPropagation();
    action();
  };

  return (
    <article
      className={`account-card account-card-clickable${fetching ? " account-card-fetching" : ""}`}
      role="link"
      tabIndex={0}
      aria-label={`Open ${account.name}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="account-card-header">
        <h2 className="account-card-title">{account.name}</h2>
        {account.pendingChanges > 0 ? (
          <Badge tone="info">{formatNumber(account.pendingChanges)} changes</Badge>
        ) : null}
      </div>
      <p className="account-card-meta">
        TPID {account.tpid} - {formatNumber(account.accountRecords)} accounts in tree
      </p>

      <div className="account-card-stats">
        <div>
          <p className="stat-label">Milestones</p>
          <p className="stat-value">{formatNumber(account.milestones)}</p>
        </div>
        <div>
          <p className="stat-label">At risk</p>
          <p className="stat-value">{formatNumber(account.atRisk)}</p>
        </div>
        <div>
          <p className="stat-label">Blocked</p>
          <p className="stat-value">{formatNumber(account.blocked)}</p>
        </div>
        <div className="account-card-monthly-use">
          <p className="stat-label">Monthly use</p>
          <p className="stat-value">{formatCurrency(account.monthlyUse)}</p>
        </div>
        <div>
          <p className="stat-label">Owners</p>
          <p className="stat-value">{formatNumber(account.owners)}</p>
        </div>
      </div>

      {fetching && progress ? <div className="account-card-progress">
        <div className="account-fetch-track" role="progressbar" aria-label={`Fetching ${account.name}`}
          aria-valuetext={`${FETCH_STAGE_LABELS[progress.stage]}: ${progress.milestones} milestones`}><span /></div>
        <small>{FETCH_STAGE_LABELS[progress.stage]}{progress.stage === "milestones" ? ` | ${formatNumber(progress.milestones)} found` : ""}</small>
      </div> : null}
      <div className="account-card-footer">
        <span className="account-card-run">
          {isFailed(account) ? (
            <Badge tone="critical">Last fetch failed</Badge>
          ) : isStale(account) ? (
            <Badge tone="warning">{lastRunLabel(account.lastRun)}</Badge>
          ) : (
            <Badge tone="positive">{lastRunLabel(account.lastRun)}</Badge>
          )}
        </span>
        <div className="account-card-actions">
          <Button
            variant="ghost"
            onClick={(event) => stopAndRun(event, onFetch)}
            disabled={fetchBusy}
          >
            Fetch
          </Button>
          <Button variant="ghost" disabled={fetchBusy} onClick={(event) => stopAndRun(event, onRemove)}>
            Remove
          </Button>
        </div>
      </div>
    </article>
  );
}
