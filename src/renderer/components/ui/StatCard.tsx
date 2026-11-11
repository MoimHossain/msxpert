import type { ReactNode } from "react";
import { classNames } from "../../lib/format";
import type { Tone } from "../../lib/status";

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

  return onClick ? (
    <button type="button" className={classes} onClick={onClick} aria-pressed={active}>
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  );
}
