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
  compact?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
  onClick,
  active = false,
  compact = false,
  className,
}: StatCardProps) {
  const content = (
    <>
      {!compact ? <span className="stat-icon" aria-hidden="true">{ICONS[tone]}</span> : null}
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </>
  );

  if (compact) {
    const classes = classNames("stat-metric", `stat-metric-${tone}`, active && "stat-metric-active", className);
    return onClick ? (
      <button type="button" className={classes} onClick={onClick} aria-pressed={active}>{content}</button>
    ) : <div className={classes}>{content}</div>;
  }

  const classes = classNames(
    "stat-card",
    `stat-card-${tone}`,
    onClick && "stat-card-clickable",
    active && "stat-card-active",
    className,
  );

  return (
    <Card className={classes}>
      {onClick ? (
        <button type="button" className="stat-card-action" onClick={onClick} aria-pressed={active}>{content}</button>
      ) : content}
    </Card>
  );
}

export function StatGroup({ title, subtitle, tone = "neutral", children }: {
  title: string;
  subtitle: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <Card role="region" className={classNames("stat-group", `stat-group-${tone}`)} aria-label={title}>
      <div className="stat-group-heading">
        <span className="stat-group-icon" aria-hidden="true">{ICONS[tone]}</span>
        <div><h2>{title}</h2><p>{subtitle}</p></div>
      </div>
      <div className="stat-group-metrics">{children}</div>
    </Card>
  );
}
