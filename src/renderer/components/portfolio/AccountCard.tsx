import type { MouseEvent } from "react";
import type { AccountOverview } from "../../../shared/types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { formatCurrency, formatNumber, lastRunLabel } from "../../lib/format";
import { isFailed, isStale } from "../../lib/portfolioMetrics";

interface AccountCardProps {
  account: AccountOverview;
  onOpen: () => void;
  onFetch: () => void;
  onRemove: () => void;
  fetching: boolean;
}

export function AccountCard({ account, onOpen, onFetch, onRemove, fetching }: AccountCardProps) {
  const stopAndRun = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.stopPropagation();
    action();
  };

  return (
    <article
      className="account-card account-card-clickable"
      role="link"
      tabIndex={0}
      aria-label={`Open ${account.name}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
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
        <div>
          <p className="stat-label">Monthly use</p>
          <p className="stat-value">{formatCurrency(account.monthlyUse)}</p>
        </div>
        <div>
          <p className="stat-label">Owners</p>
          <p className="stat-value">{formatNumber(account.owners)}</p>
        </div>
      </div>

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
            busy={fetching}
          >
            Fetch
          </Button>
          <Button variant="ghost" onClick={(event) => stopAndRun(event, onRemove)}>
            Remove
          </Button>
        </div>
      </div>
    </article>
  );
}
