import type { CSSProperties } from "react";
import type { BreakdownItem } from "../../lib/breakdown";
import { formatNumber } from "../../lib/format";

/** Allows the `--bar-pct` custom property alongside standard CSS properties. */
type BarStyle = CSSProperties & { "--bar-pct": string };

interface BreakdownListProps {
  title: string;
  items: BreakdownItem[];
}

export function BreakdownList({ title, items }: BreakdownListProps) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className="breakdown-card">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="field-hint">No data.</p>
      ) : (
        <ul className="breakdown-list">
          {items.map((item) => (
            <li key={item.label} className="breakdown-row">
              <span className="breakdown-label">{item.label}</span>
              <span
                className="breakdown-bar"
                style={
                  {
                    "--bar-pct": `${Math.round((item.count / max) * 100)}%`,
                  } as BarStyle
                }
              />
              <span className="breakdown-count">{formatNumber(item.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
