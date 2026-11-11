import type { ReactNode } from "react";
import { classNames } from "../../lib/format";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "error";
}

export function EmptyState({ title, description, action, tone = "neutral" }: EmptyStateProps) {
  return (
    <div className={classNames("empty-state", tone === "error" && "empty-state-error")}>
      <h3 className="empty-title">{title}</h3>
      {description ? <p className="empty-description">{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
