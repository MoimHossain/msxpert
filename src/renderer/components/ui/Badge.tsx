import type { ReactNode } from "react";
import type { Tone } from "../../lib/status";
import { classNames } from "../../lib/format";

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

/** Tone always pairs with an icon glyph or text so status is never color-only. */
const TONE_GLYPH: Record<Tone, string> = {
  positive: "\u25CF",
  warning: "\u25B2",
  critical: "\u25A0",
  info: "\u25C6",
  neutral: "\u25CB",
};

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span className={classNames("badge", `badge-${tone}`, className)}>
      <span aria-hidden="true" className="badge-glyph">
        {TONE_GLYPH[tone]}
      </span>
      {children}
    </span>
  );
}
