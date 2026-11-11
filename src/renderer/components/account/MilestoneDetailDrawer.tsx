import type { ReactNode } from "react";
import type { NormalizedMilestone } from "../../../shared/types";
import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { formatDate, formatDateTime } from "../../lib/format";
import { statusTone, commitmentTone } from "../../lib/status";
import { isSafeExternalUrl } from "../../lib/url";

interface MilestoneDetailDrawerProps {
  milestone: NormalizedMilestone;
  onClose: () => void;
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fact-row">
      <dt>{label}</dt>
      <dd>{value ?? "-"}</dd>
    </div>
  );
}

export function MilestoneDetailDrawer({ milestone, onClose }: MilestoneDetailDrawerProps) {
  const openLink = (url: string | null) => {
    if (isSafeExternalUrl(url)) void window.desktop.openExternal(url);
  };

  return (
    <Modal
      title={milestone.name ?? milestone.number ?? "Milestone"}
      onClose={onClose}
      width="lg"
      footer={
        <Button variant="primary" onClick={() => openLink(milestone.url)}>
          Open in MSX
        </Button>
      }
    >
      <div className="milestone-detail-badges">
        <Badge tone={statusTone(milestone.status)}>{milestone.status ?? "Unknown status"}</Badge>
        <Badge tone={commitmentTone(milestone.commitment)}>
          {milestone.commitment ?? "No commitment"}
        </Badge>
      </div>
      <dl className="fact-grid">
        <Fact label="Milestone number" value={milestone.number} />
        <Fact label="Milestone date" value={formatDate(milestone.date)} />
        <Fact label="Status reason" value={milestone.statusReason} />
        <Fact label="Category" value={milestone.category} />
        <Fact label="Workload" value={milestone.workload} />
        <Fact label="Solution area" value={milestone.solutionArea} />
        <Fact label="Help needed" value={milestone.helpNeeded} />
        <Fact label="Azure region" value={milestone.azureRegion} />
        <Fact label="Azure capacity type" value={milestone.azureCapacityType} />
        <Fact label="Monthly use" value={milestone.monthlyUseFormatted ?? milestone.monthlyUse} />
        <Fact label="Non-recurring months" value={milestone.nonRecurringMonths} />
        <Fact label="Owner" value={milestone.ownerName} />
        <Fact label="Account" value={milestone.accountName} />
        <Fact
          label="Opportunity"
          value={
            milestone.opportunityName && isSafeExternalUrl(milestone.opportunityUrl) ? (
              <button
                type="button"
                className="link-button"
                onClick={() => openLink(milestone.opportunityUrl)}
              >
                {milestone.opportunityName}
              </button>
            ) : (
              milestone.opportunityName
            )
          }
        />
        <Fact label="Created" value={formatDateTime(milestone.createdOn)} />
        <Fact label="Modified" value={formatDateTime(milestone.modifiedOn)} />
        <Fact label="Modified by" value={milestone.modifiedByName} />
        <Fact
          label="Forecast comments"
          value={
            milestone.forecastComments ? (
              <span className="preserve-whitespace">{milestone.forecastComments}</span>
            ) : null
          }
        />
        <Fact
          label="Milestone comments"
          value={
            milestone.milestoneComments ? (
              <span className="preserve-whitespace">{milestone.milestoneComments}</span>
            ) : null
          }
        />
      </dl>
    </Modal>
  );
}
