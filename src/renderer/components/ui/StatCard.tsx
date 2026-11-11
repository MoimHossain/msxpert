import type { ReactNode } from "react";
import { classNames } from "../../lib/format";
import type { Tone } from "../../lib/status";
import { Card } from "@fluentui/react-components";
import { ChartMultiple24Regular, CheckmarkCircle24Regular, ErrorCircle24Regular, Info24Regular, Warning24Regular } from "@fluentui/react-icons";

const ICONS = {
  neutral: <ChartMultiple24Regular />, positive: <CheckmarkCircle24Regular />,
  warning: <Warning24Regular />, critical: <ErrorCircle24Regular />, info: <Info24Regular />,
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}

export function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
  onClick,
  active = false,
}: StatCardProps) {
  const content = (
    <>
      <span className="stat-icon" aria-hidden="true">{ICONS[tone]}</span>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </>
  );

  const classes = classNames(
    "stat-card",
    `stat-card-${tone}`,
    onClick && "stat-card-clickable",
    active && "stat-card-active",
  );

  return (
    <Card className={classes}>
      {onClick ? (
        <button type="button" className="stat-card-action" onClick={onClick} aria-pressed={active}>{content}</button>
      ) : content}
    </Card>
  );
}
